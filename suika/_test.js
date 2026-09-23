// 无头回归测试：桩掉 DOM/Canvas，验证水果链常量与计分表、容器几何、
// 重力与落地静止、墙面夹取、同档合成/异档不合成、连锁合成、双西瓜消除、
// 投放冷却与瞄准夹取、危险线超时终局与危险衰减、分难度投放池、
// 分难度最高分持久化与旧版迁移、15 秒整局自动投放模拟与堆叠不变量。
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
  const DT = 1 / 120;
  const sim = (secs) => { for (let i = 0; i < Math.round(secs / DT); i++) update(DT); };
  // 将水果"钉"在危险线上悬停（模拟堆在山尖顶住不动），逐帧恢复位置后步进
  const pinLine = (e) => { e.y = deathY() - e.r + 2 * S; e.vy = 0; e.vx = 0; e.age = 5; };
  const simPinned = (secs, es) => { for (let i = 0; i < Math.round(secs / DT); i++) { for (const e of es) pinLine(e); update(DT); } };
  const inBox = (e) => e.x - e.r >= innerLeft() - 0.5 && e.x + e.r <= innerRight() + 0.5 && e.y + e.r <= floorY() + 0.5;

  // ============ 1) 水果链与计分表 ============
  eq(FRUITS.length, 11, '水果链 11 档');
  eq(FRUITS[0].id, 'cherry', '第 0 档樱桃');
  eq(FRUITS[10].id, 'watermelon', '第 10 档大西瓜');
  for (let i = 1; i < FRUITS.length; i++) ok(FRUITS[i].t > FRUITS[i - 1].t, '半径比例严格递增 @' + i);
  eq(SC(1), 3, '草莓 +3'); eq(SC(5), 21, '苹果 +21'); eq(SC(10), 66, '大西瓜 +66');
  eq(TOP_TIER, 10, 'TOP_TIER');
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  eq(G.diff, 'normal', '默认普通难度');
  ok(DIFFS.easy.maxTier < DIFFS.normal.maxTier && DIFFS.normal.maxTier < DIFFS.hard.maxTier, '投放池递增');

  // ============ 2) 容器几何 ============
  resize();
  eq(W, 1200, 'W'); eq(H, 800, 'H'); eq(S, 1, '缩放 S=H/800');
  ok(BOX.x > 0 && BOX.x + BOX.w < W, '容器水平居中在屏内');
  ok(deathY() > BOX.y && floorY() > deathY(), '危险线在容器内、地板之下');
  ok(fruitRadius(10) < BOX.w / 2, '大西瓜可放入容器');
  ok(fruitRadius(0) >= 11 * S, '最小半径夹取生效');

  // ============ 3) 开局与投放 ============
  startGame();
  eq(G.screen, 'play', '进入 play');
  eq(G.score, 0, '分数清零'); eq(G.fruits.length, 0, '实体清空');
  eq(G.danger, 0, '危险清零'); ok(G.cooldown > 0, '开局有短冷却');
  ok(G.current <= DIFFS[G.diff].maxTier && G.next <= DIFFS[G.diff].maxTier, '首发水果在难度池内');
  G.cooldown = 0; G.aimX = W / 2;
  const cur0 = G.current;
  eq(dropFruit(), true, '冷却结束可投放');
  eq(G.fruits.length, 1, '场上 1 个水果');
  eq(G.fruits[0].tier, cur0, '投放档位 = current');
  eq(G.fruits.length, 1, 'current 前进为 next（不新增实体）');
  eq(dropFruit(), false, '冷却内不可再投');
  // 瞄准夹取
  G.cooldown = 0; G.aimX = -9999; dropFruit();
  const el = G.fruits[G.fruits.length - 1];
  ok(Math.abs((el.x - el.r) - innerLeft()) < 1, '左边缘瞄准被夹取');
  G.cooldown = 0; G.aimX = 9999; dropFruit();
  const er = G.fruits[G.fruits.length - 1];
  ok(Math.abs((innerRight() - (er.x + er.r))) < 1, '右边缘瞄准被夹取');

  // ============ 4) 重力与落地 ============
  startGame();
  G.fruits.length = 0;
  const c = mkFruit(0, W / 2, BOX.y + 10, 0, 0);
  G.fruits.push(c);
  const vy0 = c.vy; sim(DT);
  ok(Math.abs(c.vy - (vy0 + gravity() * DT)) < 1e-6, '重力逐帧增量精确');
  sim(3);
  ok(Math.abs(c.y + c.r - floorY()) < 1.5, '樱桃 3 秒后落在地板上');
  ok(Math.abs(c.vy) < 40 * S, '落地后基本静止');
  ok(inBox(c), '落点合法在容器内');
  // 水平高速不穿墙
  c.vx = 6000 * S; sim(1);
  ok(inBox(c), '6000px/s 水平速度仍被墙夹住');

  // ============ 5) 同档合成 ============
  startGame();
  G.fruits.length = 0;
  const r0 = fruitRadius(0);
  G.fruits.push(mkFruit(0, W / 2 - r0 * 0.5, floorY() - r0, 0, 0));
  G.fruits.push(mkFruit(0, W / 2 + r0 * 0.5, floorY() - r0, 0, 0));
  sim(0.3);
  eq(G.fruits.length, 1, '两颗樱桃合成为一颗');
  eq(G.fruits[0].tier, 1, '合成后为草莓（tier 1）');
  eq(G.score, SC(1), '合成得分 +3');
  eq(G.mergedTotal, 1, '合成计数 1');

  // 异档只推开不合成
  startGame();
  G.fruits.length = 0;
  const r1 = fruitRadius(1);
  G.fruits.push(mkFruit(0, W / 2 - r1, floorY() - r0, 0, 0));
  G.fruits.push(mkFruit(1, W / 2 + r1 * 0.5, floorY() - r1, 0, 0));
  sim(1);
  eq(G.fruits.length, 2, '异档不合成');
  eq(G.score, 0, '异档不得分');
  const d5 = Math.hypot(G.fruits[0].x - G.fruits[1].x, G.fruits[0].y - G.fruits[1].y);
  ok(d5 >= (G.fruits[0].r + G.fruits[1].r) - 1, '异档重叠被位置修正推开（d=' + d5.toFixed(1) + '）');

  // ============ 6) 连锁合成 ============
  startGame();
  G.fruits.length = 0;
  const px = W / 2, py = floorY() - r0;
  G.fruits.push(mkFruit(0, px - r0 * 0.5, py, 0, 0));
  G.fruits.push(mkFruit(0, px + r0 * 0.5, py, 0, 0));
  G.fruits.push(mkFruit(1, px, py - r0 - r1 * 0.3, 0, 0));   // 上方预置一颗草莓
  eq(tryMergeAll(), 2, '单轮连锁合成 2 次');
  eq(G.fruits.length, 1, '连锁后剩 1 颗');
  eq(G.fruits[0].tier, 2, '连锁升到葡萄（tier 2）');
  eq(G.score, SC(1) + SC(2), '连锁总分 3+6=9');
  ok(G.popups.some(p => p.text.indexOf('连锁') === 0), '连锁飘字');

  // ============ 7) 双西瓜消除 ============
  startGame();
  G.fruits.length = 0;
  const rw = fruitRadius(10);
  G.fruits.push(mkFruit(10, W / 2 - rw * 0.4, floorY() - rw, 0, 0));
  G.fruits.push(mkFruit(10, W / 2 + rw * 0.4, floorY() - rw, 0, 0));
  sim(0.2);
  eq(G.fruits.length, 0, '双西瓜相碰双双消除');
  eq(G.score, DOUBLE_MELON_BONUS, '双瓜消除 +100');
  ok(G.confetti.length > 20, '双瓜彩带喷发');
  ok(G.popups.some(p => p.text.indexOf('双瓜消除') === 0), '双瓜飘字');

  // ============ 8) 危险线终局与衰减 ============
  startGame();
  G.fruits.length = 0;
  const bad = mkFruit(0, W / 2, 0, 0, 0);
  G.fruits.push(bad);
  simPinned(1, [bad]);
  ok(G.danger > 0.9 && G.screen === 'play', '越线 1 秒危险计时累积');
  simPinned(1.2, [bad]);
  eq(G.screen, 'over', '越线满 ' + DANGER_LIMIT + ' 秒终局');
  eq(G.overReason, 'overflow', '终局原因 overflow');
  ok(inBox(bad), '悬停水果仍在界内');
  // 危险衰减
  startGame();
  G.fruits.length = 0;
  const tmp = mkFruit(0, W / 2, 0, 0, 0);
  G.fruits.push(tmp);
  simPinned(0.5, [tmp]);
  ok(G.danger > 0, '先累积一点危险');
  G.fruits.length = 0;
  sim(0.5);
  eq(G.danger, 0, '移除越线水果后危险归零');
  eq(G.screen, 'play', '未及时满 2 秒不误杀');

  // ============ 9) 分难度投放池 ============
  setDiff('easy'); startGame();
  let seen = {};
  for (let i = 0; i < 400; i++) { const t = randomTier(); ok(t <= DIFFS.easy.maxTier, '简单池越界'); seen[t] = 1; }
  ok(Object.keys(seen).length >= 2, '简单池有多个档位');
  setDiff('normal');
  for (let i = 0; i < 400; i++) ok(randomTier() <= DIFFS.normal.maxTier, '普通池越界');
  setDiff('hard');
  let maxSeen = 0;
  for (let i = 0; i < 2000; i++) maxSeen = Math.max(maxSeen, randomTier());
  eq(maxSeen, DIFFS.hard.maxTier, '困难池能出到橙子');
  eq(store['suikadiff'], 'hard', '难度选择持久化');
  setDiff('bogus'); eq(G.diff, 'hard', '非法难度被忽略');
  setDiff('normal');

  // ============ 10) 最高分持久化与迁移 ============
  const overflowNow = () => { G.fruits.length = 0; const b = mkFruit(0, W / 2, 0, 0, 0); G.fruits.push(b); simPinned(2.5, [b]); };
  startGame(); G.score = 320; overflowNow();
  eq(G.screen, 'over', '再次终局');
  eq(G.bestMap.normal, 320, '普通档刷新最高分');
  eq(G.newBest, true, '破纪录标记');
  eq(JSON.parse(store['suikabest']).normal, 320, 'JSON 写入 localStorage');
  startGame(); G.score = 100; overflowNow();
  eq(G.bestMap.normal, 320, '低分不覆盖纪录');
  setDiff('easy'); startGame(); G.score = 50; overflowNow();
  eq(G.bestMap.easy, 50, '简单档独立纪录');
  eq(G.bestMap.normal, 320, '普通档不受影响');
  setDiff('normal');
  // 旧版单一数字纪录迁移
  G.bestMap = { easy: 0, normal: 0, hard: 0 };
  store['suikabest'] = '123';
  loadBest();
  eq(G.bestMap.normal, 123, '旧版数字纪录迁移到普通档');
  eq(G.bestMap.easy, 0, '迁移不影响其他档');

  // ============ 11) 整局自动投放模拟 ============
  startGame();
  let steps = 0, drops = 0;
  while (G.screen === 'play' && steps < 120 * 90) {
    if (Math.random() < 0.05) { G.cooldown = 0; G.aimX = rand(innerLeft(), innerRight()); dropFruit(); drops++; }
    update(DT); steps++;
    for (const e of G.fruits) {
      ok(inBox(e), '模拟中水果越界');
      for (const f of G.fruits) {
        if (f === e) continue;
        const d = Math.hypot(e.x - f.x, e.y - f.y);
        if (e.tier === f.tier && d < (e.r + f.r) + MERGE_PAD * S - 0.5) { throw new Error('同档接触未合成: d=' + d.toFixed(2)); }
      }
    }
  }
  eq(G.screen, 'over', '无策略整局必然溢出终局（' + (steps / 120).toFixed(1) + 's，' + drops + ' 投）');
  ok(G.mergedTotal > 5, '模拟中发生过合成（' + G.mergedTotal + ' 次）');
  ok(G.fruits.length < 80, '终局时水果数有限（' + G.fruits.length + '）');

  // ============ 12) 特效生命周期与菜单按钮 ============
  sim(3);   // over 屏继续跑
  eq(G.confetti.length, 0, '彩带按时消亡');
  eq(G.flashes.length, 0, '闪光按时消亡');
  for (let i = 0; i < 60; i++) update(DT);
  eq(G.popups.length, 0, '飘字按时消亡');
  G.screen = 'menu';
  delete BTN.start; delete BTN.diff_easy; delete BTN.diff_normal; delete BTN.diff_hard;
  drawScene();
  ok(BTN.start && BTN.diff_easy && BTN.diff_normal && BTN.diff_hard, '菜单注册开始与三档难度按钮');
  const againBefore = G.bestMap.normal;
  endGame('overflow'); endGame('overflow');
  eq(G.bestMap.normal, againBefore, '重复 endGame 幂等');

  // ============ 13) 对局中退出回菜单 ============
  setDiff('normal');
  G.bestMap = { easy: 0, normal: 0, hard: 0 };   // 隔离前序模拟的纪录
  startGame();
  G.score = 500;
  drawScene();
  ok(BTN.quit, '对局 HUD 注册「菜单」退出按钮');
  quitToMenu();
  eq(G.screen, 'menu', '退出后回到菜单');
  eq(G.bestMap.normal, 500, '退出时结算最高分');
  eq(JSON.parse(store['suikabest']).normal, 500, '退出纪录写入 localStorage');
  eq(G.fruits.length, 0, '退出清空局面');
  eq(G.danger, 0, '退出清危险计时');
  quitToMenu();
  eq(G.screen, 'menu', '菜单态退出为空操作');
  // 低分退出不覆盖纪录
  startGame(); G.score = 100; quitToMenu();
  eq(G.bestMap.normal, 500, '低分退出不覆盖纪录');
  // 退出后可重选难度再开局
  setDiff('easy'); startGame();
  eq(G.screen, 'play', '退出后菜单重选难度可再开局');
  eq(G.fruits.length, 0, '再开局局面干净');
  setDiff('normal');

  console.log('ALL PASS: ' + n + ' assertions');})();
`;

run(TESTS);
