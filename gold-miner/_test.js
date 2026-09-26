// 无头回归测试：桩掉 DOM/Canvas，验证常量表与目标线取整、收爪速度/抓取半径/
// 碎岩锤概率曲线、摆爪边界与僵直、放爪命中/miss 边界、交付计分、神秘袋价值、
// 脱手、炸药时间惩罚、计时收尾宽限、过关/失败/通关判定、商店购买与携带、
// 纪录持久化、矿图确定性、以及 easy 难度开钱 Bot 五关整局模拟不变量。
// 运行：node _test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

// ---- DOM / 环境桩 ----
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : (...a) => undefined)),
  set: () => true,
});
function makeEl(id) {
  return {
    id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, setAttribute: noop,
    textContent: '', dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    getContext: () => ctxStub, width: 1200, height: 800,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl('game')),
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
  const eq = (got, want, msg) => { n++; if (got !== want) throw new Error(msg + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); };
  const close = (a, b, eps, msg) => { n++; if (Math.abs(a - b) > eps) throw new Error(msg + ': got ' + a + ', want ~' + b); };
  const fake = (k, dx, dy) => ({ def: DEFS[k], k, dx, dy, jit: 1, val: DEFS[k].value });
  const stepTo = (pred, maxSteps, msg) => { let s = 0; while (!pred() && s++ < maxSteps) update(DT); if (!pred()) throw new Error(msg || '超时未达到条件'); return s; };

  resize();
  eq(S, 1, 'S = 800/800 = 1');

  // ============ 1) 常量与数值表 ============
  eq(Object.keys(DEFS).length, 8, '8 种物');
  eq(DEFS.goldBig.value, 500, '大金块 500'); eq(DEFS.goldMid.value, 250, '中金 250');
  eq(DEFS.goldSmall.value, 100, '小金 100'); eq(DEFS.rockBig.value, 20, '大石 20');
  eq(DEFS.rockSmall.value, 11, '小石 11'); eq(DEFS.diamond.value, 600, '钻石 600');
  eq(DEFS.diamond.weight < DEFS.goldSmall.weight, true, '钻石比小金轻');
  eq(DEFS.rockBig.weight > DEFS.goldBig.weight, true, '大石最重');
  eq(TARGETS.length, MAXLV, '目标表与关卡数一致');
  for (let i = 1; i < TARGETS.length; i++) ok(TARGETS[i] > TARGETS[i - 1], '目标递增 @' + i);
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  ok(DIFFS.easy.time > DIFFS.normal.time && DIFFS.normal.time > DIFFS.hard.time, '限时递减');
  ok(DIFFS.easy.tmult < DIFFS.normal.tmult && DIFFS.normal.tmult < DIFFS.hard.tmult, '目标系数递增');
  for (const k of UPG_ORDER) { eq(UPGRADES[k].costs.length, 3, k + ' 三档定价'); for (let i = 1; i < 3; i++) ok(UPGRADES[k].costs[i] > UPGRADES[k].costs[i - 1], k + ' 价格递增'); }
  eq(HAMMER_CHANCE.join(','), '0,0.3,0.6,1', '碎岩概率表');

  // ============ 2) 目标线取整 ============
  G.diff = 'normal'; eq(targetFor(1), 500, '普通 1 关'); eq(targetFor(5), 6800, '普通 5 关');
  G.diff = 'easy';   eq(targetFor(1), 450, '简单 1 关 (425→450)'); eq(targetFor(3), 2400, '简单 3 关 (2380→2400)');
  G.diff = 'hard';   eq(targetFor(1), 600, '困难 1 关'); eq(targetFor(5), 8150, '困难 5 关 (8160→8150)');
  G.diff = 'normal';

  // ============ 3) 派生曲线 ============
  close(pullSpeed(1.9) * 2, pullSpeed(3.8) * 4, 1e-6, '速度与重量成反比');
  ok(pullSpeed(0.9) > pullSpeed(5.2), '钻石收得比大石快');
  const ps0 = pullSpeed(2); G.lv.speed = 2; close(pullSpeed(2), ps0 * 1.7, 1e-6, '绞盘 Lv2 = ×1.7');
  G.lv.speed = 3; ok(pullSpeed(2) > ps0 * 2, '绞盘满级 > ×2'); G.lv.speed = 0;
  const hr0 = hookRadius(); G.lv.magnet = 3; close(hookRadius(), hr0 * 2.35, 1e-6, '磁力 Lv3 = ×2.35'); G.lv.magnet = 0;
  G.lv.hammer = 0; eq(hammerChance(), 0, '无锤'); G.lv.hammer = 2; eq(hammerChance(), 0.6, '锤 Lv2'); G.lv.hammer = 0;

  // ============ 4) startGame 与矿图 ============
  startGame();
  eq(G.screen, 'play', '进入游戏'); eq(G.level, 1, '第 1 关'); eq(G.money, 0, '钱清零');
  eq(G.earned, 0, '得分清零'); eq(G.time, 60, '普通 60 秒'); eq(G.hook.st, 'idle', '爪待机');
  eq(G.finishing, false, '非收尾'); eq(G.items.length, 19, '第 1 关 19 件全放下');
  eq(G.decor.length, 46, '装饰碎石 46');
  eq(G.items.some(it => it.k === 'tnt'), false, '1 关无炸药');
  // 界内 + 不重叠
  for (const it of G.items) {
    const q = itemXY(it);
    ok(q.x - q.r > 0 && q.x + q.r < W, '物品横向在屏内 ' + it.k);
    ok(q.y > topY() && q.y + q.r < H, '物品纵向在屏内 ' + it.k);
  }
  for (let i = 0; i < G.items.length; i++) for (let j = i + 1; j < G.items.length; j++) {
    const a = G.items[i], b = G.items[j];
    ok(Math.hypot(a.dx - b.dx, a.dy - b.dy) >= a.def.r * a.jit + b.def.r * b.jit, '矿物互不重叠 ' + a.k + '/' + b.k);
  }
  // 确定性
  const snap = () => G.items.map(it => it.k + ':' + it.dx.toFixed(3) + ',' + it.dy.toFixed(3)).join('|');
  G.runSalt = 77; placeItems(3); const s1 = snap();
  placeItems(3); eq(snap(), s1, '同种子同布局');
  G.runSalt = 78; placeItems(3); ok(snap() !== s1, '换种子布局变化');
  // 关卡规划
  const p5 = levelPlan(5);
  eq(p5.goldBig, 4, '5 关 4 大金'); eq(p5.diamond, 3, '5 关 3 钻'); eq(p5.tnt, 4, '5 关 4 炸药'); eq(p5.bag, 1, '神秘袋 1');
  beginLevel(1); eq(G.items.length, 19, '重开 1 关');

  // ============ 5) 摆动与僵直 ============
  G.hook = { st: 'idle', len: 0, item: null }; G.angle = 0; G.adir = 1; G.time = 60; G.finishing = false; G.stun = 0;
  let flips = 0, prevDir = G.adir, maxAbs = 0;
  for (let i = 0; i < Math.round(12 / DT); i++) {
    update(DT);
    maxAbs = Math.max(maxAbs, Math.abs(G.angle));
    if (G.adir !== prevDir) { flips++; prevDir = G.adir; }
  }
  ok(maxAbs <= TH_MAX + 1e-9, '摆角不越界');
  close(maxAbs, TH_MAX, 1e-3, '摆幅打满');
  ok(flips >= 3 && flips <= 6, '12 秒折返 3~6 次: ' + flips);
  G.stun = 1; const aStun = G.angle;
  for (let i = 0; i < Math.round(0.5 / DT); i++) update(DT);
  eq(G.angle, aStun, '僵直期间不摆');
  fire(); eq(G.hook.st, 'idle', '僵直禁放爪');
  G.stun = 0; fire(); eq(G.hook.st, 'ext', '解除后可放');
  G.hook = { st: 'idle', len: 0, item: null };

  // ============ 6) 放爪命中大金块并交付 ============
  G.items = [fake('goldBig', 310, 400)]; G.angle = 0; G.adir = 1;
  fire();
  update(DT); close(G.hook.len, V_EXT * S * DT, 1e-6, '放爪步长');
  stepTo(() => G.hook.st !== 'ext', 1000, '应命中');
  eq(G.hook.st, 'ret', '命中后回收'); eq(G.hook.item && G.hook.item.k, 'goldBig', '抓到大金');
  eq(G.money, 0, '途中不计钱');
  const lenA = G.hook.len; update(DT);
  close(lenA - G.hook.len, pullSpeed(3.8) * DT, 1e-6, '带物收爪速度=拉速');
  stepTo(() => G.hook.st === 'idle', 6000, '应交付');
  eq(G.money, 500, '到账 500'); eq(G.earned, 500, '得分 500'); eq(G.items.length, 0, '矿物消失');
  ok(G.time < 60, '计时在走');

  // ============ 7) miss 出界空手回 ============
  G.items = []; G.angle = TH_MAX; G.adir = -1;
  fire();
  stepTo(() => G.hook.st === 'ret', 3000, '应到边界');
  const eA = G.hook.len; update(DT);
  close(eA - G.hook.len, V_EMPTY * S * DT, 1e-6, '空爪回收速度');
  stepTo(() => G.hook.st === 'idle', 3000, '应回位');
  eq(G.money, 500, '空手不计钱');

  // ============ 8) 岩石：无锤抓住 / 有锤砸碎 / 概率边界 ============
  G.items = [fake('rockSmall', 310, 300)]; G.lv.hammer = 0; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.st !== 'ext', 1000, '石被抓住');
  eq(G.hook.item.k, 'rockSmall', '无锤抓石');
  stepTo(() => G.hook.st === 'idle', 6000);
  eq(G.money, 511, '小石也值 11');
  G.items = [fake('rockBig', 310, 300)]; G.lv.hammer = 3; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.items.length === 0, 1000, '满级锤砸碎石头');
  eq(G.hook.item, null, '不抓碎石'); eq(G.hook.st, 'ext', '砸碎后继续放爪');
  ok(G.money === 511 && G.earned === 511, '砸碎不计钱');
  G.lv.hammer = 1; G.items = [fake('rockSmall', 310, 300)]; G.rng = () => 0.29; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.items.length === 0, 1000); eq(G.hook.item, null, 'roll<0.3 砸碎');
  G.items = [fake('rockSmall', 310, 300)]; G.rng = () => 0.31; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.st === 'ret', 1000); eq(G.hook.item.k, 'rockSmall', 'roll≥0.3 仍抓住');
  G.hook = { st: 'idle', len: 0, item: null }; G.lv.hammer = 0;

  // ============ 9) 神秘袋随机价值 ============
  G.items = [fake('bag', 310, 300)]; G.rng = () => 0; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.item, 1000);
  eq(G.hook.item.val, BAG_MIN, '袋下限 60');
  G.items = [fake('bag', 310, 300)]; G.rng = () => 0.999; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.item, 1000);
  eq(G.hook.item.val, BAG_MAX, '袋上限 450');
  for (const r of [0.2, 0.55, 0.87]) {
    G.items = [fake('bag', 310, 300)]; G.rng = () => r; G.angle = 0;
    G.hook = { st: 'idle', len: 0, item: null }; fire();
    stepTo(() => G.hook.item, 1000);
    ok(G.hook.item.val >= BAG_MIN && G.hook.item.val <= BAG_MAX && G.hook.item.val % 10 === 0, '袋值合法 ' + r);
  }

  // ============ 10) 脱手 ============
  const m0 = G.money;
  G.items = [fake('goldMid', 310, 420)]; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.item, 1000);
  fire();
  eq(G.hook.item, null, '脱手丢物'); eq(G.hook.st, 'ret', '空爪继续回');
  stepTo(() => G.hook.st === 'idle', 3000);
  eq(G.money, m0, '脱手不计钱');

  // ============ 11) 炸药：顶爆扣 5 秒 + 僵直 ============
  G.time = 60; G.finishing = false;
  G.hook = { st: 'ret', len: 200, item: fake('tnt', 310, 300) };
  deliver();
  eq(G.time, 55, '顶爆扣 5 秒');
  eq(G.stun, TNT_STUN, '爆炸僵直');
  ok(G.shake > 0, '屏幕震动');
  eq(G.money, m0, '炸药不给钱');
  G.hook = { st: 'idle', len: 0, item: null };
  G.hook = { st: 'ret', len: 50, item: fake('tnt', 310, 300) }; G.finishing = true;
  const t1 = G.time; deliver();
  eq(G.time, t1, '收尾后顶爆不再扣表');
  G.finishing = false; G.stun = 0;
  G.hook = { st: 'idle', len: 0, item: null };

  // ============ 12) 计时到点的收尾宽限与判定 ============
  // 12a 收尾中最后一抓入账 → 达标进商店
  startGame();
  G.money = 450; G.earned = 450;
  G.items = [fake('goldSmall', 310, 420)]; G.angle = 0;
  G.hook = { st: 'idle', len: 0, item: null }; fire();
  stepTo(() => G.hook.item, 1000);
  G.time = 0.3;
  stepTo(() => G.hook.st === 'idle', 3000);
  eq(G.screen, 'shop', '带物超时：收完再判');
  eq(G.money, 550, '最后一抓入账');
  // 12b 未达标 → 结算失败并写纪录
  G.screen = 'play'; G.money = 100; G.earned = 8888; G.time = 0.001; G.finishing = false;
  update(DT);
  eq(G.screen, 'over', '未达标判负');
  eq(G.newBest, true, '新纪录标记');
  eq(BEST[G.diff], 8888, '纪录=累计所得');
  const persisted = JSON.parse(store['goldminer.best.v1']);
  eq(persisted.normal, 8888, 'localStorage 落盘');
  // 12c 第 5 关达标 → 通关
  startGame();
  G.level = MAXLV; G.money = targetFor(MAXLV); G.earned = 20000;
  resolveEnd();
  eq(G.screen, 'win', '五关全过');
  eq(BEST[G.diff], 20000, '通关分入库');

  // ============ 13) 商店：购买/余额/满级/携带 ============
  startGame();
  G.money = 300; G.lv.speed = 0;
  eq(buyUpgrade('speed'), false, '钱不够不买'); eq(G.money, 300, '余额不动');
  G.money = 1000;
  eq(buyUpgrade('speed'), true, '买绞盘'); eq(G.money, 600, '扣 400'); eq(G.lv.speed, 1, '绞盘 Lv1');
  eq(buyUpgrade('speed'), false, 'Lv2 要 700 不够');
  G.lv.speed = 3; G.money = 99999;
  eq(buyUpgrade('speed'), false, '满级不再卖');
  G.lv.speed = 0;
  // 过关携带
  G.screen = 'shop'; G.level = 1; G.money = 2000; G.lv.magnet = 0;
  eq(buyUpgrade('magnet'), true, '买磁力爪'); eq(G.money, 1700, '扣 300');
  shopNext();
  eq(G.screen, 'play', '继续下一关'); eq(G.level, 2, '第 2 关');
  eq(G.time, 60, '计时重置'); eq(G.money, 1700, '钱携带'); eq(G.lv.magnet, 1, '升级携带');
  eq(G.finishing, false, '收尾标记复位');
  ok(G.items.some(it => it.k === 'tnt'), '2 关起有炸药');
  ok(G.items.some(it => it.k === 'diamond'), '有钻石');

  // ============ 14) 难度切换持久化 + 退出保分 ============
  doAction('diff:hard');
  eq(G.diff, 'hard', '切困难'); eq(store['goldminer.diff.v1'], 'hard', '难度落盘');
  startGame(); eq(G.time, 50, '困难 50 秒'); eq(targetFor(1), 600, '困难目标');
  doAction('diff:easy'); startGame();
  G.earned = 300; quitToMenu();
  eq(G.screen, 'menu', '退出回菜单'); eq(BEST.easy, 300, '退出也保分');
  loadDiff(); eq(G.diff, 'easy', 'loadDiff 恢复');

  // ============ 15) easy 开钱 Bot 整局五关模拟 ============
  BEST.easy = 0;
  doAction('diff:easy'); startGame();
  G.money = 400; G.earned = 400;  // 兜底首关目标 450
  let iter = 0, maxIter = Math.ceil(700 / DT);
  let bought = false;
  while (iter++ < maxIter && (G.screen === 'play' || G.screen === 'shop')) {
    update(DT);
    if (G.screen === 'play' && G.hook.st === 'idle' && !G.finishing) fire();
    if (G.screen === 'shop') {
      if (!bought) { G.money += 1000; eq(buyUpgrade('speed'), true, 'Bot 商店买绞盘'); bought = true; }
      G.money = 999999;  // 开钱保证推进到通关路径
      shopNext();
      ok(G.time === DIFFS.easy.time, '每关计时重置');
    }
    if (iter % 900 === 0) {
      ok(G.money >= 0 && G.earned >= 0 && isFinite(G.money), 'money 非负');
      ok(G.time >= 0 && G.time <= DIFFS.easy.time + 1e-9, '计时界内');
      ok(isFinite(G.angle) && G.hook.len >= 0, '数值健康');
      for (const it of G.items) { const q = itemXY(it); ok(q.y > topY() - 1 && q.x > -1 && q.x < W + 1, '模拟中物品不越界'); }
    }
  }
  eq(G.screen, 'win', 'Bot 打满五关通关');
  eq(G.level, MAXLV, '终局关卡 5');
  eq(G.lv.speed, 1, '升级跨关保留');
  ok(BEST.easy >= G.earned, 'Bot 得分入库');
  ok(iter < maxIter, '整局在时限内结束: ' + (iter * DT | 0) + ' 秒模拟');

  console.log('ALL PASS (' + n + ' 断言)');
})();
`;

run(TESTS);
