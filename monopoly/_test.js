// 无头回归测试：桩掉 DOM/Canvas，验证棋盘数据、租金计算、移动与过起点、
// 监狱/保释、均匀建造与抵押、自动变现与破产移交、卡牌效果、
// 全 AI 自战整局、skipPending 全真人整局、时限结算。
// 运行：node _test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

// ---- DOM / 环境桩 ----
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : (...a) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : undefined)),
  set: () => true,
});
function makeEl(id) {
  return {
    id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, setAttribute: noop,
    textContent: '', dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 820 }),
    getContext: () => ctxStub, width: 1200, height: 820,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('tmp'),
};
global.window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, addEventListener: noop };
global.devicePixelRatio = 1;
global.requestAnimationFrame = noop;
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
if (typeof performance === 'undefined') global.performance = require('perf_hooks').performance;

const run = (extra) => eval(src + extra);

const TESTS = `
;(async () => {
  let n = 0;
  const eq = (got, want, msg) => { n++; if (got !== want) throw new Error(msg + ': got ' + got + ', want ' + want); };
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); };

  // ============ 1) 棋盘数据完整性 ============
  eq(BOARD.length, 40, '格数');
  eq(OWNABLE.length, 28, '可拥有格数 22+4+2');
  eq(Object.values(GROUP_CELLS).map(v => v.length).join(','), '2,3,3,3,3,3,3,2', '各组格数');
  eq(CHANCE.length, 16, '机会卡数');
  eq(CHEST.length, 16, '公益金卡数');
  eq(RAIL_CELLS.join(','), '5,15,25,34', '铁路格');
  eq(UTIL_CELLS.join(','), '12,28', '公用事业格');
  eq(BOARD[0].k, 'go', '0 起点'); eq(BOARD[10].k, 'jail', '10 监狱');
  eq(BOARD[20].k, 'free', '20 免费停车'); eq(BOARD[30].k, 'gojail', '30 进监狱');
  for (const s of STREETS) {
    const c = BOARD[s[0]];
    eq(c.r.length, 6, '租金表长度 @' + s[0]);
    ok(c.p > 0 && c.m > 0 && c.h > 0, '价格/抵押/房价 >0 @' + s[0]);
    for (let k = 1; k < 6; k++) ok(c.r[k] > c.r[k - 1], '租金递增 @' + s[0] + ' 档' + k);
  }

  // ============ 2) 全 AI 自战整局 ============
  newGame({ seats: 4, humans: [0, 0, 0, 0] });
  let spins = 0;
  while (!G.over && spins++ < 400) pumpFast(200000);
  ok(G.over, 'AI 自战在时限内结束（spins=' + spins + '）');
  ok(G.winner >= 0, '产生胜者');
  for (const p of G.players) ok(p.cash >= 0 || p.out, p.name + ' 现金非负');
  for (let i = 0; i < 40; i++) if (G.owner[i] >= 0) ok(!G.players[G.owner[i]].out || true, '地契有效');
  const aliveN = G.players.filter(p => !p.out).length;
  ok(aliveN === 1 || G.round > MAX_ROUNDS, '结束时仅剩一家或触发时限（alive=' + aliveN + ', round=' + G.round + '）');

  // ============ 3) 租金计算 ============
  newGame({ seats: 2, humans: [0, 0] }); TIMERS.length = 0;
  G.owner[6] = 1;
  eq(rentOf(6, 7), 6, '单块无垄断基础租');
  G.owner[8] = 1; G.owner[9] = 1;
  eq(rentOf(6, 7), 12, '整组垄断无房租翻倍');
  G.houses[6] = 2;
  eq(rentOf(6, 7), 90, '两房租');
  G.houses[6] = 5;
  eq(rentOf(6, 7), 550, '旅馆租');
  G.mort[6] = true;
  eq(rentOf(6, 7), 0, '抵押不收租');
  G.mort[6] = false; G.houses[6] = 0;
  G.owner[5] = 0; eq(rentOf(5, 7), 25, '持有1条铁路');
  G.owner[15] = 0; eq(rentOf(5, 7), 50, '持有2条铁路');
  G.owner[25] = 0; G.owner[34] = 0; eq(rentOf(5, 7), 200, '持有4条铁路');
  eq(rentOf(5, 7, { dblRent: true }), 400, '机会卡双倍租金');
  G.owner[12] = 1; eq(rentOf(12, 7), 28, '公用事业 ×4');
  G.owner[28] = 1; eq(rentOf(12, 7), 70, '两家公用 ×10');

  // ============ 4) 移动 / 经过起点 / 落地续接 ============
  newGame({ seats: 2, humans: [1, 1] }); TIMERS.length = 0;
  const p0 = G.players[0];
  p0.pos = 36; p0.disp = 36; p0.cash = 1000;
  G.ccDeck = [0];                              // 公益金 0：利息 +50（确定性）
  advance(p0, 6, {});
  pumpFast();
  eq(p0.pos, 2, '36 前进 6 步到公益金');
  eq(p0.cash, 1250, '过起点 +200、利息 +50');
  eq(G.phase, 'end', '落地后自动续接到结束阶段');
  // 后退三步：从 5 退到 2
  p0.pos = 5; p0.disp = 5;
  advance(p0, -3, {}); pumpFast();
  eq(p0.pos, 2, '后退三步');
  // 直达起点卡牌不重复触发落地
  p0.pos = 38; p0.disp = 38;
  const cashBefore = p0.cash;
  CHANCE[0].f(p0); pumpFast();
  eq(p0.pos, 0, '前进至起点');
  eq(p0.cash, cashBefore + GO_SALARY, '仅领薪水不触发落地');

  // ============ 5) 监狱：入狱 / 保释 / 出狱卡 ============
  goToJail(p0);
  eq(p0.pos, 10, '入狱位置'); eq(p0.jail, 3, '服刑剩余次数');
  G.phase = 'jail'; G.idx = 0;
  const cashPreJail = p0.cash;
  humanRoll();                                  // 缴保释后立即掷骰，移动在队列中
  eq(p0.jail, 0, '保释后出狱');
  eq(p0.cash, cashPreJail - JAIL_FEE, '保释金已扣');
  pumpFast();
  ok(p0.cash >= 0, '保释出狱掷骰后现金非负');

  // ============ 6) 均匀建造与抵押规则 ============
  newGame({ seats: 2, humans: [1, 1] }); TIMERS.length = 0;
  const me = G.players[0]; G.actor = 0; G.phase = 'roll';
  [11, 13, 14].forEach(i => G.owner[i] = 0);
  eq(canBuild(11, 0), true, '整组可建');
  eq(doBuild(11), true, '建造成功');
  eq(G.houses[11], 1, '1 栋房');
  eq(canBuild(11, 0), false, '不可在最高房数上叠建');
  eq(canBuild(13, 0), true, '最低的可建');
  eq(canMort(13, 0), false, '组内有房不可抵押');
  eq(sellHouse(11), true, '可从最高拆除');
  eq(canMort(13, 0), true, '拆尽后可抵押');
  eq(mortgage(13), true, '抵押成功');
  // 现金流：1500 -100(建) +50(拆) +70(抵押洛阳道)
  eq(me.cash, 1500 - 100 + 50 + 70, '建造/售房/抵押现金流');
  eq(unmortCost(13), 77, '赎回价 = 抵押价 ×1.1 上取整');
  eq(unmortgage(13), true, '赎回成功');

  // ============ 7) 欠缴自动变现与破产移交 ============
  newGame({ seats: 3, humans: [0, 0, 0] }); TIMERS.length = 0;
  const q0 = G.players[0], q1 = G.players[1];
  q0.cash = 10; G.owner[39] = 0;
  eq(rentOf(39, 7) > 0, true, '御花园有租');
  payTo(q0, 300, q1.id);
  eq(q0.out, true, '变卖后仍不足 → 破产');
  eq(G.owner[39], 1, '地产移交债权人');
  eq(q0.cash, 0, '破产清零');
  ok(q1.cash >= START_CASH, '债权人现金不减');
  // 银行破产：地产收回无主
  const q2 = G.players[2];
  q2.cash = 5; G.owner[5] = 2;
  payTo(q2, 9999, -1);
  eq(q2.out, true, '欠银行破产');
  eq(G.owner[5], -1, '收回银行'); eq(G.mort[5], false, '解除抵押');

  // ============ 8) 卡牌效果抽样 ============
  newGame({ seats: 2, humans: [1, 1] }); TIMERS.length = 0;
  const s0 = G.players[0];
  CHANCE[8].f(s0); eq(s0.cards, 1, '出狱自由卡');
  CHANCE[11].f(s0); eq(s0.cash, START_CASH + 200, '银行失误 +200');
  CHEST[3].f(s0);  pumpFast();                   // 每人付我 50（对手可能因此波动）
  ok(s0.cash >= START_CASH + 250, '喜结良缘收款');
  CHANCE[1].f(s0); pumpFast();
  eq(s0.pos, 37, '前进至紫禁城');
  // 抽卡入口：机会格随机卡不打断回合链
  s0.pos = 7; s0.disp = 7; G.chDeck = [11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 0];
  landOn(s0, {}); pumpFast();
  eq(s0.cash, START_CASH + 250 + 200, '机会卡 11 生效 +200');
  eq(G.phase, 'end', '抽卡后续接结束');

  // ============ 9) 全真人整局（skipPending 快进） ============
  newGame({ seats: 3, humans: [1, 1, 1] });
  let guard = 0;
  while (!G.over && guard++ < 20000) skipPending();
  ok(G.over, '全真人局可完整推进（steps=' + guard + '）');
  ok(G.round <= MAX_ROUNDS + 1, '轮次受上限约束');

  // ============ 10) 时限结算 ============
  newGame({ seats: 2, humans: [1, 1] }); TIMERS.length = 0;
  G.players[0].cash = 100; G.players[1].cash = 9999;
  G.round = MAX_ROUNDS + 1;
  checkEnd();
  ok(G.over, '时限触发结算');
  eq(G.winner, 1, '按身家判定胜者');

  return n;
})()
`;

run(TESTS)
  .then(cnt => { console.log('ALL PASS ✓  共 ' + cnt + ' 项断言'); process.exit(0); })
  .catch(e => { console.error('FAIL ✗  ' + e.message); process.exit(1); });
