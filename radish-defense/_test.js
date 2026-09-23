// 无头回归测试：桩掉 DOM/Canvas，验证三关卡数据与路径几何、布局缩放、建塔/升级/出售、
// 索敌与子弹命中、清障机制、减速效果、经济系统、波次推进与提前召唤、
// 漏怪啃萝卜与终局、三关整局必胜模拟与放任必败模拟、
// 难度/关卡/解锁/最高分持久化、旧版单关纪录迁移、关卡选择 UI 按钮注册。
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
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); };
  const near = (a, b, eps, msg) => { n++; if (Math.abs(a - b) > eps) throw new Error(msg + ': ' + a + ' vs ' + b); };

  // 初始化到第 1 关（与 init() 等效，不经 localStorage）
  loadBest(); loadDiff(); loadUnlock(); selectLevel(0); resize();

  // ============ 1) 常量与关卡数据 ============
  eq(LEVELS.length, 3, '共 3 关卡');
  eq(LEVELS.map(l => l.waves.length).join(','), '12,14,16', '三关波数 12/14/16');
  eq(LEVELS.map(l => l.name).join(','), '青苗平原,幽谷迷径,黑松要塞', '三关名称');
  ok(LEVELS[0].hpMul < LEVELS[1].hpMul && LEVELS[1].hpMul < LEVELS[2].hpMul, '关卡血量递增');
  eq(LEVELS[0].hpMul, 1, '第 1 关血量基准 1.0');
  eq(TOWER_ORDER.length, 3, '塔种类 3');
  eq(Object.keys(ENEMIES).length, 4, '敌人种类 4');
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  eq(G.diff, 'normal', '默认普通难度');
  eq(G.level, 0, '默认第 1 关');
  eq(G.unlock, 1, '初始只解锁第 1 关');
  ok(DIFFS.easy.hpMul < DIFFS.normal.hpMul && DIFFS.normal.hpMul < DIFFS.hard.hpMul, '怪物血量随难度递增');
  ok(DIFFS.easy.startCoins > DIFFS.hard.startCoins, '初始金币随难度递减');
  ok(DIFFS.easy.radishHp > DIFFS.hard.radishHp, '萝卜生命随难度递减');
  for (const id of TOWER_ORDER) {
    const d = TOWERS[id];
    eq(d.levels.length, 3, '塔 ' + id + ' 共 3 级');
    for (let i = 1; i < 3; i++) ok(d.levels[i].up > 0, '塔 ' + id + ' 第 ' + (i + 1) + ' 级有升级价');
    ok(d.levels[0].dmg < d.levels[2].dmg && d.levels[0].range < d.levels[2].range, '塔 ' + id + ' 升级变强');
  }

  // ============ 2) 三关路径几何全量校验 ============
  const wantLen = [24, 34, 40], wantObs = [10, 12, 14];
  for (let i = 0; i < LEVELS.length; i++) {
    selectLevel(i);
    eq(PATH_LEN, wantLen[i], '第 ' + (i + 1) + ' 关路径总长');
    eq(OBS_CELLS.length, wantObs[i], '第 ' + (i + 1) + ' 关障碍物数');
    eq(PATH_WPS[PATH_WPS.length - 1][0], RADISH_CELL[0], '第 ' + (i + 1) + ' 关路径终点列 = 萝卜列');
    eq(PATH_WPS[PATH_WPS.length - 1][1], RADISH_CELL[1], '第 ' + (i + 1) + ' 关路径终点行 = 萝卜行');
    for (const [c, r] of OBS_CELLS) {
      ok(!isPath(c, r), '第 ' + (i + 1) + ' 关障碍 ' + c + ',' + r + ' 不在路径上');
      ok(!(c === RADISH_CELL[0] && r === RADISH_CELL[1]), '第 ' + (i + 1) + ' 关障碍不压萝卜');
    }
    let buildCnt = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (!isPath(c, r) && !isRadishCell(c, r)) buildCnt++;
    ok(buildCnt - OBS_CELLS.length >= 30, '第 ' + (i + 1) + ' 关可建格充足: ' + (buildCnt - OBS_CELLS.length));
  }
  eq(store['radishdef_level'], '2', 'selectLevel 持久化关卡选择');
  selectLevel(0);
  ok(isPath(0, 1), '第 1 关入口格在路径上');
  ok(!isPath(5, 1), '第 1 关折线外不是路径');
  ok(isPath(RADISH_CELL[0], RADISH_CELL[1]), '第 1 关萝卜格是路径终点（不可建）');

  // ============ 3) 布局（横竖屏） ============
  window.innerWidth = 400; window.innerHeight = 800; resize();
  eq(PORTRAIT, true, '400x800 走竖版');
  ok(CS > 20 && CS < 60, '竖版格边长合理: ' + CS.toFixed(1));
  ok(GX + COLS * CS <= 400.1, '竖版地图不溢出屏宽');
  ok(GY + ROWS * CS <= 800 - PANEL_H - 6 * U + 1, '竖版地图底边让位于底部面板');
  ok(GY >= HUD_H, '竖版地图不压 HUD');
  window.innerWidth = 1200; window.innerHeight = 800; resize();
  eq(PORTRAIT, false, '1200x800 走横版');
  ok(GX + COLS * CS + PANEL_W <= 1200.1, '横版地图+右面板不溢出');
  ok(GY >= HUD_H && GY + ROWS * CS <= 800.1, '横版地图垂直居中且不越界（GY=' + GY.toFixed(0) + '）');
  eq(W, 1200, 'W'); eq(H, 800, 'H');

  // ============ 4) posAt 路径参数化（第 1 关） ============
  const p0 = posAt(0), pEnd = posAt(1);
  ok(p0.x < GX, 'f=0 在屏外入口（左边界外）');
  near(pEnd.x, cellCX(RADISH_CELL[0]), 0.01, 'f=1 = 萝卜格中心 x');
  near(pEnd.y, cellCY(RADISH_CELL[1]), 0.01, 'f=1 = 萝卜格中心 y');
  // 拐点：累计格长处应落在对应拐点格中心
  const corner = (cellsLen, wpIdx) => {
    const p = posAt(cellsLen / PATH_LEN), w = wpPx()[wpIdx];
    near(p.x, w[0], 0.5, 'f=' + cellsLen + '/24 落在拐点 ' + wpIdx + ' x');
    near(p.y, w[1], 0.5, 'f=' + cellsLen + '/24 落在拐点 ' + wpIdx + ' y');
  };
  corner(5, 1); corner(10, 3); corner(19, 5); corner(22, 6);

  // ============ 5) 局初始化 ============
  resetGame(); startGame();
  eq(G.screen, 'play', '开局进入 play');
  eq(G.coins, DIFFS.normal.startCoins, '初始金币');
  eq(G.radishHp, DIFFS.normal.radishHp, '萝卜生命');
  eq(G.nextWave, 0, '从第 1 波倒计时开始');
  eq(G.interT, FIRST_INTER, '首波倒计时');
  eq(Object.keys(G.cells).length, 10, '第 1 关障碍物就位');

  // ============ 6) 建塔校验 ============
  const c0 = G.coins;
  eq(tryBuild(0, 1, 'pea'), false, '路径上不可建');
  eq(tryBuild(OBS_CELLS[0][0], OBS_CELLS[0][1], 'pea'), false, '障碍上不可建');
  eq(tryBuild(RADISH_CELL[0], RADISH_CELL[1], 'pea'), false, '萝卜格不可建');
  eq(G.coins, c0, '非法建造不扣金币');
  eq(tryBuild(3, 2, 'pea'), true, '空地建造成功');
  eq(G.coins, c0 - TOWERS.pea.cost, '建塔扣费');
  eq(G.towers.length, 1, '塔入表');
  eq(tryBuild(3, 2, 'pea'), false, '同格不可重复建');
  G.coins = 0;
  eq(tryBuild(4, 2, 'pea'), false, '金币不足不可建');
  G.coins = 100000;

  // ============ 7) 升级 / 出售 ============
  const t = G.towers[0];
  eq(upgradeCost(t), TOWERS.pea.levels[1].up, '1 级升级价');
  const coinsA = G.coins;
  eq(upgradeTower(t), true, '升级成功');
  eq(t.lv, 2, '升到 2 级');
  eq(G.coins, coinsA - TOWERS.pea.levels[1].up, '升级扣费');
  upgradeTower(t);
  eq(t.lv, 3, '升到 3 级');
  eq(upgradeCost(t), 0, '满级无升级价');
  eq(upgradeTower(t), false, '满级不可再升');
  eq(sellValue(t), Math.floor(t.invested * SELL_RATE), '出售返还 70%');
  const coinsB = G.coins;
  sellTower(t);
  eq(G.towers.length, 0, '出售后塔移除');
  eq(G.coins, coinsB + Math.floor(t.invested * SELL_RATE), '出售回款');

  // ============ 8) 出怪与移动 ============
  startGame(); G.coins = 100000; G.interT = 0; G.waveActive = true; G.waveClock = 0;
  startWave();
  eq(G.spawnQueue.length, LEVELS[0].waves[0].list[0][1], '第 1 关第 1 波出怪数');
  update(1 / 60);
  eq(G.enemies.length, 1, '第一拍出 1 只');
  for (let i = 0; i < 60 * 6; i++) update(1 / 60);
  eq(G.spawnQueue.length, 0, '6 秒内全部出完');
  eq(G.enemies.length, 6, '6 只怪在场');
  const e0 = G.enemies[0];
  const f0 = e0.f; update(1 / 60);
  ok(e0.f > f0, '怪物沿路径前进');
  near(e0.f - f0, ENEMIES.rat.spd * (1 / 60) / PATH_LEN, 1e-9, '移动速度精确（格/秒换算）');
  // 关卡血量系数：同一波在 L2/L3 更硬
  const hpOf = (lv, type) => { selectLevel(lv); startGame(); G.spawnQueue = []; G.waveActive = true; spawnEnemy(type); const h = G.enemies[0].maxHp; G.enemies.length = 0; return h; };
  const h1 = hpOf(0, 'rat'), h2 = hpOf(1, 'rat'), h3 = hpOf(2, 'rat');
  near(h2 / h1, LEVELS[1].hpMul / LEVELS[0].hpMul, 0.05, '第 2 关血量按关卡系数放大');
  near(h3 / h1, LEVELS[2].hpMul / LEVELS[0].hpMul, 0.05, '第 3 关血量按关卡系数放大');
  selectLevel(0);

  // ============ 9) 塔索敌击杀与经济 ============
  startGame(); G.coins = 100000; G.interT = 0; G.waveActive = false;
  G.enemies.length = 0;
  ok(tryBuild(3, 2, 'pea'), '在路径旁建豌豆炮');
  const tw = G.towers[0]; tw.cd = 0;
  spawnEnemy('rat');
  const rat = G.enemies[0];
  // 把怪放到塔射程内：路径 f≈0.15 处（上边直道中段）
  rat.f = 0.15; const rp = posAt(0.15); rat.x = rp.x; rat.y = rp.y;
  const coinsBefore = G.coins;
  for (let i = 0; i < 60 * 10 && G.enemies.includes(rat); i++) update(1 / 60);
  ok(!G.enemies.includes(rat), '豌豆炮 10 秒内击杀灰嘴鼠');
  eq(G.kills, 1, '击杀计数');
  eq(G.coins, coinsBefore + Math.round(ENEMIES.rat.coins * DIFFS.normal.coinMul), '击杀掉落金币');
  eq(G.score, ENEMIES.rat.pts + 0, '击杀得分（首波分值 = 鼠 10）');

  // ============ 10) 冰冻菇减速 ============
  startGame(); G.coins = 100000; G.interT = 0; G.waveActive = false; G.enemies.length = 0;
  tryBuild(3, 2, 'ice');
  spawnEnemy('turtle');
  const tur = G.enemies[0];
  const tp = posAt(0.15); tur.f = 0.15; tur.x = tp.x; tur.y = tp.y;
  let slowed = false;
  for (let i = 0; i < 60 * 15 && G.enemies.includes(tur) && !slowed; i++) { update(1 / 60); if (tur.slowT > 0) slowed = true; }
  ok(slowed, '冰冻菇命中后施加减速');
  ok(tur.slowF < 1 && enemySpeed(tur) < ENEMIES.turtle.spd, '减速期实际速度低于基础速度');

  // ============ 11) 清障机制（无怪时自动打障碍） ============
  startGame(); G.coins = 100000; G.interT = 0; G.waveActive = false; G.enemies.length = 0;
  ok(tryBuild(4, 6, 'pea'), '障碍 (3,6) 旁建塔');
  const coinsC = G.coins, scoreC = G.score;
  const obsKey = '3,6';
  ok(G.cells[obsKey], '障碍 (3,6) 存在');
  for (let i = 0; i < 60 * 15; i++) update(1 / 60);
  ok(!G.cells[obsKey], '障碍 (3,6) 被自动清除');
  ok(G.coins > coinsC, '清障获得金币');
  ok(G.score >= scoreC + 30, '清障得分（含连锁清除多个）');
  eq(buildable(3, 6), true, '清障后原地基可建');
  eq(tryBuild(3, 6, 'melon'), true, '腾出的格子可建塔');

  // ============ 12) 漏怪啃萝卜与终局 ============
  startGame(); G.interT = 0; G.waveActive = false; G.enemies.length = 0;
  spawnEnemy('turtle');
  const tk = G.enemies[0]; tk.f = 0.995;
  const hpB = G.radishHp;
  for (let i = 0; i < 60 * 5 && tk.f < 1 && G.enemies.includes(tk); i++) update(1 / 60);
  eq(G.radishHp, hpB - ENEMIES.turtle.dmg, '铁皮龟啃萝卜 -2');
  eq(G.enemies.includes(tk), false, '啃完的怪离场');
  G.radishHp = 1;
  spawnEnemy('boar');
  const bb = G.enemies[0]; bb.f = 0.999;
  for (let i = 0; i < 60 * 5 && G.screen === 'play'; i++) update(1 / 60);
  eq(G.screen, 'over', '萝卜被啃光 → 终局');
  eq(G.overReason, 'eaten', '终局原因 eaten');
  eq(G.radishHp, 0, '生命钳到 0 不为负');

  // ============ 13) 波次推进与提前召唤 ============
  startGame(); G.interT = 0; G.waveActive = false; G.enemies.length = 0;
  spawnEnemy('rat'); G.enemies.length = 0; G.waveActive = true; G.spawnQueue.length = 0;
  update(1 / 60);
  eq(G.waveActive, false, '场上无怪 → 本波结束');
  eq(G.nextWave, 1, '推进到第 2 波');
  near(G.interT, INTER_TIME - 1 / 60, 1e-6, '进入波间倒计时');
  const coinsD = G.coins;
  const bonus = callWaveEarly();
  eq(bonus, Math.floor(INTER_TIME - 1 / 60), '提前召唤奖励 = 剩余秒数');
  eq(G.coins, coinsD + bonus, '奖励入账');
  eq(G.waveActive, true, '提前召唤立即开波');
  eq(G.interT, 0, '倒计时清零');

  // ============ 14) 整局必败模拟（第 1 关不建塔） ============
  selectLevel(0); setDiff('normal'); startGame();
  let steps = 0;
  while (G.screen === 'play' && steps < 60 * 600) { update(1 / 60); steps++; }
  eq(G.screen, 'over', '放任不管必败');
  eq(G.overReason, 'eaten', '败因：萝卜被啃光');
  eq(G.unlock, 1, '失败不解锁新关卡');

  // 贪心满图布防工具：所有可建格建西瓜炮并全部升满
  const greedyDefend = () => {
    G.coins = 1000000;
    let built = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (buildable(c, r) && tryBuild(c, r, 'melon')) built++;
    let more = true;
    while (more) { more = false; for (const tw of G.towers) { const u = upgradeCost(tw); if (u && G.coins >= u) { upgradeTower(tw); more = true; } } }
    G.coins = 1000000;
    return built;
  };

  // ============ 15) 第 1 关整局必胜模拟（普通难度标准布防） ============
  selectLevel(0); setDiff('normal'); startGame();
  G.coins = 1000000;
  const plan = [
    ['melon', 5, 4], ['melon', 9, 4], ['melon', 2, 6], ['melon', 6, 2],
    ['melon', 0, 4], ['melon', 3, 0], ['melon', 9, 0],
    ['pea', 3, 2], ['pea', 6, 6],
  ];
  for (const [id, c, r] of plan) ok(tryBuild(c, r, id), '布防建塔 ' + id + ' @' + c + ',' + r);
  let more2 = true;
  while (more2) { more2 = false; for (const tw of G.towers) { const u = upgradeCost(tw); if (u && G.coins >= u) { upgradeTower(tw); more2 = true; } } }
  ok(G.towers.every(tw => tw.lv === 3), '全员满级');
  steps = 0;
  while (G.screen === 'play' && steps < 60 * 60 * 12) { update(1 / 60); steps++; }
  eq(G.screen, 'win', '标准布防守住第 1 关 12 波（' + (steps / 60).toFixed(0) + 's 模拟）');
  eq(G.overReason, 'win', '胜因 win');
  ok(G.kills > 80, '总击杀数可观: ' + G.kills);
  ok(G.score > 500, '通关分数可观: ' + G.score);
  ok(G.bestMap.normal[0] >= G.score, '胜利刷新第 1 关最高分');
  eq(G.unlock, 2, '通关第 1 关解锁第 2 关');
  eq(store['radishdef_unlock'], '2', '解锁进度写入 localStorage');
  eq(JSON.parse(store['radishdef_best']).normal[0], G.bestMap.normal[0], '最高分 JSON 写入 localStorage');
  const l1Best = G.bestMap.normal[0];

  // ============ 16) 第 2 关整局必胜模拟（贪心满图布防） ============
  selectLevel(1); setDiff('normal'); startGame();
  const built2 = greedyDefend();
  ok(built2 >= 30, '第 2 关满图布防塔数: ' + built2);
  eq(Object.keys(G.cells).length, 12, '第 2 关障碍物 12 个');
  steps = 0;
  while (G.screen === 'play' && steps < 60 * 60 * 20) { update(1 / 60); steps++; }
  eq(G.screen, 'win', '守住了第 2 关 14 波（' + (steps / 60).toFixed(0) + 's 模拟）');
  eq(G.nextWave, 14, '第 2 关全部 14 波打满');
  ok(G.score > 800, '第 2 关通关分数更高: ' + G.score);
  ok(G.bestMap.normal[1] >= G.score, '第 2 关独立纪录刷新');
  eq(G.bestMap.normal[0], l1Best, '第 1 关纪录不受第 2 关影响');
  eq(G.unlock, 3, '通关第 2 关解锁第 3 关');
  eq(store['radishdef_unlock'], '3', '解锁持久化');

  // ============ 17) 第 3 关整局必胜模拟 ============
  selectLevel(2); setDiff('normal'); startGame();
  const built3 = greedyDefend();
  ok(built3 >= 25, '第 3 关满图布防塔数: ' + built3);
  eq(Object.keys(G.cells).length, 14, '第 3 关障碍物 14 个');
  steps = 0;
  while (G.screen === 'play' && steps < 60 * 60 * 24) { update(1 / 60); steps++; }
  eq(G.screen, 'win', '守住了第 3 关 16 波（' + (steps / 60).toFixed(0) + 's 模拟）');
  eq(G.nextWave, 16, '第 3 关全部 16 波打满');
  ok(G.score > 1000, '第 3 关通关分数最高: ' + G.score);
  ok(G.bestMap.normal[2] >= G.score, '第 3 关独立纪录刷新');
  eq(G.unlock, 3, '通关第 3 关后解锁数为 3（封顶）');

  // ============ 18) 关卡选择与解锁钳制 ============
  selectLevel(9); eq(G.level, 2, 'selectLevel 越界钳到末关');
  selectLevel(-3); eq(G.level, 0, 'selectLevel 负值钳到首关');
  selectLevel(0);
  eq(store['radishdef_level'], '0', '关卡选择持久化');

  // ============ 19) 菜单与结算 UI 按钮注册 ============
  G.screen = 'menu';
  delete BTN.diff_easy; delete BTN.diff_normal; delete BTN.diff_hard;
  delete BTN.lv_0; delete BTN.lv_1; delete BTN.lv_2; delete BTN.start;
  drawMenu();
  ok(BTN.diff_easy && BTN.diff_normal && BTN.diff_hard && BTN.start, '菜单注册三档难度与开始按钮');
  ok(BTN.lv_0 && BTN.lv_1 && BTN.lv_2, '菜单注册三个关卡选择按钮');
  G.hint = '测试提示';
  drawMenu();
  eq(G.hint, null, '菜单绘制后消费掉提示');
  // 胜利结算：非末关 → 下一关按钮
  G.screen = 'play'; G.level = 0; G.radishHp = 5; G.score = 10; G.newBest = false;
  endGame('win');
  eq(G.screen, 'win', 'win 屏');
  delete BTN.nextlv; delete BTN.again; delete BTN.menu;
  drawEnd(true);
  ok(BTN.nextlv && BTN.again && BTN.menu, '非末关胜利显示 下一关/再来一局/回菜单');
  ok(BTN.nextlv.w > 0 && BTN.nextlv.h > 0, '下一关按钮有尺寸');
  // 末关胜利：无下一关按钮
  G.screen = 'play'; G.level = 2; G.radishHp = 3; G.score = 10; G.newBest = false;
  endGame('win');
  delete BTN.nextlv; delete BTN.again; delete BTN.menu;
  drawEnd(true);
  ok(!BTN.nextlv && BTN.again && BTN.menu, '末关胜利显示 重玩/回菜单（无下一关）');
  // 失败结算：无下一关按钮
  G.screen = 'play'; G.level = 1; G.radishHp = 0; G.score = 10; G.newBest = false; G.overReason = '';
  endGame('eaten');
  delete BTN.nextlv; delete BTN.again; delete BTN.menu;
  drawEnd(false);
  ok(!BTN.nextlv && BTN.again && BTN.menu, '失败结算显示 再来一局/回菜单');

  // ============ 20) 难度持久化与纪录隔离 ============
  eq(store['radishdef_diff'], 'normal', '难度持久化');
  setDiff('easy');
  eq(G.diff, 'easy', '切换难度');
  const easyL1Before = G.bestMap.easy[0];
  selectLevel(0); startGame(); G.interT = 0; G.waveActive = false; G.enemies.length = 0;
  G.radishHp = 1; spawnEnemy('boar'); const b2 = G.enemies[0]; b2.f = 0.999;
  for (let i = 0; i < 60 * 5 && G.screen === 'play'; i++) update(1 / 60);
  eq(G.screen, 'over', '简单档也会败');
  eq(G.bestMap.easy[0], easyL1Before, '失败不刷简单档纪录');
  eq(G.bestMap.normal[0] > 0, true, '普通档纪录不受影响');
  setDiff('bogus'); eq(G.diff, 'easy', '非法难度被忽略');
  setDiff('normal');

  // ============ 21) 旧版单关纪录迁移 ============
  G.bestMap = { easy: [0, 0, 0], normal: [0, 0, 0], hard: [0, 0, 0] };
  store['radishdef_best'] = JSON.stringify({ easy: 123, normal: 456, hard: 0 });
  loadBest();
  eq(G.bestMap.easy[0], 123, '旧版数字纪录迁移到第 1 格');
  eq(G.bestMap.normal[0], 456, '普通档旧纪录迁移');
  eq(G.bestMap.normal[1], 0, '迁移不虚构后续关卡纪录');
  eq(G.bestMap.hard[0], 0, '0 分旧纪录不迁移');
  store['radishdef_best'] = JSON.stringify({ normal: [11, 22, 33] });
  G.bestMap = { easy: [0, 0, 0], normal: [0, 0, 0], hard: [0, 0, 0] };
  loadBest();
  eq(G.bestMap.normal.join(','), '11,22,33', '新版数组纪录完整读取');
  store['radishdef_best'] = JSON.stringify({ normal: [7] });   // 短数组：缺位补 0
  G.bestMap.normal = [0, 0, 0];
  loadBest();
  eq(G.bestMap.normal.join(','), '7,0,0', '短数组纪录按位读取');
  store['radishdef_best'] = '{{{坏数据';
  G.bestMap.normal = [1, 2, 3];
  loadBest();
  eq(G.bestMap.normal.join(','), '1,2,3', '损坏存储不崩溃且保留内存值');

  // ============ 22) 解锁持久化读取 ============
  store['radishdef_unlock'] = '99';
  G.unlock = 1; loadUnlock();
  eq(G.unlock, 3, 'loadUnlock 钳制到关卡数');
  store['radishdef_unlock'] = '0';
  G.unlock = 2; loadUnlock();
  eq(G.unlock, 1, 'loadUnlock 非法值回退（0| 视为无 → 保持逻辑下限 1）');
  delete store['radishdef_unlock'];
  G.unlock = 2; loadUnlock();
  eq(G.unlock, 2, '无存储时保持当前值');
  store['radishdef_unlock'] = '2';

  console.log('ALL PASS: ' + n + ' assertions');})();
`;

run(TESTS);
