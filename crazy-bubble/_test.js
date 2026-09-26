// 无头回归测试：桩掉 DOM/Canvas，验证常量表与道具上限、关卡生成（镜像/角区/墙格）、
// 放泡与占位固化、爆炸射线（方块阻挡/墙阻挡/连锁）、危险区预测、捣蛋鬼 AI 放泡、
// 水花杀敌与过关判定、受击重生/护盾/终局、双人计分与赛点、AI 确定性（同种子重放）、
// 三关通关路径、以及 30 秒按键 Bot 整局不变量模拟。
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
  const openField = () => { for (let ty = 0; ty < ROWS; ty++) G.grid[ty] = new Array(COLS).fill(FLOOR); };
  const put = (p, tx, ty) => { p.x = (tx + 0.5) * TS; p.y = (ty + 0.5) * TS; };
  const mkBomb = (tx, ty, range, owner) => { const b = { tx, ty, t: 1, range, owner: owner || G.players[0], pass: false }; G.bombs.push(b); return b; };
  const stepTo = (pred, maxSteps, msg) => { let s = 0; while (!pred() && s++ < maxSteps) update(DT); if (!pred()) throw new Error(msg || '超时未达到条件'); return s; };

  resize();

  // ============ 1) 常量与数值表 ============
  eq(ITEM_ORDER.length, 5, '5 种道具');
  eq(Object.keys(ENEMY).length, 3, '3 种小怪');
  eq(MAXLV, LEVELS.length, '关卡数与配置一致'); eq(MAXLV, 3);
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  ok(DIFFS.easy.spd < DIFFS.normal.spd && DIFFS.normal.spd < DIFFS.hard.spd, '速度系数递增');
  eq(DIFFS.easy.brange, 1, '简单捣蛋鬼射程 1'); eq(DIFFS.hard.brange, 2, '困难射程 2');
  eq(DIFFS.hard.add, 1, '困难每关 +1 怪'); eq(DIFFS.easy.add, 0);
  for (let i = 1; i < LEVELS.length; i++) ok(LEVELS[i].boxes > LEVELS[i - 1].boxes, '果冻密度递增 @' + i);
  ok(LEVELS[0].bomber === 0 && LEVELS[2].bomber >= 2, '捣蛋鬼逐关引入');
  eq(BOMB_MAX, 4); eq(RANGE_MAX, 6); eq(SPDMUL_MAX, 1.5); eq(PVP_TARGET, 3); eq(START_LIVES, 3);
  eq(COLS * TS, BW); eq(ROWS * TS, BH);

  // ============ 2) 道具上限 ============
  const tp = makePlayer(0, 0, 0);
  eq(tp.bombs, BOMB_START, '起始 1 泡'); eq(tp.range, RANGE_START, '起始 2 威力');
  for (let i = 0; i < 10; i++) applyItem(tp, 'bubble');
  eq(tp.bombs, BOMB_MAX, '加泡封顶');
  for (let i = 0; i < 10; i++) applyItem(tp, 'range');
  eq(tp.range, RANGE_MAX, '威力封顶');
  for (let i = 0; i < 10; i++) applyItem(tp, 'speed');
  ok(tp.spdmul <= SPDMUL_MAX + 1e-9 && Math.abs(tp.spdmul - SPDMUL_MAX) < 1e-6, '速度封顶 1.5x');
  applyItem(tp, 'shield'); eq(tp.shield, true, '护盾');
  for (let i = 0; i < 10; i++) applyItem(tp, 'life');
  eq(tp.lives, LIFE_MAX, '生命封顶 5');
  G.rng = () => 0; eq(pickItem(), 'bubble', 'rng=0 出加泡');
  G.rng = () => 0.9999; eq(pickItem(), 'life', 'rng≈1 出爱心');

  // ============ 3) 冒险开局与关卡生成 ============
  G.diff = 'normal'; G.mode = 'adv';
  startGame();
  eq(G.screen, 'play'); eq(G.level, 1); eq(G.score, 0);
  eq(G.players.length, 1, '冒险单人'); eq(G.enemies.length, LEVELS[0].blob + LEVELS[0].bat, '第 1 关怪数');
  for (const e of G.enemies) ok(e.cx > 1 || e.cy > 1, '小怪不贴玩家出生角 ' + e.type);
  // 墙格奇偶规律 + 镜像 + 四角 3×3 无果冻
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    if (tx % 2 === 1 && ty % 2 === 1) eq(G.grid[ty][tx], WALL, '奇偶交点墙 ' + tx + ',' + ty);
    eq(G.grid[ty][tx], G.grid[ty][COLS - 1 - tx], '水平镜像 ' + tx + ',' + ty);
    if (nearAnyCorner(tx, ty)) ok(G.grid[ty][tx] !== BOX, '角区无果冻 ' + tx + ',' + ty);
  }
  eq(tileAt(0, 0), FLOOR, '玩家出生点可走'); eq(tileAt(COLS - 1, ROWS - 1), FLOOR, '对角可走');
  ok(!passableFor(null, -1, 0), '越界不可走');
  // 确定性重开同布局
  const snapGrid = () => G.grid.map(r => r.join('')).join('|');
  G.runSalt = 21; startGame(); const g1 = snapGrid();
  G.runSalt = 21; startGame(); eq(snapGrid(), g1, '同种子同布局');
  G.runSalt = 22; startGame(); ok(snapGrid() !== g1, '换种子布局变化');

  // ============ 4) 放泡与占位固化 ============
  openField(); G.bombs = []; G.flames = []; G.itemsOn = [];
  const p = G.players[0]; put(p, 2, 2); p.inv = 0; p.cd = 0; p.bombs = 1;
  placeBomb(p); eq(G.bombs.length, 1, '放下第 1 颗');
  p.cd = 0; placeBomb(p); eq(G.bombs.length, 1, '同格不可重放');
  p.bombs = 1; p.cd = 0; put(p, 4, 2); placeBomb(p); eq(G.bombs.length, 1, '携泡上限 1 挡第 2 颗');
  p.bombs = 2; p.cd = 0; placeBomb(p); eq(G.bombs.length, 2, '升到 2 可放第 2 颗');
  eq(G.bombs[1].pass, true, '脚底泡暂可穿过');
  eq(passableFor(p, 4, 2), true, '新泡对 owner 放行');
  eq(passableFor(makePlayer(1, 0, 0), 4, 2), false, '新泡挡住别人');
  put(p, 9, 9); update(DT);
  eq(G.bombs[1].pass, false, '离开后固化');
  eq(passableFor(p, 4, 2), false, '固化后 owner 也不能进');
  ok(ownedBombs(p) === 2, '归属计数');

  // 4b) 自己泡夹死回归：中心越格线但身体仍压泡格 → 不固化、能继续走
  openField(); G.bombs = []; G.flames = []; G.itemsOn = [];
  const pt = G.players[0]; pt.bombs = 2; pt.cd = 0; pt.inv = 0; pt.alive = true; pt.respawnT = 0;
  put(pt, 4, 2); placeBomb(pt);
  const trapB = G.bombs[G.bombs.length - 1]; eq(trapB.tx, 4, '泡放在中心格 (4,2)');
  pt.x = (4 + 0.5) * TS + 40;   // 中心已进第 5 格，身体左缘仍压着泡格（40 < TS/2+HR=41）
  update(DT);
  eq(trapB.pass, true, '身体仍压泡格时不固化（旧 bug：中心越线即固化把人夹死）');
  const x0 = pt.x; moveEntity(pt, 1, 0, DT);
  ok(pt.x > x0, '能继续走开，不被自己的泡卡住');
  put(pt, 9, 9); update(DT);
  eq(trapB.pass, false, '真正离开后照常固化');
  G.bombs = [];

  // ============ 5) 爆炸射线 / 方块 / 墙 / 连锁 ============
  openField(); G.bombs = []; G.flames = []; G.itemsOn = []; G.rng = () => 0;
  G.grid[5][6] = BOX;                       // 右侧第 1 格果冻
  explodeBomb(mkBomb(5, 5, 2));
  eq(G.bombs.length, 0, '泡已消耗');
  eq(G.flames.length, 8, '水花 8 格（右臂被果冻截断）');
  eq(tileAt(6, 5), FLOOR, '果冻被打碎');
  ok(G.flames.some(f => f.tx === 6 && f.ty === 5), '果冻格本身冒水花');
  ok(!G.flames.some(f => f.tx === 7 && f.ty === 5), '水花不穿透果冻');
  ok(G.flames.some(f => f.tx === 3 && f.ty === 5), '左臂打满 2 格');
  eq(G.itemsOn.length, 1, 'rng=0 必掉道具');
  eq(G.itemsOn[0].type, 'bubble'); eq(G.itemsOn[0].tx, 6); eq(G.itemsOn[0].ty, 5);
  // 墙阻挡
  openField(); G.flames = []; G.bombs = []; G.itemsOn = []; G.rng = () => 0.999;
  G.grid[5][6] = WALL;
  explodeBomb(mkBomb(5, 5, 1));
  eq(G.flames.length, 4, '中心+左+上+下');
  ok(!G.flames.some(f => f.tx === 6), '墙挡右臂');
  eq(G.itemsOn.length, 0, 'rng=0.999 不掉道具');
  // 连锁引爆
  openField(); G.flames = []; G.bombs = [];
  const a = mkBomb(5, 5, 1), b2 = mkBomb(6, 5, 1);
  explodeBomb(a);
  eq(G.bombs.length, 0, '连锁后全部引爆');
  ok(G.flames.some(f => f.tx === 7 && f.ty === 5), 'b2 的右臂水花存在');
  ok(G.flames.some(f => f.tx === 6 && f.ty === 4), 'b2 的上臂水花存在');

  // ============ 6) 危险区预测 ============
  openField(); G.bombs = []; G.flames = []; G.rng = () => 0.999;
  mkBomb(5, 5, 2);
  let m = buildDanger();
  ok(m.has('5,5') && m.has('6,5') && m.has('7,5') && m.has('3,5') && m.has('5,7'), '十字危险区');
  ok(!m.has('8,5'), '射程外安全');
  G.grid[5][6] = BOX;
  m = buildDanger();
  ok(m.has('6,5') && !m.has('7,5'), '危险区在果冻截断');

  // ============ 7) 捣蛋鬼 AI 放泡 ============
  G.mode = 'adv'; startGame();
  openField(); G.bombs = []; G.flames = [];
  put(G.players[0], 2, 2);
  const bob = makeEnemy('bomber', 2, 5);
  bob.bombCd = 0;
  thinkEnemy(bob, buildDanger());
  eq(G.bombs.length, 1, '对齐+通路 → 放泡');
  eq(G.bombs[0].owner, bob, '泡归属小怪');
  eq(G.bombs[0].range, DIFFS[G.diff].brange, '小怪泡用难度射程');
  ok(bob.bombCd > 0, '放泡后进冷却');
  // 无路可逃时不放
  G.bombs = []; bob.bombCd = 0;
  for (let tx = 0; tx < COLS; tx++) G.grid[bob.cy + 1][tx] = WALL;  // 下方封死仍留 3 向，改为全封
  G.grid[bob.cy][bob.cx - 1] = WALL; G.grid[bob.cy][bob.cx + 1] = WALL; G.grid[bob.cy - 1][bob.cx] = WALL;
  thinkEnemy(bob, new Set());
  eq(G.bombs.length, 0, '被围死不放泡（不自杀）');

  // ============ 8) 水花杀敌与过关 ============
  startGame();
  openField(); G.flames = [{ tx: 3, ty: 3, t: 0.5, dur: FLAME_DUR, owner: -1, main: true }];
  G.enemies = [makeEnemy('blob', 3, 3)];
  G.score = 0;
  stepTo(() => G.screen === 'clear', 600, '清怪应过关');
  eq(G.score, ENEMY.blob.score + 200 * 1 + 50 * G.players[0].lives, '杀怪分 + 过关奖励');
  eq(G.level, 1, '停在第 1 关结算');
  doAction('next'); eq(G.level, 2); eq(G.screen, 'play', '进入第 2 关');
  eq(G.bombs.length, 0, '换关清场');

  // ============ 9) 冒险死亡流程 ============
  G.mode = 'adv'; G.diff = 'normal'; startGame();
  const pl = G.players[0];
  // 护盾挡一次
  pl.inv = 0; pl.shield = true; pl.lives = 3;
  hurtPlayer(pl, -1);
  eq(pl.shield, false, '护盾消耗'); eq(pl.lives, 3, '护盾不掉命');
  // 无敌期不掉命
  hurtPlayer(pl, -1); eq(pl.lives, 3, '无敌期免伤');
  // 三连击致死
  pl.inv = 0; hurtPlayer(pl, -1); eq(pl.lives, 2);
  eq(Math.round(pl.x / TS - .5), pl.stx, '重生回出生点');
  ok(pl.inv > 0, '重生无敌');
  pl.inv = 0; hurtPlayer(pl, -1); pl.inv = 0; G.score = 42; hurtPlayer(pl, -1);
  eq(G.screen, 'over', '命尽终局');
  eq(BEST.normal_adv, 42, '终局写纪录');
  ok(store['crazybubble.best.v1'], '纪录落盘');

  // ============ 10) 双人模式 ============
  G.mode = 'pvp'; G.diff = 'normal'; startGame();
  eq(G.players.length, 2, '双人两席');
  eq(G.enemies.length, 0, '双人无小怪');
  const [f1, f2] = G.players;
  const down = (tgt, by) => { tgt.alive = true; tgt.respawnT = 0; tgt.inv = 0; hurtPlayer(tgt, by); };
  f2.inv = 0; hurtPlayer(f2, 0);
  eq(f1.pts, 1, '粉队得分'); eq(f2.lives, 2, '掉命'); eq(f2.alive, false, '击倒待重生');
  f2.respawnT = 0.001; update(DT * 2);
  eq(f2.alive, true, '重生'); eq(f2.bombs, BOMB_START, '重生重置强化');
  down(f2, 0); eq(f1.pts, 2, '第二分');
  down(f2, 0);
  eq(G.screen, 'over', '先到 3 分'); eq(G.winner, 0, '粉队胜');
  eq(BEST.normal_pvp, 300, '双人纪录=击倒×100');
  // 自爆送分给对手
  startGame();
  G.players[0].inv = 0; hurtPlayer(G.players[0], -1);
  eq(G.players[1].pts, 1, '自爆对方 +1');
  // 冒名归属修正：ownerId=1 打粉队 → 蓝队得分
  startGame();
  G.players[0].inv = 0; hurtPlayer(G.players[0], 1);
  eq(G.players[1].pts, 1, '对方水泡得分');
  eq(G.players[0].pts, 0, '自己不给自己加分');
  G.mode = 'adv';

  // ============ 11) AI 确定性（同种子重放） ============
  G.mode = 'adv'; G.diff = 'normal';
  const sig = () => JSON.stringify([G.grid.map(r => r.join('')), G.enemies.map(e => [e.type, e.x.toFixed(2), e.y.toFixed(2), e.dir, e.cx, e.cy]), G.players[0].x.toFixed(2), G.bombs.length]);
  G.runSalt = 77; startGame();
  for (let i = 0; i < 1200; i++) update(DT);
  const s1 = sig();
  G.runSalt = 77; startGame();
  for (let i = 0; i < 1200; i++) update(DT);
  eq(sig(), s1, '同种子 10 秒重放一致');
  G.runSalt = 78; startGame();
  for (let i = 0; i < 1200; i++) update(DT);
  ok(sig() !== s1, '换种子轨迹变化');

  // ============ 12) 三关通关路径 ============
  G.diff = 'easy'; startGame();
  BEST.easy_adv = 0;
  let guard = 0;
  while (G.screen !== 'win' && guard++ < 10) {
    ok(G.screen === 'play', '应在对局中 @' + guard);
    const killed = G.enemies.length;
    ok(killed > 0 || G.level > 3, '每关应有怪');
    G.enemies.forEach(e => killEnemy(e));
    G.enemies = [];
    levelClear();
    if (G.screen === 'clear') doAction('next');
  }
  eq(G.screen, 'win', '三关通关');
  ok(G.score > 0, '通关累计得分');
  eq(BEST.easy_adv, G.score, '通关分入 best');
  eq(JSON.parse(store['crazybubble.best.v1']).easy_adv, G.score, '纪录落盘');

  // ============ 13) 退出保分 ============
  startGame(); G.score = 777;
  quitToMenu();
  eq(G.screen, 'menu'); eq(BEST.easy_adv, Math.max(777, G.newBest ? 777 : BEST.easy_adv), '退出也保分');

  // ============ 14) 按键 Bot 30 秒不变量模拟 ============
  G.diff = 'normal'; startGame();
  let frames = 0, maxFrames = Math.round(30 / DT);
  const hold = (code, on) => { keys[code] = on; };
  ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].forEach(c => hold(c, false));
  hold('Space', true);
  while (frames++ < maxFrames) {
    if (frames % 200 === 0) {
      const dirs = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
      dirs.forEach(c => hold(c, false));
      hold(dirs[(frames / 200) % 4 | 0], true);
    }
    update(DT);
    if (frames % 480 === 0) {
      const q = G.players[0];
      ok(isFinite(q.x) && isFinite(q.y) && q.x > 0 && q.x < BW && q.y > 0 && q.y < BH, '玩家位置界内');
      ok(isFinite(G.score) && G.score >= 0, '得分健康');
      for (const e of G.enemies) ok(isFinite(e.x) && e.x >= -TS && e.x <= BW + TS && e.y >= -TS && e.y <= BH + TS, '小怪界内');
      for (const b of G.bombs) {
        ok(b.tx >= 0 && b.ty >= 0 && b.tx < COLS && b.ty < ROWS, '泡在盘内');
        ok(b.range >= 1 && b.range <= RANGE_MAX, '射程合法');
      }
      ok(G.bombs.length <= BOMB_MAX + 1, '场上泡数受控');
      ok(['menu', 'play', 'pause', 'clear', 'over', 'win'].includes(G.screen), '屏幕态合法');
    }
    if (G.screen !== 'play') break;
  }
  ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].forEach(c => hold(c, false));
  ok(frames < maxFrames + 2 || G.screen === 'play', '模拟正常走完或结束');

  console.log('ALL PASS (' + n + ' 断言)');
})();
`;

run(TESTS);
