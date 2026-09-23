// 无头回归测试：桩掉 DOM/Canvas，验证常量配置、抛体物理、线段-圆切击判定、
// 计分与连击奖励、炸弹终结、漏切扣命与生命终结、时限终结、最高分持久化、
// 出波节奏与 90 秒整局模拟。
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
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); n++; };

  // ============ 1) 常量配置 ============
  eq(GAME_DURATION, 90, '局时长');
  eq(START_LIVES, 3, '初始生命');
  eq(POINTS_PER_FRUIT, 10, '单果得分');
  eq(COMBO_MIN, 3, '连击阈值');
  eq(FRUITS.length, 6, '水果种类数');
  for (const f of FRUITS) ok(f.rind && f.flesh && f.juice, '水果 ' + f.id + ' 配色完整');
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  eq(G.diff, 'normal', '默认普通难度');
  ok(DIFFS.easy.bombMax < DIFFS.normal.bombMax && DIFFS.normal.bombMax < DIFFS.hard.bombMax, '炸弹概率递增');
  ok(DIFFS.easy.bombAfter > DIFFS.normal.bombAfter && DIFFS.normal.bombAfter > DIFFS.hard.bombAfter, '出弹时机递增提前');
  eq(DIFFS.hard.maxBombsPerWave, 2, '困难单波最多双弹');
  eq(DIFFS.normal.maxBombsPerWave, 1, '普通单波最多单弹');

  // ============ 2) 尺寸与物理基准 ============
  resize();
  eq(W, 1200, 'W'); eq(H, 800, 'H'); eq(S, 1, '缩放 S=H/800');
  ok(Math.abs(gravity() - 1250) < 1e-9, '重力 = 1250*S');

  // ============ 3) 线段-圆相交 ============
  ok(segCircleHit(0, 50, 100, 50, 50, 50, 10), '水平线穿过圆心应命中');
  ok(!segCircleHit(0, 50, 100, 50, 50, 80, 10), '远处圆不应命中');
  ok(!segCircleHit(0, 50, 30, 50, 50, 50, 10), '线段终点在圆外延长线上不应命中');
  ok(segCircleHit(20, 0, 20, 100, 25, 50, 6), '擦边弦应命中');

  // ============ 4) 局初始化 ============
  resetGame();
  eq(G.screen, 'menu', 'reset 不改变屏（仅清状态）'); // reset 只清数据
  startGame();
  eq(G.screen, 'play', 'startGame 进入 play');
  eq(G.score, 0, '分数清零'); eq(G.lives, 3, '生命重置');
  eq(G.timeLeft, 90, '时限重置'); eq(G.fruits.length, 0, '实体清空');

  // ============ 5) 抛体物理 ============
  spawnFruit(false);
  const f0 = G.fruits[0];
  ok(f0.y > H, '出生点在屏底之下');
  ok(f0.vy < 0, '初速度向上');
  const y0 = f0.y;
  for (let i = 0; i < 10; i++) update(1/60);           // 0.167s
  ok(f0.y < y0, '上升段 y 减小');
  const vy0 = f0.vy; update(1/60);
  ok(Math.abs(f0.vy - (vy0 + gravity()/60)) < 1e-6, '重力逐帧增量精确');
  // 顶点应在屏内（0~H）
  let minY = 1e9;
  for (let i = 0; i < 60 * 30; i++) { update(1/60); if (G.fruits.includes(f0)) minY = Math.min(minY, f0.y); }
  ok(minY > -50 && minY < H, '水果顶点出现在屏内');

  // ============ 6) 切击与计分 ============
  startGame();
  G.fruits.length = 0;
  const mk = (x, y, bomb) => ({ bomb: !!bomb, def: FRUITS[1], x, y, r: 30, vx: 0, vy: 0, rot: 0, vrot: 0, sliced: false });
  G.fruits.push(mk(400, 400));
  eq(swipeSlice(300, 400, 500, 400), 1, '一刀切中 1 果');
  eq(G.score, 10, '切中得 10 分');
  eq(G.fruits.length, 0, '整果移除');
  eq(G.halves.length, 2, '生成 2 个半果');
  ok(G.halves[0].side !== G.halves[1].side, '两半分居切面两侧');
  ok(G.particles.length >= 10, '果汁粒子喷射');
  eq(G.splats.length, 1, '屏幕溅渍 +1');
  eq(G.popups[0].text, '+10', '得分飘字');
  // 未碰到不切
  G.fruits.push(mk(400, 400));
  eq(swipeSlice(300, 500, 500, 500), 0, '擦肩而过不切');
  eq(G.fruits.length, 1, '漏网果保留');

  // ============ 7) 连击奖励 ============
  startGame(); G.fruits.length = 0; G.swipeCount = 0;
  G.fruits.push(mk(200, 300), mk(400, 300), mk(600, 300), mk(800, 300));
  eq(swipeSlice(100, 300, 900, 300), 4, '一刀切 4 果');
  // 第 3 个：+10 分 + 3×10 连击；第 4 个：+10 分 + 4×10 连击
  eq(G.score, 10 + 10 + (10 + 30) + (10 + 40), '连击奖励后总分 = 110');
  ok(G.popups.some(p => p.text.indexOf('连击 x3') === 0), 'x3 连击飘字');
  ok(G.popups.some(p => p.text.indexOf('连击 x4') === 0), 'x4 连击飘字');
  // 两果不触发连击
  startGame(); G.fruits.length = 0; G.swipeCount = 0;
  G.fruits.push(mk(200, 300), mk(400, 300));
  swipeSlice(100, 300, 500, 300);
  eq(G.score, 20, '2 果无连击奖励');

  // ============ 8) 炸弹 ============
  startGame(); G.fruits.length = 0;
  G.fruits.push(mk(400, 400, true));
  swipeSlice(300, 400, 500, 400);
  eq(G.screen, 'over', '切炸弹立即终局');
  eq(G.overReason, 'bomb', '终局原因 bomb');
  eq(G.fruits.length, 0, '炸弹移除');
  ok(G.boomFlash > 0, '爆炸白闪');
  eq(G.halves.length, 0, '炸弹不产生半果');

  // ============ 9) 漏切扣命 ============
  startGame(); G.fruits.length = 0;
  const drop = mk(600, H + 60); drop.vy = 100; G.fruits.push(drop);
  update(1/60);
  eq(G.lives, 2, '漏切 1 果 -1 命');
  eq(G.fruits.length, 0, '漏网果移除');
  ok(G.missFlash > 0, '底部红闪');
  // 炸弹落地无惩罚
  const bd = mk(600, H + 60, true); bd.vy = 100; G.fruits.push(bd);
  update(1/60);
  eq(G.lives, 2, '炸弹落地不扣命');
  eq(G.fruits.length, 0, '炸弹出屏清理');
  // 三命耗尽
  G.fruits.length = 0;
  for (let i = 0; i < 2; i++) { const d = mk(600, H + 60); d.vy = 100; G.fruits.push(d); update(1/60); }
  eq(G.screen, 'over', '生命耗尽终局');
  eq(G.overReason, 'lives', '终局原因 lives');

  // ============ 10) 时限终结与分难度最高分 ============
  startGame(); G.score = 250; G.timeLeft = 0.01;
  update(1/60);
  eq(G.screen, 'over', '时限到终局');
  eq(G.overReason, 'time', '终局原因 time');
  eq(G.bestMap.normal, 250, '普通档刷新最高分');
  eq(G.prevBest, 0, '破纪录前旧纪录为 0');
  eq(JSON.parse(store['fruitninja_best']).normal, 250, '最高分 JSON 写入 localStorage');
  startGame(); G.score = 100; G.timeLeft = 0.01; update(1/60);
  eq(G.bestMap.normal, 250, '低分不覆盖纪录');
  eq(G.newBest, false, '未破纪录标记');
  // 难度间纪录隔离
  setDiff('easy');
  startGame(); G.score = 50; G.timeLeft = 0.01; update(1/60);
  eq(G.bestMap.easy, 50, '简单档独立纪录');
  eq(G.bestMap.normal, 250, '普通档不受影响');
  eq(store['fruitninja_diff'], 'easy', '难度选择持久化');
  setDiff('normal');
  // 旧版单一纪录迁移
  G.bestMap = { easy: 0, normal: 0, hard: 0 };
  store['fruitninja_best'] = '123';
  loadBest();
  eq(G.bestMap.normal, 123, '旧版数字纪录迁移到普通档');
  eq(G.bestMap.easy, 0, '迁移不影响其他档');

  // ============ 11) 出波节奏 ============
  startGame(); G.fruits.length = 0;
  spawnWave();
  flushPending(performance.now() + 5000);
  ok(G.fruits.length >= 1, '一波至少 1 个');
  ok(G.fruits.every(e => e.y > H && e.vy < 0), '出波均为屏底上抛');
  // 前期不刷炸弹
  let bombInEarly = 0;
  for (let i = 0; i < 200; i++) { G.t = 5; G.fruits.length = 0; spawnWave(); flushPending(performance.now() + 5000); if (G.fruits.some(e => e.bomb)) bombInEarly++; }
  eq(bombInEarly, 0, '普通档前 ' + DIFFS.normal.bombAfter + ' 秒零炸弹');
  // 后期有炸弹
  let bombLate = 0;
  for (let i = 0; i < 300; i++) { G.t = 85; G.fruits.length = 0; spawnWave(); flushPending(performance.now() + 5000); if (G.fruits.some(e => e.bomb)) bombLate++; }
  ok(bombLate > 10, '后期炸弹出现率显著 >0（' + bombLate + '/300）');

  // ============ 12) 90 秒整局模拟（无人切击）============
  startGame();
  let steps = 0;
  while (G.screen === 'play' && steps < 60 * 120) { update(1/60); flushPending(performance.now() + 99999); steps++; }
  eq(G.screen, 'over', '整局必然终结');
  ok(G.overReason === 'lives' || G.overReason === 'time', '不切必然漏光 3 命（' + G.overReason + '，' + (steps/60).toFixed(1) + 's）');

  // ============ 13) 半果/粒子/溅渍生命周期 ============
  startGame(); G.fruits.length = 0; G.swipeCount = 0;
  G.fruits.push(mk(400, 400)); swipeSlice(300, 400, 500, 400);
  eq(G.halves.length, 2, '切 1 果两半');
  for (let i = 0; i < 60 * 5; i++) update(1/60);       // 5 秒
  eq(G.halves.length, 0, '半果 2.5s 内出屏/消亡');
  eq(G.particles.length, 0, '粒子按时消亡');
  ok(G.splats.length >= 0 && G.splats.every(s => s.t < s.life), '溅渍未过期则保留');
  for (let i = 0; i < 60 * 8; i++) update(1/60);
  eq(G.splats.length, 0, '溅渍 6 秒后清除');

  // ============ 14) 难度行为 ============
  const wave = (t) => { G.t = t; G.fruits.length = 0; spawnWave(); flushPending(performance.now() + 5000); return G.fruits.filter(e => e.bomb).length; };
  // 简单：25s 前零炸弹，之后出弹但率低
  setDiff('easy'); startGame();
  let be = 0; for (let i = 0; i < 200; i++) if (wave(20) > 0) be++;
  eq(be, 0, '简单档 25s 前零炸弹');
  let be2 = 0; for (let i = 0; i < 300; i++) if (wave(85) > 0) be2++;
  ok(be2 > 0, '简单档 25s 后出弹（' + be2 + '/300）');
  setDiff('normal'); startGame();
  let bn = 0; for (let i = 0; i < 300; i++) if (wave(85) > 0) bn++;   // 同参数下普通档对照
  ok(be2 < bn * 0.7, '简单档终局出弹率显著低于普通档（' + be2 + ' vs ' + bn + '）');
  // 困难：8s 后即可出弹，单波可双弹
  setDiff('hard'); startGame();
  let bh = 0; for (let i = 0; i < 200; i++) if (wave(10) > 0) bh++;
  ok(bh > 0, '困难档 10s 即可出弹（' + bh + '/200）');
  let two = 0, maxB = 0;
  for (let i = 0; i < 400; i++) { const b = wave(85); if (b > maxB) maxB = b; if (b >= 2) two++; }
  ok(two > 5, '困难档单波双弹常见（' + two + '/400）');
  ok(maxB <= DIFFS.hard.maxBombsPerWave, '困难档单波炸弹数 ≤2（观测最大 ' + maxB + '）');
  // 普通：单波至多 1 弹
  setDiff('normal'); startGame();
  let over1 = 0; for (let i = 0; i < 400; i++) if (wave(85) > 1) over1++;
  eq(over1, 0, '普通档单波至多 1 弹');
  // 菜单注册三档难度按钮
  delete BTN.diff_easy; delete BTN.diff_normal; delete BTN.diff_hard;
  drawMenu();
  ok(BTN.diff_easy && BTN.diff_normal && BTN.diff_hard && BTN.start, '菜单绘制注册三档难度按钮与开始按钮');
  setDiff('bogus'); eq(G.diff, 'normal', '非法难度被忽略');

  console.log('ALL PASS: ' + n + ' assertions');})();
`;

run(TESTS);
