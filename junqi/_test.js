// 无头回归测试：桩掉 DOM/Canvas，验证棋盘拓扑、随机布阵约束、裁判战斗表、
// 走法生成（大本营锁定/行营免疫/铁路滑行与阻挡/工兵转弯）、扛旗出局与团队胜负、
// 亮旗、AI 完整演示局与悔棋复原。
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1180, height: 800 }),
    getContext: () => ctxStub, width: 1180, height: 800,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('tmp'),
};
global.window = { devicePixelRatio: 1, addEventListener: noop };
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
  const eq = (got, want, msg) => { if (got !== want) throw new Error(msg + ': got ' + got + ', want ' + want); };

  // 1) 棋盘拓扑不变量
  eq(NODES.length, 129, '节点数');
  eq(EDGES.length, 288, '边数');
  let camps = 0, hqs = 0;
  for (const n of NODES) { if (n.kind === 1) camps++; if (n.kind === 2) hqs++; }
  eq(camps, 20, '行营总数 4×5');
  eq(hqs, 8, '大本营总数 4×2');
  for (const s of [0, 1, 2, 3])
    for (const [r, c] of [[2,2],[2,4],[3,3],[4,2],[4,4]])
      eq(NEIGH[nd(s, r, c)].length, 8, '行营(' + s + ',' + r + ',' + c + ')八通行');
  eq(RAIL_LINES.length, 24, '铁路直线数');
  const railEdge = {};
  for (const e of EDGES) if (e.rail) railEdge[Math.min(e.a, e.b) * 1024 + Math.max(e.a, e.b)] = 1;
  let badPairs = 0;
  for (const line of RAIL_LINES)
    for (let i = 0; i + 1 < line.length; i++)
      if (!railEdge[Math.min(line[i], line[i+1]) * 1024 + Math.max(line[i], line[i+1])]) badPairs++;
  eq(badPairs, 0, '每条直线相邻两点必须间有铁路边（含角弧）');

  // 2) 随机布阵约束（每方 25 子、构成、雷/弹/旗位置、行营留空）
  for (let rep = 0; rep < 20; rep++) for (const s of [0, 1, 2, 3]) {
    const lay = randomLayout(s);
    eq(lay.size, 25, '每方子数');
    const cnt = {};
    for (const [n, t] of lay) {
      const N = NODES[n];
      if (N.s !== s) throw new Error('布阵越界');
      if (N.kind === 1) throw new Error('行营必须留空');
      if (t === DILEI && N.r < 5) throw new Error('地雷只能在最后两排');
      if (t === ZHADAN && N.r === 1) throw new Error('炸弹不能放前线');
      cnt[t] = (cnt[t] || 0) + 1;
    }
    for (const [t, k] of PIECE_COUNTS) eq(cnt[t] || 0, k, PIECE_NAME[t] + ' 数量');
    let flagInHq = false;
    for (const [n, t] of lay) if (t === JUNQI && NODES[n].kind === 2) flagInHq = true;
    eq(flagInHq, true, '军旗必须在大本营');
  }

  // 3) 裁判战斗表
  const P = t => mkPiece(0, t), Q = t => mkPiece(1, t);
  eq(combat(P(SIMING), Q(JZHANG)).join(), 'true,false',   '司令吃军长');
  eq(combat(P(GONGBING), Q(SIMING)).join(), 'false,true', '工兵撞司令亡');
  eq(combat(P(SHIZHANG), Q(SHIZHANG)).join(), 'false,false', '同级同归');
  eq(combat(P(GONGBING), Q(DILEI)).join(), 'true,false',  '工兵挖雷');
  eq(combat(P(JZHANG), Q(DILEI)).join(), 'false,true',    '非工兵撞雷亡、雷不动');
  eq(combat(P(SIMING), Q(ZHADAN)).join(), 'false,false',  '司令踩炸弹同归');
  eq(combat(P(ZHADAN), Q(SIMING)).join(), 'false,false',  '炸弹炸司令同归');

  // 4) 走法生成
  const mk = list => { const b = new Array(NODES.length).fill(0); for (const [n, p] of list) b[n] = p; return b; };
  let b;
  // 大本营锁定：置于本阵大本营的司令寸步难行
  b = mk([[nd(0,6,2), P(SIMING)], [nd(2,1,3), Q(SIMING)]]);
  eq(legalMoves(b, 0).length, 0, '大本营之子永久锁定');
  // 行营免疫：行营内的敌子不可被攻击
  b = mk([[nd(0,2,3), P(SIMING)], [nd(0,3,3), Q(TUANZHANG)]]);
  eq(legalMoves(b, 0).some(m => m.to === nd(0,3,3)), false, '不可攻击行营内敌子');
  eq(legalMoves(b, 0).length > 0, true, '司令应有其余走法');
  // 队友阻挡且不可吃
  b = mk([[nd(0,1,2), P(SHIZHANG)], [nd(0,1,3), P(TUANZHANG)], [CN(2,2), Q(SIMING)]]);
  eq(legalMoves(b, 0).some(m => b[m.to] && pSide(b[m.to]) === 0), false, '不可吃己方/队友');
  // 铁路直线滑行：可进可退、可吃挡路敌子、不可隔子跳
  b = mk([[nd(0,1,2), P(TUANZHANG)], [nd(0,1,4), Q(SHIZHANG)], [nd(2,1,3), Q(SIMING)]]);
  const tm = new Set(legalMoves(b, 0).filter(m => m.from === nd(0,1,2)).map(m => m.to));
  eq(tm.has(nd(0,1,1)), true, '直线反向滑行');
  eq(tm.has(nd(0,1,3)), true, '滑到阻挡子前一格');
  eq(tm.has(nd(0,1,4)), true, '可吃掉挡路敌子');
  eq(tm.has(nd(0,1,5)), false, '不可隔子跳过');
  // 工兵铁路任意转弯：覆盖直线子全部落点且更多
  b = mk([[nd(0,1,2), P(GONGBING)], [nd(0,1,4), Q(SHIZHANG)], [nd(2,1,3), Q(SIMING)]]);
  const gm = new Set(legalMoves(b, 0).filter(m => m.from === nd(0,1,2)).map(m => m.to));
  eq([...tm].every(x => gm.has(x)), true, '工兵可达直线子的所有落点');
  eq(gm.has(CN(2,2)), true, '工兵经中央入口转弯可达九宫心');
  eq(tm.has(CN(2,2)), false, '普通铁路子不能转弯进九宫心');
  // 地雷/军旗永不移动：整盘只有雷旗则无走法
  b = mk([[nd(0,6,2), P(JUNQI)], [nd(0,6,1), P(DILEI)], [nd(2,1,3), Q(SIMING)]]);
  eq(legalMoves(b, 0).length, 0, '地雷与军旗永不移动');

  // 5) 扛旗出局 → 团队判负；司令阵亡亮旗
  startMatch('demo');
  const mkG = (list, alive) => {
    G.board = new Array(NODES.length).fill(0);
    for (const [n, p] of list) G.board[n] = p;
    G.alive = alive.slice(); G.reveal = [false, false, false, false];
    G.over = null; G.sel = -1; G.legal = []; G.snaps = []; G.log = []; G.ply = 0; G.noCap = 0;
  };
  // 西(3)已出局，东只剩一旗：扛旗瞬间东覆灭 → 队1 双亡 → 蓝黄队胜
  // （蓝另留一排长：扛旗子锁死在敌大本营，若无其余子会被"无子可动"判灭）
  mkG([[nd(1,5,2), P(SHIZHANG)], [nd(1,6,2), Q(JUNQI)], [nd(0,3,1), P(PAIZHANG)]], [true, true, false, false]);
  G.turn = 0;
  applyMove({ from: nd(1,5,2), to: nd(1,6,2) });
  eq(G.alive[1], false, '扛旗后东出局');
  eq(G.over && G.over.kind, 'win', '盟伴全灭即团队判负');
  eq(G.over.team, 0, '蓝黄队获胜');
  eq(G.board.some(p => p && pSide(p) === 1), false, '出局方子力全部移除');
  eq(G.board[nd(1,6,2)], mkPiece(0, SHIZHANG), '扛旗子存活于敌大本营');
  eq(G.board[nd(1,5,2)], 0, '扛旗子离开原位');
  // 司令阵亡亮旗
  mkG([[nd(0,2,3), P(ZHADAN)], [nd(0,1,3), Q(SIMING)], [nd(1,1,1), Q(GONGBING)]], [true, true, false, false]);
  G.turn = 0;
  eq(G.reveal[1], false, '亮旗前');
  applyMove({ from: nd(0,2,3), to: nd(0,1,3) });
  eq(G.reveal[1], true, '司令阵亡亮旗');

  // 6) AI 完整演示局：必须结束且终局合法
  DRAW_LIMIT = 80;
  startMatch('demo');
  let steps = 0;
  while (!G.over && steps < 1600) { G.anim = null; stepAiTurn(); steps++; }
  if (!G.over) throw new Error('演示局未在 ' + steps + ' 步内结束');
  eq(G.over.kind === 'win' || G.over.kind === 'draw', true, '终局类型');
  if (G.over.kind === 'win') {
    const lost = G.over.team === 0 ? [1, 3] : [0, 2];
    eq(G.alive[lost[0]] || G.alive[lost[1]], false, '败方两队皆出局');
  }
  eq(G.board.some(p => p && !G.alive[pSide(p)]), false, '出局方不留残子');
  console.log('AI 演示局：' + steps + ' 步，结果 ' + G.over.kind +
    (G.over.kind === 'win' ? '（' + (G.over.team === 0 ? '蓝黄' : '绿红') + '队胜）' : '') +
    '，战报 ' + G.log.length + ' 条');

  // 7) 悔棋：跨 AI 手回退到真人并完全复原
  startMatch('solo');
  const before = G.board.join(',');
  eq(G.turn, 0, '开局蓝先手');
  applyMove(legalMoves(G.board, 0)[0]);          // 真人走一子
  G.anim = null; stepAiTurn();                    // AI 应一手
  eq(G.turn !== 0, true, 'AI 走子后不在真人回合');
  doUndo();
  eq(G.board.join(',') === before, true, '悔棋完全复原盘面（含回退 AI 手）');
  eq(G.turn, 0, '悔棋回到真人回合');

  console.log('ALL PASS');
})().catch(e => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
`;

run(TESTS);
