// 三十命突击 · 无头回归测试
// 用法：node _test.js            （全量：几何 + 物理 + 行为 + UI + Bot 九格）
//       node _test.js quick      （跳过 Bot 九格，只跑单元段）
// 铁律：Bot 只通过 IN 输入对象驱动游戏，测试不得为了通过而修改游戏内部状态；
//       任何物理 / 关卡数值改动都必须重跑本文件（Bot 弹道依赖最终物理参数）。
const fs = require('fs');
const QUICK = process.argv.indexOf('quick') >= 0;

let src = fs.readFileSync(__dirname + '/index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : () => undefined)),
  set: () => true,
});
const makeEl = id => ({ id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
  addEventListener: noop, setAttribute: noop, textContent: '', dataset: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
  getContext: () => ctxStub, width: 1200, height: 800 });
const els = {};
global.__els = els;
global.document = { getElementById: id => els[id] || (els[id] = makeEl('game')),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('t') };
global.window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, addEventListener: noop };
global.devicePixelRatio = 1;
global.requestAnimationFrame = noop;
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

const TESTS = `
;(async () => {
  let pass = 0; const fails = [];
  const ok = (name, cond, detail) => { if (cond) pass++; else fails.push(name + (detail ? '  [' + detail + ']' : '')); };
  const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
  const near = (name, got, want, tol) => ok(name, Math.abs(got - want) <= (tol === undefined ? 1e-6 : tol), 'got ' + got + ' want ' + want);
  const report = cells => {
    const lines = [];
    for (const c of cells || []) {
      lines.push([c.diff + '/L' + (c.li + 1), c.scene, 'x=' + Math.round(c.x) + '/' + (c.cols * TILE),
        'coreHp=' + c.coreHp, 'deaths=' + c.deaths, 'lives=' + c.lives,
        'icons=' + c.icons + '/' + c.totalItems, c.gun + 'Lv' + c.level,
        't=' + Math.round(c.timeLeft), 'score=' + c.score].join(' '));
    }
    console.log(lines.join('\\n'));
    console.log('---');
    console.log('断言 ' + pass + ' 通过 / ' + fails.length + ' 失败');
    if (fails.length) { console.log(fails.map(s => '  ✗ ' + s).join('\\n')); process.exitCode = 1; }
    else console.log('全部通过：常量/块表/几何/碰撞/瞄准/武器/敌人/Boss/死亡流程/确定性/面板 UI/纪录/Bot 九格');
  };
  const clearIn = () => { IN.left = IN.right = IN.jump = IN.fire = IN.aimUp = IN.aimDown = false; };
  const setDiff = d => { G.diff = d; };
  const R2 = v => Math.round(v * 100) / 100;

  // ============================================================
  // 1. 常量与物理不变量
  // ============================================================
  eq('世界网格', [TILE, ROWS, VW, VH, GROUND_TOP, GROUND_Y], [36, 16, 864, 576, 14, 504]);
  const apex = JUMP_V * JUMP_V / (2 * GRAV);
  ok('满跳高度够上 3 格高台（126px > 108px）', apex > 3 * TILE && apex < 4 * TILE, 'apex=' + R2(apex));
  const range = 2 * JUMP_V / GRAV * RUN_MAX;
  ok('满跳射程覆盖 6 格坑、但不覆盖 7 格', range >= 6 * TILE && range < 7 * TILE, 'range=' + R2(range));
  ok('松手截断低于满跳初速', JUMP_CUT < JUMP_V && JUMP_CUT > 0);
  ok('落地速度上限拆子步后不穿 1 格地板', MAX_FALL * STEP <= 20, 'dy=' + R2(MAX_FALL * STEP));
  ok('土狼时间与跳跃缓冲在人类可感区间', COYOTE >= 0.06 && COYOTE <= 0.15 && JBUF >= 0.08 && JBUF <= 0.16);
  eq('八向分量系数', RGT, Math.SQRT1_2);
  ok('预警窗口 ≥ 0.4s（敌人开火前必须可见地闪）', WINDUP >= 0.4);
  ok('复活保护窗口 1.1s', SPAWN_GRACE === 1.1);
  eq('榴弹引爆参数', [GRENADE_FUSE, BLAST_R], [1.0, 92]);
  // 难度单调性：命越少、时限越紧、敌人越强、分越高
  const D = DIFFS;
  ok('生命数随难度递减', D.easy.lives > D.normal.lives && D.normal.lives > D.hard.lives, [D.easy.lives, D.normal.lives, D.hard.lives].join('/'));
  ok('时限倍率随难度递减', D.easy.timeMul > D.normal.timeMul && D.normal.timeMul > D.hard.timeMul);
  ok('敌人密度/血量/射速随难度递增', D.easy.enemyMul < D.normal.enemyMul && D.normal.enemyMul < D.hard.enemyMul &&
    D.easy.enemyHp < D.normal.enemyHp && D.normal.enemyHp < D.hard.enemyHp &&
    D.easy.rateMul < D.normal.rateMul && D.normal.rateMul < D.hard.rateMul);
  ok('得分倍率随难度递增', D.easy.scoreMul < D.normal.scoreMul && D.normal.scoreMul < D.hard.scoreMul);
  eq('难度顺序', DIFF_ORDER, ['easy', 'normal', 'hard']);
  // 武器表：伤害公式 dmg + (dmg>1 ? lv-1 : lv>=3 ? 1 : 0)
  const dmgOf = (gun, lv) => { const g = GUNS[gun]; return g.dmg + (g.dmg > 1 ? lv - 1 : lv >= 3 ? 1 : 0); };
  eq('步枪伤害曲线 1/1/2', [1, 2, 3].map(l => dmgOf('rifle', l)), [1, 1, 2]);
  eq('镭射伤害曲线 2/3/4', [1, 2, 3].map(l => dmgOf('laser', l)), [2, 3, 4]);
  eq('榴弹伤害曲线 3/4/5', [1, 2, 3].map(l => dmgOf('grenade', l)), [3, 4, 5]);
  ok('同屏弹药上限都存在', GUN_ORDER.every(k => GUNS[k].cap >= 3 && GUNS[k].cap <= 12));
  // 散弹的扇形表必须挂在 spreadByLevel 上（shoot 的判据就是它）。
  // 曾经写成 g.spread ? ... —— GUNS.spread 里并没有叫 spread 的字段，恒为 undefined，
  // 于是散弹永远只打一颗，玩家吃了 S 图标「跟步枪没区别」。
  eq('散弹三档弹丸数 3/5/7', GUNS.spread.spreadByLevel.map(a => a.length), [3, 5, 7]);
  ok('散弹每档扇形都关于 0 对称', GUNS.spread.spreadByLevel.every(a =>
    Math.abs(a.reduce((s, o) => s + o, 0)) < 1e-12 && a[0] < 0));
  ok('擦地弹高度低于站姿身高（站着一定吃）且低于短跳净空（跳得起）',
    BOSS_LOW_H > 8 && BOSS_LOW_H < P_H - 14, 'h=' + BOSS_LOW_H + ' P_H=' + P_H);
  ok('擦地弹慢于追身弹（两路弹要能分辨）', BOSS_LOW_SPD.every((s, i) => s < BOSS_AIM_SPD[i]));
  ok('三档擦地弹帧位与追身/抛壳都不重合', BOSS_LOW_PAT.every((low, t) =>
    low.every(f => BOSS_PAT[t].indexOf(f) < 0 && BOSS_RAIN[t].indexOf(f) < 0 && f % 150 !== 75)));
  ok('突击兵枪线短于炮台枪线（近身兵靠走位解，远炮靠掩体解）', ENEMY.R.ranged < ENEMY.T.ranged);
  ok('标准炮塔血量高于突击兵（榴弹直伤必须按炮塔校准）', ENEMY.T.hp > ENEMY.R.hp, ENEMY.T.hp + ' vs ' + ENEMY.R.hp);

  // ============================================================
  // 2. 块表审计
  // ============================================================
  const names = Object.keys(CHUNKS);
  ok('块表非空', names.length >= 20, names.length + ' 块');
  let badLen = [], badChar = [], badGround = [];
  for (const n of names) {
    const rows = CHUNKS[n];
    if (rows.length !== ROWS) badLen.push(n + ':rows');
    rows.forEach((s, r) => {
      if (s.length !== 16) badLen.push(n + '@' + r);
      for (const ch of s) if (TILE_CHARS.indexOf(ch) < 0) badChar.push(n + '@' + r + ':' + ch);
    });
    // 地面两行必须同步：要么铺满，要么整段留空成坑，不允许「14 空 15 实」的悬空地板
    for (let c = 0; c < 16; c++) if ((rows[14][c] === '.') !== (rows[15][c] === '.')) badGround.push(n + '@' + c);
  }
  eq('每块都是 16 行 × 16 列', badLen, []);
  eq('块内字符都在 TILE_CHARS 白名单内', badChar, []);
  eq('地面两行上下贯通（无悬空地板）', badGround, []);
  // 图标块必须落在单向平台或地面上：图标行 11 的下方 12 行要有平台板
  for (const n of names) {
    const rows = CHUNKS[n];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < 16; c++) {
      if (ICON_CHARS.indexOf(rows[r][c]) < 0) continue;
      let support = false;
      for (let k = r + 1; k < ROWS; k++) if (rows[k][c] !== '.') { support = rows[k][c] === 'p' || isSolidCh(rows[k][c]); break; }
      ok('图标 ' + n + '@' + r + ',' + c + ' 下方有承托', support);
    }
  }
  // 敌人不能悬在坑上：敌人字符所在列的正下方必须有着地
  for (const n of names) {
    const rows = CHUNKS[n];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < 16; c++) {
      if (!ENEMY[rows[r][c]]) continue;
      if (ENEMY[rows[r][c]].fly) continue;
      let ground = false;
      for (let k = r + 1; k < ROWS; k++) if (rows[k][c] !== '.') { ground = isSolidCh(rows[k][c]) || rows[k][c] === 'p'; break; }
      ok('敌人 ' + n + '@' + r + ',' + c + ' 不会掉进坑里', ground);
    }
  }

  // ============================================================
  // 3. 关卡几何审计（写死事实 + 可跳性/营地红线不变量）
  // ============================================================
  const FACTS = [
    { name: '丛林前哨', cols: 272, px: 9792, bossCol: 266, flat: 49, cps: [79, 3427, 6487, 7999],
      pits: ['87x1', '134x3', '215x1'], enemies: { F: 1, T: 2, R: 14, B: 4 },
      items: { machine: 2, spread: 2, sensor: 1 } },
    { name: '瀑布深谷', cols: 352, px: 12672, bossCol: 346, flat: 64, cps: [79, 2815, 8215, 12283],
      pits: ['70x3', '147x3', '199x1', '243x9B', '277x4'], enemies: { F: 3, T: 3, R: 20, B: 6 },
      items: { machine: 2, spread: 2, laser: 2, sensor: 1 } },
    { name: '要塞核心', cols: 448, px: 16128, bossCol: 442, flat: 64, cps: [79, 6523, 10267, 13795],
      pits: ['70x3', '147x3', '197x4', '278x3', '323x9B', '373x4'], enemies: { F: 3, T: 4, R: 29, B: 8 },
      items: { grenade: 2, laser: 2, spread: 2, machine: 2, sensor: 2 } },
  ];
  const geoOf = li => {
    setDiff('normal'); startLevel(li);
    const gaps = []; let run = -1;
    for (let c = 0; c <= G.cols; c++) {
      const solid = c < G.cols && isSolidCh(tileChar(c, GROUND_TOP));
      if (!solid) { if (run < 0) run = c; }
      else if (run >= 0) { gaps.push([run, c - run - 1]); run = -1; }
    }
    const bridge = g => { for (let c = g[0]; c < g[0] + g[1]; c++) if (isOnewayCh(tileChar(c, 13)) || isOnewayCh(tileChar(c, 12))) return true; return false; };
    const kinds = {}, items = {};
    for (const e of G.enemies) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    for (const it of G.items) items[it.type] = (items[it.type] || 0) + 1;
    let flat = 0;
    for (let c = G.bossCol - 1; c >= 0 && isSolidCh(tileChar(c, GROUND_TOP)) && !isSolidCh(tileChar(c, GROUND_TOP - 1)); c--) flat++;
    return { cols: G.cols, px: G.cols * TILE, bossCol: G.bossCol, flat,
      cps: G.checkpoints.map(p => Math.round(p.x)), pits: gaps.filter(g => g[1] > 0).map(g => g[0] + 'x' + g[1] + (bridge(g) ? 'B' : '')),
      enemies: kinds, items, all: gaps };
  };
  for (let li = 0; li < 3; li++) {
    const g = geoOf(li), f = FACTS[li];
    eq('L' + (li + 1) + ' 名称', LEVELS[li].name, f.name);
    eq('L' + (li + 1) + ' 宽度（块数×16）', [g.cols, g.px], [f.cols, f.px]);
    eq('L' + (li + 1) + ' Boss 列与营地平地宽', [g.bossCol, g.flat], [f.bossCol, f.flat]);
    eq('L' + (li + 1) + ' 检查点像素', g.cps, f.cps);
    eq('L' + (li + 1) + ' 坑位表', g.pits, f.pits);
    eq('L' + (li + 1) + ' 敌人构成', g.enemies, f.enemies);
    eq('L' + (li + 1) + ' 镜头构成', g.items, f.items);
    // 不变量：未架桥的坑宽 ≤ 满跳射程（6 格）
    ok('L' + (li + 1) + ' 所有宽坑都有单向桥板', g.all.every(w => w[1] <= 6 || g.pits.indexOf(w[0] + 'x' + w[1] + 'B') >= 0),
      JSON.stringify(g.all.filter(w => w[1] > 6)));
    // 不变量：营地射击带内不得有低空实心掩体、不得有坑（玩家起跳即撞舱口弹线 → 掩体后=必死死角）
    const a = Math.ceil(g.bossCol * TILE - VW * 1.15), b = g.bossCol * TILE - 300;
    let cover = 0, pitCols = 0;
    for (let c = Math.floor(a / TILE); c <= Math.floor(b / TILE); c++) {
      for (let r = 10; r <= 13; r++) if (isSolidCh(tileChar(c, r))) cover++;
      if (!isSolidCh(tileChar(c, GROUND_TOP))) pitCols++;
    }
    ok('L' + (li + 1) + ' 营地带无低空掩体', cover === 0, 'coverTiles=' + cover);
    ok('L' + (li + 1) + ' 营地带无坑', pitCols === 0, 'pitCols=' + pitCols);
    // 不变量：检查点脚下实心、头顶两格净空、且 7 格内无敌
    for (let i = 1; i < G.checkpoints.length; i++) {
      const col = Math.floor(G.checkpoints[i].x / TILE);
      ok('L' + (li + 1) + ' 检查点 ' + i + ' 几何安全',
        isSolidCh(tileChar(col, GROUND_TOP)) && !isSolidCh(tileChar(col, GROUND_TOP - 1)) && !isSolidCh(tileChar(col, GROUND_TOP - 2)),
        'col=' + col);
      ok('L' + (li + 1) + ' 检查点 ' + i + ' 附近无敌（≥' + CP_SAFE + ' 格）',
        G.enemies.every(e => Math.abs(e.x / TILE - col) >= CP_SAFE), 'col=' + col);
    }
    // 不变量：Boss 一定在最后一块，且营地右端有 8 格高的岩壁封死退路（preboss 块 cols 14/15）
    ok('L' + (li + 1) + ' Boss 右后方岩壁封路',
      isSolidCh(tileChar(G.bossCol + 4, 8)) && isSolidCh(tileChar(G.bossCol + 4, 13)) && !isSolidCh(tileChar(G.bossCol + 4, 5)),
      'col=' + (G.bossCol + 4));
  }
  // 三档共用同一几何：难度只改参数
  for (const d of DIFF_ORDER) {
    setDiff(d); startLevel(1);
    eq(d + ' 档几何与标准档一致', G.grid.map(r => r.join('')).join('|'), (setDiff('normal'), startLevel(1), G.grid.map(r => r.join('')).join('|')));
  }
  setDiff('normal');

  // ============================================================
  // 4. 扫掠碰撞与单向平台
  // ============================================================
  setDiff('normal'); startLevel(0);
  const arena = () => {
    for (let c = 0; c < G.cols; c++) for (let r = 0; r < ROWS; r++) setTile(c, r, r >= GROUND_TOP ? '#' : '.');
    G.enemies.length = 0; G.items.length = 0; G.ebullets.length = 0; G.shots.length = 0;
  };
  // mk 必须同步把镜头推到玩家身上：enemyActive / 弹药出屏都以 camX 为准，
  // 沿用上一段落的旧镜头会让「贴身怪不致死」这类断言空跑（门一关就把判定挡掉了）
  const mk = (x, y) => { const p = makePlayer(x, y); p.invuln = 1e9; G.player = p; G.camX = camFor(x + P_W / 2); G.enemies.length = 0; return p; };
  arena();
  for (let c = 8; c <= 10; c++) setTile(c, 12, 'p');
  let p = mk(9 * TILE, 11 * TILE - P_H - 2);
  p.vy = 200; for (let i = 0; i < 30; i++) updatePlayer(G.player, STEP);
  near('单向平台从上方可落脚', G.player.y + G.player.h, 12 * TILE, 0.01);
  ok('落到单向平台上后 onGround', G.player.onGround === true);
  ok('单向平台站立不抖动（onGround 每帧为真）', (() => {
    for (let i = 0; i < 60; i++) { updatePlayer(G.player, STEP); if (!G.player.onGround) return false; }
    return true;
  })());
  p = mk(9 * TILE, 13 * TILE - P_H + 4); p.vy = -600; p.onGround = false;
  for (let i = 0; i < 20; i++) updatePlayer(G.player, STEP);
  ok('单向平台从下方可穿过（顶头不卡）', G.player.y < 11 * TILE, 'y=' + R2(G.player.y));
  arena();
  for (let r = 10; r <= 13; r++) setTile(12, r, 'X');
  p = mk(11 * TILE - P_W - 1, GROUND_Y - P_H); p.vx = 300;
  clearIn(); IN.right = true;
  for (let i = 0; i < 40; i++) updatePlayer(G.player, STEP);
  near('实心墙挡停（x 贴在墙左）', G.player.x + G.player.w, 12 * TILE - 0.01, 0.5);
  // 撞墙时不做速度清零（松墙即可全速继续跑，手感更顺），但位置必须持续被钉在墙外
  for (let i = 0; i < 40; i++) updatePlayer(G.player, STEP);
  ok('持续推墙 40 帧仍然贴墙不穿', G.player.x + G.player.w < 12 * TILE + 0.5 && G.player.x > 11 * TILE - 1,
    'x=' + R2(G.player.x) + ' vx=' + R2(G.player.vx));
  clearIn();
  arena(); setTile(10, 12, 'X');                 // 1 格薄地板
  p = mk(10 * TILE + 4, 0); p.vy = MAX_FALL; p.onGround = false;
  for (let i = 0; i < 40; i++) updatePlayer(G.player, STEP);
  near('最高下落速度不穿 1 格地板', G.player.y + G.player.h, 12 * TILE, 0.01);
  arena();
  p = mk(6, GROUND_Y - P_H); p.vx = -300;
  clearIn(); IN.left = true;
  for (let i = 0; i < 30; i++) updatePlayer(G.player, STEP);
  ok('左边界墙挡住出图', G.player.x >= 0 && G.player.x < TILE, 'x=' + R2(G.player.x));
  clearIn();
  // 土狼时间：走出平台边缘后 0.09s 内仍可起跳
  for (let c = 0; c < G.cols; c++) for (let r = 0; r < ROWS; r++) setTile(c, r, r >= GROUND_TOP && c < 8 ? '#' : '.');
  p = mk(7 * TILE + 10, GROUND_Y - P_H); p.vx = 220;
  for (let i = 0; i < 8; i++) updatePlayer(G.player, STEP);   // 离开平台
  const coy = G.player.coyote;
  ok('离地后土狼时间还剩一点', coy > 0 && coy <= COYOTE, 'coyote=' + R2(coy));
  IN.jump = true; updatePlayer(G.player, STEP);
  ok('土狼窗口内按跳仍然起跳', G.player.vy < -600, 'vy=' + R2(G.player.vy));
  clearIn();
  // 松手截断：短按比长按跳得低
  const STANDBY = (x, y) => { const q = mk(x, y); for (let i = 0; i < 4; i++) updatePlayer(q, STEP); return q; };
  const jumpHeight = hold => {
    arena(); p = STANDBY(3 * TILE, GROUND_Y - P_H); clearIn();
    const standTop = G.player.y;
    let peak = standTop, f = 0;
    while (f < 90) { IN.jump = f < hold; updatePlayer(G.player, STEP); peak = Math.min(peak, G.player.y); f++; }
    clearIn();
    return standTop - peak;
  };
  const hFull = jumpHeight(90), hTap = jumpHeight(3);
  ok('长按满跳高于短按截断', hFull > hTap + 40, 'full=' + R2(hFull) + ' tap=' + R2(hTap));
  ok('长按满跳高度符合物理公式', Math.abs(hFull - apex) < 8, 'h=' + R2(hFull) + ' apex=' + R2(apex));

  // ============================================================
  // 5. 八向瞄准与量化八向
  // ============================================================
  arena(); p = mk(300, GROUND_Y - P_H); p.dir = 1; p.onGround = true;
  clearIn(); IN.aimUp = true;
  eq('地面+上射（无横向）= 垂直上', aimVec(G.player), { ax: 0, ay: -1 });
  IN.right = true; eq('地面+上射+右 = 前上 45°', aimVec(G.player), { ax: 1, ay: -RGT });
  IN.right = false; IN.aimUp = false; IN.aimDown = true;
  eq('地面下射不生效（地面没有垂直下）', aimVec(G.player), { ax: 1, ay: 0 });
  p.onGround = false; eq('空中+下射 = 垂直下', aimVec(G.player), { ax: 0, ay: 1 });
  IN.right = true; eq('空中+下射+右 = 前下 45°', aimVec(G.player), { ax: 1, ay: RGT });
  clearIn(); p.onGround = true;
  // 量化角：远距离时舱口弹退化成水平线（这条线就是「不许贪满跳」的天花板）
  const core = { x: 5000, y: GROUND_Y - 152 + 52, w: 46, h: 92 };
  const pod = { x: 5000 - 60, y: GROUND_Y - 152, w: 36, h: 30 };
  for (const d of [350, 400, 600]) {
    const pl = { x: 5000 - d, y: GROUND_Y - P_H, w: P_W, h: P_H };
    eq('d=' + d + ' 舱口弹量化为水平', quantAng(pod, pl).toFixed(3), (Math.PI).toFixed(3));
    // 核心比站姿玩家高 37px：真实角带一点下压（角比 π 小），而量化到 45° 网格后被
    // 抹平成 π → 弹全从头顶掠过 —— 玩家报的「Boss 打出来的高度刚好打不到玩家」正是这个
    ok('d=' + d + ' 核心真实角带下压', Math.PI - trueAng(core, pl) > 0.02 && Math.PI - trueAng(core, pl) < 0.25,
      'drop=' + R2(Math.PI - trueAng(core, pl)));
    eq('d=' + d + ' 量化会抹平这份下压（所以核心不许用 quantAng）', quantAng(core, pl).toFixed(3), Math.PI.toFixed(3));
  }
  eq('近距离舱口弹是斜射（45°，可侧移躲）', quantAng(pod, { x: 5000 - 300, y: GROUND_Y - P_H, w: P_W, h: P_H }).toFixed(3), (2.356).toFixed(3));
  // 站姿玩家盒必须整体低于舱口水平线（舱口弹只封空中，不封地面）
  const standTop = GROUND_Y - P_H, podLine = pod.y + pod.h / 2;
  ok('站姿头顶低于舱口水平线（站着不吃舱口弹）', standTop > podLine, 'standTop=' + standTop + ' podLine=' + podLine);
  ok('满跳顶点会撞进舱口线（所以只许小跳）', standTop - apex < podLine + 15, 'apexTop=' + (standTop - apex));
  const hMid = jumpHeight(9);
  ok('中等跳（9 帧）顶点仍在舱口线下方（越擦地弹就用这种跳）', standTop - hMid > podLine + 7,
    'hMid=' + R2(hMid) + ' 安全跳高上限=' + R2(podLine + 7 - standTop));

  // ============================================================
  // 6. 武器 / 弹药 / 榴弹可靠性
  // ============================================================
  // 全部走真实帧路径 update()：单独调 updateShot 会跳过 shotPass 的接触引爆，
  // 那样测出来的「榴弹炸不死人」是测试自己的假象（玩家报的 bug 曾被这层假象掩盖过一次）
  const world = () => { G.scene = 'play'; G.shots.length = 0; G.booms.length = 0; G.ebullets.length = 0; G.timeLeft = 9999; };
  const grenadeRun = (kind, d, opt) => {
    opt = opt || {};
    arena(); p = mk(300, GROUND_Y - P_H); p.gun = 'grenade'; p.level = opt.lv || 1; p.dir = 1; p.onGround = true; clearIn();
    if (opt.wallCol != null) for (let r = 10; r <= 13; r++) setTile(opt.wallCol, r, 'X');
    if (opt.perchCol != null) for (let r = 12; r <= 13; r++) for (let c = opt.perchCol; c <= opt.perchCol + 2; c++) setTile(c, r, 'X');
    const ey = opt.perchCol != null ? 12 * TILE - ENEMY[kind].h
      : GROUND_Y - ENEMY[kind].h - (opt.elev || 0);
    const e = spawnEnemy(kind, 300 + d, ey); e.fireT = 9e9; e.hopT = 9e9;
    world();
    shoot(p);
    for (let f = 0; f < 150 && !G.booms.length; f++) update(STEP);
    return { dead: !!e.dead, hp: e.hp, booms: G.booms.length, boomX: G.booms.length ? Math.round(G.booms[0].x) : null };
  };
  arena();
  for (const gun of GUN_ORDER) {
    p = mk(300, GROUND_Y - P_H); p.gun = gun; p.level = 1; clearIn(); IN.fire = true; world();
    let maxN = 0;
    for (let f = 0; f < 200; f++) { update(STEP); maxN = Math.max(maxN, G.shots.length); }
    ok(gun + ' 同屏弹药不超上限', maxN <= GUNS[gun].cap, 'max=' + maxN + ' cap=' + GUNS[gun].cap);
    clearIn();
  }
  // 散弹必须真的打出扇形（回归：shoot 里的判据写成 g.spread，而 GUNS.spread 没有这个
  // 字段 → 恒为 undefined → 散弹永远只走 [0] 单发，玩家吃了 S 图标「跟步枪没区别」）
  arena(); p = mk(300, GROUND_Y - P_H); p.gun = 'spread'; clearIn(); world();
  for (const lv of [1, 2, 3]) {
    G.shots.length = 0; p.level = lv; shoot(p);
    const want = GUNS.spread.spreadByLevel[lv - 1].length;
    eq('散弹 Lv' + lv + ' 单发弹丸数', G.shots.length, want);
    eq('Lv' + lv + ' 弹丸方向互不相同（不是叠成一发的假扇形）',
      new Set(G.shots.map(b => Math.atan2(b.vy, b.vx).toFixed(4))).size, want);
    near('Lv' + lv + ' 扇形左右对称（角度和为 0）',
      G.shots.reduce((s, b) => s + Math.atan2(b.vy, b.vx), 0) / want, 0, 1e-9);
  }
  // 同屏上限吃紧：宁可把扇形收窄，也不许空放一声枪响却没有子弹（旧版「按开火没有子弹」）
  const stub = n => { for (let i = 0; i < n; i++) G.shots.push({ gun: 'rifle', x: -9999, y: 0, w: 1, h: 1, vx: 0, vy: 0, life: 0, hit: [], remove: false }); };
  const allOff = GUNS.spread.spreadByLevel[2];
  p.level = 3; world(); stub(GUNS.spread.cap);
  const firedA = p.shotsFired;
  shoot(p);
  eq('弹药位满时不计开火、不出弹', p.shotsFired, firedA);
  ok('弹药位满时改 50ms 后重试（而不是硬等完整冷却还放枪声）', p.fireCd === 0.05, 'cd=' + p.fireCd);
  for (const room of [3, 2]) {
    world(); stub(GUNS.spread.cap - room);
    shoot(p);
    const kept = G.shots.filter(b => b.gun === 'spread').map(b => Math.atan2(b.vy, b.vx));
    eq('只剩 ' + room + ' 个弹药位时出 ' + room + ' 颗', kept.length, room);
    const dropped = allOff.filter(o => !kept.some(k => Math.abs(k - o) < 1e-9));
    ok(room + ' 颗截断取最靠中心的（扇形宁可收窄不歪成一边）',
      Math.max(...kept.map(Math.abs)) <= Math.min(...dropped.map(Math.abs)) + 1e-9,
      'kept=' + JSON.stringify(kept.map(R2)) + ' dropped=' + JSON.stringify(dropped.map(R2)));
  }
  world();
  // 榴弹：一发只炸一次，炸完必须回收（否则长期占住 cap 位 → 「按开火没有子弹」）。
  // 注意 booms 会被 updateFx 老化清空，所以「炸了几次」要数 0→非 0 的边沿而不是查终态
  arena(); p = mk(300, GROUND_Y - P_H); p.gun = 'grenade'; p.level = 1; clearIn(); world();
  shoot(p);
  let boomEdge = 0, wasBoom = 0;
  for (let f = 0; f < 200; f++) {
    update(STEP);
    if (G.booms.length && !wasBoom) boomEdge++;
    wasBoom = G.booms.length;
  }
  eq('单发榴弹只引爆一次', boomEdge, 1);
  eq('单发榴弹引爆后弹药被回收', G.shots.length, 0);
  // 连发 300 帧：弹药位必须持续被释放（回归「开火没有子弹」）
  arena(); p = mk(300, GROUND_Y - P_H); p.gun = 'grenade'; p.level = 1; clearIn(); world(); IN.fire = true;
  const fired0 = G.player.shotsFired;
  let capHit = 0;
  for (let f = 0; f < 300; f++) { update(STEP); capHit = Math.max(capHit, G.shots.length); }
  clearIn();
  ok('榴弹连发持续出弹（未被引爆残留占位）', G.player.shotsFired - fired0 >= 8, 'fired=' + (G.player.shotsFired - fired0));
  ok('榴弹连发同屏不超 3', capHit <= 3, 'max=' + capHit);
  // 全距离可杀：杀伤带必须连续（玩家报过的「只有扔到某一个精确点才有伤害」回归）。
  // 上界是设计天花板而非缺陷：抛体落点约 409px + 溅射 92px，超出即打不到，防止榴弹变成核弹。
  const band = (kind, lo, hi) => {
    const miss = [];
    for (let d = lo; d <= hi; d += 20) if (!grenadeRun(kind, d).dead) miss.push(d);
    ok(kind + ' 杀伤带 ' + lo + '~' + hi + ' 连续无空洞', miss.length === 0, '漏杀 d=' + JSON.stringify(miss));
  };
  band('R', 60, 500); band('T', 60, 460);
  ok('R 超出杀伤带（560px）不炸', grenadeRun('R', 560).dead === false);
  ok('T 超出杀伤带（520px）不炸', grenadeRun('T', 520).dead === false);
  eq('每发只引爆一次（杀伤带内 booms 恒为 1）', grenadeRun('R', 200).booms, 1);
  ok('爆炸伤害按炮塔校准（一发带走标准炮塔）', GUNS.grenade.dmg + 3 >= ENEMY.T.hp,
    'blast=' + (GUNS.grenade.dmg + 3) + ' T.hp=' + ENEMY.T.hp);
  eq('升级提升爆炸伤害（Lv3 = dmg+3+2）', GUNS.grenade.dmg + 3 + 2, 8);
  // 撞墙即炸：掩体后的兵吃溅射（旧版会把 vx 反向弹回玩家脚边，掩体后完全免伤）
  const wallCase = d => {
    const r = grenadeRun('R', d, { wallCol: Math.floor((300 + d - 40) / TILE) });
    return { dead: r.dead, boomX: r.boomX, wallX: Math.floor((300 + d - 40) / TILE) * TILE };
  };
  for (const d of [140, 200, 260, 320, 380, 440]) {
    const r = wallCase(d);
    ok('掩体后的兵被撞墙引爆的溅射杀掉 d=' + d, r.dead && r.boomX <= r.wallX + 1, JSON.stringify(r));
  }
  // 高架（3 格箱顶）目标：半径 92 的溅射要够得到
  for (const d of [180, 240, 300, 360]) {
    ok('箱顶上的兵吃得到溅射 d=' + d, grenadeRun('R', d, { perchCol: Math.floor((300 + d) / TILE) }).dead);
  }
  // 跳起来的兵不能整发免伤（旧版用中心距判定，抬升几十像素就全发免伤）
  for (const d of [200, 300, 380]) {
    ok('腾空 60px 的兵照样炸死 d=' + d, grenadeRun('R', d, { elev: 60 }).dead);
  }
  // 爆炸判定用矩形最近点而非中心距：半径边界内为真、外为假
  ok('blastHit 半径内为真', blastHit({ x: 100, y: 100, w: 20, h: 20 }, 100 + 20 + BLAST_R - 2, 110) === true);
  ok('blastHit 半径外为假', blastHit({ x: 100, y: 100, w: 20, h: 20 }, 100 + 20 + BLAST_R + 2, 110) === false);
  // 镜头拾取：同型升级、异型重置、侦察兵 +1 命（拾取受无敌帧门控，必须用真实无敌=0 的玩家）
  arena(); p = mk(300, GROUND_Y - P_H); p.gun = 'rifle'; p.level = 1; p.invuln = 0;
  const grab = (type, x) => { spawnItem(type, Math.floor(x / TILE), 13); const it = G.items[G.items.length - 1]; it.x = x; it.y = GROUND_Y - 20; contactPass(STEP); return it; };
  grab('machine', 306); eq('吃到机枪镜头 → 换枪 Lv1', [G.player.gun, G.player.level], ['machine', 1]);
  G.player.x = 300; grab('machine', 306); eq('再吃同型 → Lv2', G.player.level, 2);
  G.player.x = 300; grab('spread', 306); eq('吃异型 → 换枪并重置 Lv1', [G.player.gun, G.player.level], ['spread', 1]);
  G.player.x = 300; const lv0 = G.lives; grab('sensor', 306); eq('侦察兵 +1 命', G.lives, lv0 + 1);

  // ============================================================
  // 7. 敌人行为
  // ============================================================
  arena(); p = mk(600, GROUND_Y - P_H);
  const eR = spawnEnemy('R', 600 + 300, GROUND_Y - ENEMY.R.h); eR.hopT = 999; eR.fireT = 999;
  // 玩家在 600、兵在右侧 900：逼近 = 向左（vx<0），后撤 = 向右（vx>0）
  updateEnemy(eR, STEP); ok('远距离突击兵向玩家逼近', eR.vx < 0, 'vx=' + eR.vx);
  eR.x = 600 + 150; updateEnemy(eR, STEP); ok('枪线内突击兵站定对射', eR.vx === 0, 'vx=' + eR.vx);
  eR.x = 600 + 60; updateEnemy(eR, STEP); ok('贴脸突击兵后撤拉开枪线（不白给）', eR.vx > 0, 'vx=' + eR.vx);
  arena(); p = mk(600, GROUND_Y - P_H);
  const eT = spawnEnemy('T', 600 + 400, GROUND_Y - ENEMY.T.h); eT.fireT = 0; eT.hopT = 999;
  updateEnemy(eT, STEP);
  ok('炮台不移动', eT.vx === 0 && eT.x === 1000);
  ok('炮台开火前有预警', eT.windup > 0);
  G.ebullets.length = 0;
  let firstBulletAt = -1;
  for (let f = 0; f < 60; f++) { updateEnemy(eT, STEP); if (G.ebullets.length && firstBulletAt < 0) firstBulletAt = f; }
  ok('预警到出弹间隔 ≥ 0.4s（有反应窗）', firstBulletAt >= WINDUP * 60 - 1, 'frame=' + firstBulletAt);
  const eb = G.ebullets[0];
  near('炮台弹沿量化八向', (Math.atan2(eb.vy, eb.vx) / (Math.PI / 4)) % 1, 0, 1e-9);
  arena(); p = mk(600, GROUND_Y - P_H);
  const eF = spawnEnemy('F', 600, 100); eF.fireT = 0;
  const y0 = eF.y; for (let f = 0; f < 60; f++) updateEnemy(eF, STEP);
  ok('空降舱向下压向玩家上方', eF.y > y0, 'y ' + y0 + '→' + R2(eF.y));
  ok('空降舱投弹是垂直向下', G.ebullets.some(q => Math.abs(q.vx) < 1e-12 && q.vy > 0),
    JSON.stringify(G.ebullets.map(q => [R2(q.vx), R2(q.vy)])));
  arena(); p = mk(600, GROUND_Y - P_H);
  const eB = spawnEnemy('B', 900, GROUND_Y - ENEMY.B.h);
  G.ebullets.length = 0;
  for (let f = 0; f < 60; f++) updateEnemy(eB, STEP);
  ok('爬行虫贴地冲锋', eB.x < 900 && eB.vx < 0);
  eq('爬行虫不开枪（近战兵种）', G.ebullets.length, 0);
  // enemyActive 门控在 update() 的调度循环里（updateEnemy 自身不设门控），所以必须走整帧路径来测
  arena(); p = mk(600, GROUND_Y - P_H); G.scene = 'play'; G.timeLeft = 9999;
  const eFar = spawnEnemy('R', G.camX + VW + 900, GROUND_Y - ENEMY.R.h);
  const x0 = eFar.x; for (let f = 0; f < 30; f++) update(STEP);
  ok('屏幕外敌人不推进（enemyActive 门控）', eFar.x === x0 && !enemyActive(eFar), 'x=' + R2(eFar.x) + ' x0=' + R2(x0));

  // ============================================================
  // 8. Boss：门控 / 弹幕 / 增援红线
  // ============================================================
  // 激活判据是「玩家右边越过 -VW*0.62 这条线」，所以未激活要把整个盒子都留在门外
  clearIn();
  setDiff('normal'); startLevel(2);
  p = G.player; p.x = G.bossCol * TILE - VW * 0.62 - P_W - 20;
  updatePlayer(p, STEP); ok('营地外 Boss 不激活', !G.boss.active, 'x=' + R2(p.x));
  p.x = G.bossCol * TILE - VW * 0.62; updatePlayer(p, STEP);
  ok('踏入营地即激活', G.boss.active === true);
  // 跨图门控：玩家退回营地之外，基地不再开火
  G.ebullets.length = 0; p.x = G.bossCol * TILE - VW * 1.2; p.invuln = 1e9;
  for (let f = 0; f < BOSS_CYCLE + 30; f++) { G.player.x = p.x; updateBoss(STEP); }
  eq('退出营地射程后零弹幕（不跨图追杀）', G.ebullets.length, 0);
  // 营地内会开火
  G.ebullets.length = 0; p.x = G.bossCol * TILE - 350;
  for (let f = 0; f < 120; f++) { G.player.x = p.x; G.player.y = GROUND_Y - P_H; updateBoss(STEP); }
  ok('营地内基地持续开火', G.ebullets.length > 0, 'eb=' + G.ebullets.length);
  // 核心弹道三层（回归玩家报的「Boss 火力太容易躲，打出来的高度刚好打不到玩家」）：
  // 追身弹用真实角打站桩、擦地弹逼起跳、舱口水平线只封空中
  const bx = G.bossCol * TILE, corePart = bossCore(), podPart = G.boss.parts[1];
  const stand = { x: bx - 350 - P_W, y: GROUND_Y - P_H, w: P_W, h: P_H };
  ok('舱口弹远距离退化为水平线（它只负责封跳跃带）', Math.abs(quantAng(podPart, stand) - Math.PI) < 1e-9);
  ok('水平舱口线高于站姿头顶（站着不吃舱口弹）', podPart.y + podPart.h / 2 < stand.y, 'line=' + (podPart.y + podPart.h / 2));
  const aimHits = (d, hop) => {
    const tgt = { x: bx - d - P_W, y: GROUND_Y - P_H, w: P_W, h: P_H };
    const box = { x: tgt.x, y: tgt.y - (hop || 0), w: P_W, h: P_H };
    G.ebullets.length = 0;
    fireEnemyBullet(corePart, trueAng(corePart, tgt), BOSS_AIM_SPD[G.boss.tier - 1], 14, 14, '#ff5d5d');
    const q = G.ebullets[0];
    for (let f = 0; f < 300; f++) {
      updateEbullet(q, STEP);
      if (aabb(box, q)) return true;
      if (q.x + q.w < tgt.x) return false;
    }
    return false;
  };
  for (const d of [350, 600, 900]) ok('d=' + d + ' 站着不动必吃核心追身弹', aimHits(d, 0));
  ok('追身弹存在跳越净空（是「要动」不是「必中」）', aimHits(600, 60) === false);
  // 擦地弹走完整伤害路径：站着必死、掐准时机起跳必活。探针放在营地激活线外，
  // 否则 Boss 自己的追身/抛壳/天降弹会混进来把「站桩必死」变成空断言
  setDiff('normal'); startLevel(2); mk(bx - 700 - P_W, GROUND_Y - P_H);
  ok('擦地弹探针在营地激活线外（不被其它弹幕污染）', !G.boss.active,
    'x=' + R2(G.player.x) + ' line=' + R2(bx - VW * 0.62));
  const lowRun = (hold, start) => {
    setDiff('normal'); startLevel(2);
    const pl = mk(bx - 700 - P_W, GROUND_Y - P_H); pl.invuln = 0;
    G.timeLeft = 9999; G.ebullets.length = 0;
    G.ebullets.push({
      x: pl.x + pl.w + 200, y: GROUND_Y - BOSS_LOW_H, w: 16, h: BOSS_LOW_H,
      vx: -BOSS_LOW_SPD[G.boss.tier - 1] * DIFFS.normal.enemyMul, vy: 0,
      life: 0, col: '#ff8a4a', remove: false, low: true,
    });
    let hit = false;
    for (let f = 0; f < 130 && !hit; f++) {
      IN.jump = hold > 0 && f >= start && f < start + hold;
      update(STEP);
      hit = !!G.player.dead;
    }
    clearIn();
    return hit;
  };
  ok('擦地弹打中站着不动的玩家', lowRun(0, 0));
  let clearedAt = -1;
  for (let s = 8; s <= 62 && clearedAt < 0; s++) if (!lowRun(9, s)) clearedAt = s;
  ok('擦地弹有能跳过的起跳窗口（不是必死）', clearedAt > 0, '首个可跳窗口 start=' + clearedAt);
  // 增援红线：tier3 同屏 ≤ 2 且只出近战（必须重新激活：上面 lowRun 把关卡重开过，
  // 沿用未激活的 Boss 会让 updateBoss 直接 return，两条断言变成空跑）
  setDiff('normal'); startLevel(2); bossActivate();
  mk(bx - 350 - P_W, GROUND_Y - P_H); G.player.invuln = 1e9;
  ok('增援探针内 Boss 已激活（否则本段断言空跑）', G.boss.active === true);
  G.ebullets.length = 0;
  let maxReinf = 0, onlyMelee = true;
  for (let f = 0; f < BOSS_CYCLE * 2; f++) {
    G.player.x = bx - 350 - P_W; G.player.y = GROUND_Y - P_H; G.player.invuln = 1e9;
    updateBoss(STEP);
    const live = G.enemies.filter(e => e.reinf && !e.dead && !e.remove);
    maxReinf = Math.max(maxReinf, live.length);
    if (live.some(e => e.kind !== 'B')) onlyMelee = false;
  }
  ok('增援封顶 2 个（同点站桩弹幕墙红线）', maxReinf <= 2, 'max=' + maxReinf);
  ok('增援只用近战爬行虫（玩家已被追身/擦地两路占满，再塞 ranged 即三条无解）', onlyMelee);
  // 核心血量随难度缩放（要塞核心 bossCore=120 × enemyHp）
  for (const [d, want] of [['easy', 84], ['normal', 120], ['hard', 162]]) {
    setDiff(d); startLevel(2);
    eq(d + ' 档核心血量', bossCore().hp, want);
    eq(d + ' 档弹药舱血量', G.boss.parts[1].hp, d === 'easy' ? 3 : d === 'normal' ? 4 : 5);
  }
  // 打掉核心 → clear 演出 → result 结算 + 解锁推进
  setDiff('normal'); startLevel(2); G.unlock = 2;
  bossActivate();
  damageBoss(bossCore(), 99999);
  eq('核心摧毁先进入过关演出', G.scene, 'clear');
  for (let f = 0; f < 200 && G.scene === 'clear'; f++) update(STEP);
  eq('过关演出后进结算面板', G.scene, 'result');
  eq('通关解锁下一关', G.unlock, 3);
  ok('结算数据齐全', !!(G.lastResult && G.lastResult.timeBonus >= 0 && G.lastResult.lifeBonus >= 0 && G.lastResult.total > 0), JSON.stringify(G.lastResult));
  clearIn();

  // ============================================================
  // 9. 死亡 · 检查点 · 时限
  // ============================================================
  setDiff('normal'); startLevel(0);
  p = G.player; G.lives = 30;
  G.timeLeft = 0.01; G.timeUp = false;
  let livesBefore = G.lives;
  for (let f = 0; f < 600 && G.scene === 'play'; f++) update(STEP);
  eq('时间耗尽 → 直接结算 over', G.scene, 'over');
  eq('时间耗尽的失败原因', G.overReason, '时间耗尽');
  ok('时间耗尽只扣一条命（回归「秒复活秒死」）', livesBefore - G.lives === 1, 'lives ' + livesBefore + '→' + G.lives);
  // 时限耗尽后不允许再被判死刷命
  const l2 = G.lives; for (let f = 0; f < 300; f++) update(STEP);
  eq('over 之后不再掉命', G.lives, l2);
  // 检查点复活（开局自带 SPAWN_GRACE 保护窗，测死亡流程必须先让保护期失效）
  setDiff('normal'); startLevel(0); G.lives = 30;
  p = G.player; p.checkIdx = 1; G.checkIdx = 1; p.invuln = 0;
  const cpX = G.checkpoints[1].x;
  killPlayer(false);
  for (let f = 0; f < 120 && G.player === p; f++) update(STEP);
  near('死亡后在检查点复活', G.player.x, cpX, 1);
  eq('复活扣一条命', G.lives, 29);
  ok('复活有保护窗口', G.player.invuln > SPAWN_GRACE - 0.1, 'inv=' + R2(G.player.invuln));
  // 保护窗口内接触敌人不收命
  arena(); p = mk(300, GROUND_Y - P_H); p.invuln = SPAWN_GRACE;
  const hug = spawnEnemy('B', 302, GROUND_Y - ENEMY.B.h); hug.fireT = 999;
  contactPass(STEP); ok('保护窗口内贴身怪不致死', !G.player.dead);
  G.player.invuln = 0; contactPass(STEP); ok('窗口结束后贴身怪收命', !!G.player.dead);
  // 掉坑：静默死亡 → 回到上一个检查点，不送圈进度
  setDiff('normal'); startLevel(0); G.lives = 30;
  const pOld = G.player;
  G.checkIdx = 0; pOld.checkIdx = 0;
  pOld.x = 87 * TILE; pOld.y = GROUND_Y; pOld.vy = 400; pOld.invuln = 0;   // L1 第一个坑
  for (let f = 0; f < 300 && G.player === pOld; f++) update(STEP);
  ok('掉坑后回到检查点（不越坑送进度）', G.player !== pOld &&
    Math.abs(G.player.x - G.checkpoints[0].x) < 2, 'x=' + R2(G.player.x));
  eq('掉坑扣一条命', G.lives, 29);
  // 人命耗尽
  setDiff('normal'); startLevel(0); G.lives = 0; G.timeLeft = 99;
  G.player.invuln = 0; G.overReason = '';
  killPlayer(false); for (let f = 0; f < 200; f++) update(STEP);
  eq('命耗尽 → over', G.scene, 'over');
  eq('命耗尽的失败原因', G.overReason, '人命耗尽');

  // ============================================================
  // 10. 确定性重放
  // ============================================================
  const traceRun = () => {
    setDiff('normal'); G.score = 0; startLevel(0);
    const H = [];
    for (let f = 0; f < 900; f++) {
      clearIn();
      IN.fire = true; IN.right = true;
      IN.jump = (f % 47) < 6;
      IN.aimUp = (f % 113) < 20;
      update(STEP);
      H.push(G.player.x.toFixed(6) + ',' + G.player.y.toFixed(6) + ',' + G.score + ',' +
        G.enemies.length + ',' + G.ebullets.length + ',' + G.shots.length + ',' + G.lives);
    }
    clearIn();
    let h = 2166136261;
    for (const s of H.join('|')) { h ^= s.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  const t1 = traceRun(), t2 = traceRun();
  eq('同种子 + 同输入 → 逐帧完全一致', t1, t2);
  ok('重放不是空跑（有实际推进）', t1 !== 0);
  // 换输入必然换轨迹（防止「什么都没跑」也哈希相等）
  setDiff('normal'); G.score = 0; startLevel(0);
  const t3 = (() => { for (let f = 0; f < 900; f++) { clearIn(); IN.fire = true; update(STEP); } let h = 2166136261; const s = G.player.x.toFixed(6) + ',' + G.score; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; })();
  ok('不同输入产生不同状态', t3 !== t1);
  clearIn();

  // ============================================================
  // 11. 面板内 UI（全部代码绘制 + 布局对称）
  // ============================================================
  eq('零 DOM 弹层：整局只取过 #game 一个元素', Object.keys(global.__els), ['game']);
  const uw = id => G.ui.filter(u => u.id === id).map(u => ({ x: (u.sx - OX) / U, y: (u.sy - OY) / U, w: u.sw / U, h: u.sh / U }));
  const inView = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= VW && r.y + r.h <= VH;
  G.scene = 'menu'; G.unlock = 3; resize(); drawScene();
  const btns = ['btn开始突击', 'btn选择阵地', 'btn音效：开', 'btn音效：关'].map(uw).filter(a => a.length).map(a => a[0]);
  eq('主菜单三个主按钮', btns.length, 3);
  ok('主按钮等宽', btns.every(b => Math.abs(b.w - btns[0].w) < 1e-6), JSON.stringify(btns.map(b => R2(b.w))));
  ok('主按钮等距', Math.abs((btns[1].x - btns[0].x) - (btns[2].x - btns[1].x)) < 1e-6);
  near('主按钮行与面板左右边缘对齐（面板 102..762）', btns[0].x, 102, 0.01);
  near('主按钮行右缘对齐', btns[2].x + btns[2].w, 762, 0.01);
  const pills = ['diffeasy', 'diffnormal', 'diffhard'].map(uw).map(a => a[0]);
  ok('难度胶囊等宽', pills.every(r => Math.abs(r.w - pills[0].w) < 1e-6), JSON.stringify(pills.map(r => R2(r.w))));
  ok('难度胶囊等距', Math.abs((pills[1].x - pills[0].x) - (pills[2].x - pills[1].x)) < 1e-6);
  near('难度胶囊行左缘 = 面板内缩 28', pills[0].x, 130, 0.01);
  near('难度胶囊行右缘 = 面板内缩 28', pills[2].x + pills[2].w, 734, 0.01);
  ok('主菜单所有点击区都在视口内', G.ui.every(u => inView({ x: (u.sx - OX) / U, y: (u.sy - OY) / U, w: u.sw / U, h: u.sh / U })),
    G.ui.map(u => u.id).join(','));
  // 点一下就有反应（命中区与回调真的接上了）：当前档位是 normal，点第一格 easy 才算「切档」
  const pillCenter = { x: pills[0].x + pills[0].w / 2, y: pills[0].y + pills[0].h / 2 };
  G.diff = 'normal'; uiHit(d2sx(pillCenter.x), d2sy(pillCenter.y));
  eq('点难度胶囊真的切档', G.diff, 'easy');
  G.diff = 'normal';
  const b0 = uw('btn选择阵地')[0];
  uiHit(d2sx(b0.x + b0.w / 2), d2sy(b0.y + b0.h / 2));
  eq('点「选择阵地」进选关页', G.scene, 'levels');
  drawScene();
  const cards = uw('btn进入');
  eq('选关页三张卡（解锁后）', cards.length, 3);
  ok('卡片等宽等距', cards.every(c => Math.abs(c.w - cards[0].w) < 1e-6) &&
    Math.abs((cards[1].x - cards[0].x) - (cards[2].x - cards[1].x)) < 1e-6);
  near('卡片行左右留白相等（面板 72..792）', cards[0].x - 72, 792 - (cards[2].x + cards[2].w), 0.01);
  const back = uw('btn返回主菜单')[0];
  uiHit(d2sx(back.x + back.w / 2), d2sy(back.y + back.h / 2));
  eq('返回按钮回主菜单', G.scene, 'menu');
  // 竖屏虚拟键：六键不重叠、都在键条内、中心命中自己
  global.window.innerWidth = 390; global.window.innerHeight = 844;
  resize(); ok('竖屏判定生效', PORTRAIT === true);
  eq('竖屏键条高度受上限约束', BAR_H, Math.min(158, 844 * 0.24));
  const ks = Object.keys(KEYS);
  eq('虚拟键六键', ks, ['left', 'right', 'aimUp', 'aimDown', 'fire', 'jump']);
  let overlap = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = KEYS[ks[i]], b = KEYS[ks[j]];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlap.push(ks[i] + '/' + ks[j]);
  }
  eq('虚拟键互不重叠', overlap, []);
  ok('虚拟键都在键条内', ks.every(k => KEYS[k].x >= 0 && KEYS[k].y >= H - BAR_H - 1 && KEYS[k].x + KEYS[k].w <= W + 1 && KEYS[k].y + KEYS[k].h <= H + 1));
  // 命中容差 ±6 也不能把邻键的中心抢走：每个键中心必须命中自己
  eq('每个虚拟键中心都能命中自己', ks.map(k => keyHit(KEYS[k].x + KEYS[k].w / 2, KEYS[k].y + KEYS[k].h / 2)), ks);
  global.window.innerWidth = 1200; global.window.innerHeight = 800; resize();
  clearIn();
  // 暂停 / 结算 / 失败 / 通关面板都要有可点区
  for (const [scene, setup] of [['pause', () => {}], ['result', () => {}], ['over', () => {}], ['win', () => {}]]) {
    G.scene = scene; drawScene();
    ok(scene + ' 面板有可点区', G.ui.length >= 2, 'ui=' + G.ui.length);
  }
  G.scene = 'play';

  // ============================================================
  // 12. localStorage 九格纪录
  // ============================================================
  // 前面段落（结算/过关）会写档，测「分格」必须从空档开始
  G.best = {}; localStorage.removeItem(BEST_KEY); localStorage.removeItem(UNLOCK_KEY); localStorage.removeItem(DIFF_KEY);
  setDiff('normal'); G.levelIdx = 1; G.score = 12345; saveBest();
  eq('纪录按 难度_关卡 分格', JSON.parse(localStorage.getItem(BEST_KEY)), { normal_1: 12345 });
  G.score = 999; saveBest();
  eq('更低分不覆盖纪录', G.best['normal_1'], 12345);
  G.score = 20000; saveBest();
  eq('更高分刷新纪录', G.best['normal_1'], 20000);
  for (const d of DIFF_ORDER) for (let i = 0; i < 3; i++) { G.diff = d; G.levelIdx = i; G.score = 1000 + i * 10 + DIFF_ORDER.indexOf(d); saveBest(); }
  eq('三档 × 三关 = 九格全独立', Object.keys(G.best).length, 9);
  G.diff = 'hard'; G.unlock = 2; saveBest();
  eq('解锁进度单独存 key', localStorage.getItem(UNLOCK_KEY), '2');
  saveDiff(); eq('难度偏好持久化', localStorage.getItem(DIFF_KEY), 'hard');
  loadBest(); loadDiff(); loadUnlock();
  eq('读档回灌一致', [G.diff, G.unlock, G.best['hard_2']], ['hard', 2, 1022]);
  G.diff = 'normal'; G.levelIdx = 0;

  // ============================================================
  // 12b. 音频节点生命周期（无头里 AC 一直是 null 会整段短路，所以必须挂桩才能测到）
  //   真实浏览器对「未 start 先 stop」直接抛 InvalidStateError，而 tone() 是在开火、
  //   受击、爆炸这些同步玩法调用链里被调的——一抛就把 rAF 主循环打断（游戏当场冻死）。
  // ============================================================
  const mkParam = () => ({
    value: 0, setValueAtTime() {},
    exponentialRampToValueAtTime(target) { if (!(target > 0)) throw new Error('exponentialRamp 目标必须为正: ' + target); },
  });
  const alog = [];
  const mkNode = kind => {
    const n = {
      kind, started: false, connect() {}, disconnect() {}, onended: null,
      start() { if (n.started) throw new Error('重复 start'); n.started = true; alog.push('start'); },
      stop() { if (!n.started) throw new Error('InvalidStateError: stop 在 start 之前'); alog.push('stop'); },
    };
    if (kind === 'osc' || kind === 'filter') { n.frequency = mkParam(); n.type = ''; }
    if (kind === 'filter') n.Q = mkParam();
    if (kind === 'gain') n.gain = mkParam();
    if (kind === 'comp') { n.threshold = mkParam(); n.knee = mkParam(); n.ratio = mkParam(); n.attack = mkParam(); n.release = mkParam(); }
    return n;
  };
  global.window.AudioContext = function () {
    this.currentTime = 0; this.sampleRate = 44100; this.destination = mkNode('dest');
    this.createGain = () => mkNode('gain');
    this.createOscillator = () => mkNode('osc');
    this.createBufferSource = () => mkNode('bufsrc');
    this.createBiquadFilter = () => mkNode('filter');
    this.createDynamicsCompressor = () => mkNode('comp');
    this.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len) });
  };
  AC = null; master = null; voices = 0; muted = false;
  ensureAC();
  ok('音频总线已建立（master 增益 + 压缩器）', !!AC && !!master);
  let audioErr = null, sfxCalls = 0;
  for (const k of Object.keys(SFX)) {
    try { G.t += 0.2; voices = 0; SFX[k](); sfxCalls++; }
    catch (e) { audioErr = k + ' → ' + e.message; break; }
  }
  ok('全部 ' + sfxCalls + ' 个音效都能安全触发（无 start/stop 乱序、无非正 ramp）', audioErr === null, audioErr || '');
  // 噪声源靠 buffer 播完自然结束（不该调 stop），振荡器必须排到 stop：
  // 顺序违规由上面 mock 的「stop 前必须已 start」直接抛错兜住，这里只断言真的有节点在动
  ok('确实建立了发声节点', alog.filter(s => s === 'start').length >= sfxCalls,
    'starts=' + alog.filter(s => s === 'start').length + ' sfx=' + sfxCalls);
  // 声部限流：连开 60 枪也不能把节点数推到无限（额度只由 onended 归还）
  voices = 0; alog.length = 0;
  for (let i = 0; i < 60; i++) tone(700, 0.05, 'square', 0.09, -300);
  ok('同屏声部不超上限', alog.filter(s => s === 'start').length <= MAX_VOICES, 'starts=' + alog.filter(s => s === 'start').length);
  eq('额度归还后能继续发声', (() => { const before = alog.length; voices = 0; tone(700, 0.05); return alog.length > before; })(), true);
  // 静音开关必须真的不建节点
  voices = 0; muted = true; alog.length = 0; SFX.shot(); SFX.boom(); SFX.die();
  eq('静音时零节点', alog.length, 0);
  muted = false;
  // 收尾还原：后面的 Bot 九格不挂音频，保持与玩家真实离线一致
  AC = null; master = null; voices = 0; delete global.window.AudioContext;

  // ============================================================
  // 13. Bot 九格：只用 IN 输入驱动，3 档 × 3 关全部打到 result
  // ============================================================
  if (QUICK) { report(); return; }
  // ---- MPC 规划器（与调参沙盒同一套：候选控制前向模拟，选活得最久+走得最远+顺手捡镜头）----
  const muzzleY = q => q.y + q.h - MUZZLE;
  const boxCy = q => q.y + q.h / 2;
  const boxCx = q => q.x + q.w / 2;
  // HOR 要盖得住一发敌弹的飞行时间：突击兵弹速 300px/s，295px 枪线 ≈ 1s = 60 帧，
  // 视距必须 > 60 帧，否则 Bot 只来得及「看到枪响」却来不及安排一次掐点的延后起跳
  const HOR = 78;
  const PLANS = [
    { d: 1, j: -1, h: 0 },
    { d: 1, j: 0, h: 9 }, { d: 1, j: 8, h: 9 }, { d: 1, j: 16, h: 9 }, { d: 1, j: 26, h: 9 }, { d: 1, j: 38, h: 9 },
    { d: 1, j: 0, h: 24 }, { d: 1, j: 10, h: 24 },
    { d: 0, j: -1, h: 0 }, { d: 0, j: 0, h: 9 }, { d: 0, j: 16, h: 9 }, { d: 0, j: 32, h: 9 },
    { d: -1, j: -1, h: 0 }, { d: -1, j: 0, h: 9 }, { d: -1, j: 16, h: 9 },
  ];
  function hazards(q) {
    const hb = []; const x0 = q.x - 260, x1 = q.x + 340;
    for (const b of G.ebullets) {
      if (b.remove) continue;
      if (b.vx === 0 && b.vy === 0) continue;
      const cx = boxCx(b) + b.vx * STEP * HOR, cy = boxCy(b) + b.vy * STEP * HOR;
      if (Math.min(boxCx(b), cx) > x1 || Math.max(boxCx(b), cx) < x0) continue;
      if (Math.min(b.y, cy) > q.y + 200) continue;
      hb.push({ x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx, vy: b.vy });
    }
    return hb;
  }
  function bodies(q) {
    const bs = []; const x0 = q.x - 300, x1 = q.x + 380;
    for (const e of G.enemies) {
      if (e.dead || e.remove || !enemyActive(e)) continue;
      if (e.x < x0 || e.x > x1) continue;
      // 敌人纵向外推只用「当前 vy 的抛体」：起跳的*发起*不预报——预报会让 Bot 把
      // 「对手起跳压到我头顶」当成全方案必死，反而站在原地吃枪。空降舱缓慢下压，按静止算
      const fly = !!ENEMY[e.kind].fly;
      bs.push({ x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx || 0, vy: fly ? 0 : e.vy || 0, base: fly ? VH : e.baseY, hopAt: -1 });
    }
    if (G.boss && G.boss.active && !G.boss.dead) {
      for (const b of G.boss.parts) if (b.alive && b.x < x1) bs.push({ x: b.x, y: b.y, w: b.w, h: b.h, vx: 0, vy: 0, base: b.y, hopAt: -1 });
    }
    return bs;
  }
  function bodyBox(e, i, dt) {
    const t = (i + 1) * dt; let y = e.y;
    if (e.hopAt >= 0) {
      const tt = Math.max(0, i + 1 - e.hopAt) * dt;
      y = e.y + (i + 1 >= e.hopAt ? -e.hopV * tt + 0.5 * GRAV * tt * tt : 0);
    } else y = e.y + e.vy * t + 0.5 * GRAV * t * t;
    if (y > e.base) y = e.base;
    return { x: e.x + e.vx * t, y, w: e.w, h: e.h };
  }
  function runPlan(pl0, plan, hb, bs, items, capX, band, ratchet, noJump) {
    const dt = STEP;
    const o = { x: pl0.x, y: pl0.y, w: P_W, h: P_H };
    let vx = pl0.vx, vy = pl0.vy, onG = pl0.onGround, coyote = pl0.coyote, jbuf = pl0.jbuf, jheld = pl0.jumpHeld, prevJump = jumpWasDown;
    let got = 0, surv = HOR;
    for (let i = 0; i < HOR; i++) {
      const j = !noJump && plan.j >= 0 && i >= plan.j && i < plan.j + plan.h;
      const acc = onG ? ACC : AIR_ACC;
      if (plan.d > 0) { if (vx < RUN_MAX) vx = Math.min(vx + acc * dt, RUN_MAX); }
      else if (plan.d < 0) { if (vx > -RUN_MAX) vx = Math.max(vx - acc * dt, -RUN_MAX); }
      else if (onG) { const f = FRICTION * dt; if (Math.abs(vx) <= f) vx = 0; else vx -= Math.sign(vx) * f; }
      else vx *= (1 - 0.25 * dt);
      if (vx > RUN_MAX) vx = Math.max(RUN_MAX, vx - 1100 * dt);
      if (vx < -RUN_MAX) vx = Math.min(-RUN_MAX, vx + 1100 * dt);
      if (j && !prevJump) jbuf = JBUF;
      prevJump = j;
      jbuf = Math.max(0, jbuf - dt);
      coyote = onG ? COYOTE : Math.max(0, coyote - dt);
      if (jbuf > 0 && coyote > 0) { vy = -JUMP_V; onG = false; coyote = 0; jbuf = 0; jheld = true; }
      if (!j && jheld && vy < -JUMP_CUT) { vy = -JUMP_CUT; jheld = false; }
      if (vy >= 0) jheld = false;
      vy = Math.min(MAX_FALL, vy + GRAV * dt);
      sweepX(o, vx * dt);
      const hit = sweepY(o, vy * dt);
      onG = false;
      if (hit) { if (hit.side === 'down') { onG = true; vy = 0; } else vy = 0; }
      // 掉坑按「立刻死」计分：坑底死亡要付整段回程，中枪至少死在原位
      if (o.y > VH + 60) { surv = 0; break; }
      // 只进不退（允许 90px 侧移躲枪线）：否则 Bot 会「后撤 200px 多活 40 帧」，来回送命直到时间耗尽
      if (o.x < ratchet - 90) { surv = 0; break; }
      // 营地内不再「腾空即死」：那是旧弹道（核心弹被量化成水平线、站姿绝对安全）写死的
      // 教条。核心现在会打站桩，死守地面等于原地送命，起跳时机交给 hazards() 前向模拟判
      for (const q of hb) {
        if (aabb(o, { x: q.x + q.vx * dt * (i + 1), y: q.y + q.vy * dt * (i + 1), w: q.w, h: q.h })) { surv = i; break; }
      }
      if (surv !== i) for (const e of bs) { if (aabb(o, bodyBox(e, i, dt))) { surv = i; break; } }
      if (surv < i + 1) break;
      for (const it of items) { if (it.taken || aabb(o, it)) continue; it.taken = 1; got++; }
    }
    for (const it of items) it.taken = 0;
    const prog = band ? 140 - Math.abs(o.x - band) : Math.min(Math.max(o.x, pl0.x), capX) - pl0.x;
    return { surv, x: o.x, got, plan, score: surv * 600 + prog + got * 90 + (plan.d === 1 ? 6 : 0) };
  }
  function planStep(pl0, capX, band, hb, bs, ratchet, noJump) {
    const items = [];
    // 营地内不把道具放进打分：能起跳之后 Bot 会一路追悬空的侦察兵冲进爬行虫堆里
    //（旧教条禁止起跳，反而把它钉在站位带上）。营地的任务是拆基地，不是捡东西。
    if (!band) for (const it of G.items) if (!it.remove && it.x > pl0.x - 60 && it.x < pl0.x + 300) items.push(it);
    let best = null;
    for (const plan of PLANS) {
      const r = runPlan(pl0, plan, hb, bs, items, capX, band, ratchet, noJump);
      if (!best || r.score > best.score) best = r;
    }
    const pl = best.plan;
    if (pl.d > 0) IN.right = true; else if (pl.d < 0) IN.left = true;
    IN.jump = !noJump && pl.j === 0;
    return best;
  }
  function sim(pl0, jump, maxF) {
    const dt = STEP;
    let x = pl0.x, feet = pl0.y + pl0.h, vx = pl0.vx, vy = jump ? -JUMP_V : 0;
    let onG = !jump, airX = null, leave = -1, airRun = 0;
    for (let i = 0; i < maxF; i++) {
      vx = Math.min(RUN_MAX, vx + (onG ? ACC : AIR_ACC) * dt);
      let nx = x + vx * dt;
      const r1 = Math.floor((feet - P_H + 1) / TILE), r2 = Math.floor((feet - 1) / TILE);
      if (vx > 0) {
        const c = Math.floor((nx + P_W - 1) / TILE);
        for (let r = r1; r <= r2; r++) if (isSolidCh(tileChar(c, r))) { nx = c * TILE - P_W - 0.01; vx = 0; break; }
      }
      x = nx;
      const dy = (vy += GRAV * dt) * dt;
      const prevBottom = feet;
      feet += dy;
      if (dy > 0) {
        const row = Math.floor((feet - 1) / TILE);
        const cl = Math.floor((x + 1) / TILE), cr = Math.floor((x + P_W - 1) / TILE);
        let land = false;
        for (let c = cl; c <= cr; c++) {
          const ch = tileChar(c, row);
          if (isSolidCh(ch) || (isOnewayCh(ch) && prevBottom <= row * TILE + 6)) { land = true; feet = row * TILE; break; }
        }
        if (land) {
          vy = 0; onG = true; airRun = 0; airX = null; leave = -1;
          if (jump && i > 1) return { kind: 'land', x, feet, col: Math.floor(x / TILE) };
        } else if (onG) { onG = false; airRun = 1; }
        else if (!airX && ++airRun >= 3) { airX = x - vx * STEP * 2; leave = Math.max(0, i - 2); }
      } else if (jump) onG = false;
      if (!onG && feet > VH + 60) return { kind: 'fall', x, fallX: airX || x, leave: leave < 0 ? i : leave };
    }
    return { kind: 'slow', x, feet, leave };
  }
  function wallAhead(pl0) {
    const c0 = Math.floor((pl0.x + pl0.w) / TILE);
    const r1 = Math.floor(pl0.y / TILE), r2 = Math.floor((pl0.y + pl0.h - 1) / TILE);
    for (let k = 1; k <= 3; k++) { for (let r = r1; r <= r2; r++) if (isSolidCh(tileChar(c0 + k, r))) return k; }
    return 0;
  }
  function itemPick(pl0) {
    for (const it of G.items) {
      if (it.remove) continue;
      const d = boxCx(it) - boxCx(pl0);
      if (d > 6 && d < 40 && boxCy(it) < pl0.y - 4 && boxCy(it) > pl0.y - 170) return it;
    }
    return null;
  }
  function perchDanger(pl0) {
    const box = { x: pl0.x + 2, y: pl0.y - 132, w: P_W + 92, h: 132 + P_H };
    for (const e of G.enemies) if (!e.dead && !e.remove && enemyActive(e) && aabb(box, e)) return true;
    return false;
  }
  // 抬枪目标：只有「水平弹道打不到、且就在头顶前方」的才值得抬枪，否则一律平射。
  // 也要收「枪线下方」的目标：营地改成允许起跳之后，Bot 腾空时枪线抬到贴地近战兵之上，
  // 旧版只认 straight/up 两桶 → 它对着天打了一路，被爬行虫从脚底下撞死（dx≈0 air=1）
  function aimAt(pl0, muzzle) {
    let straight = null, sd = 1e9, up = null, ud = 1e9, down = null, dd = 1e9;
    const see = o => { const d = boxCx(o) - (pl0.x + pl0.w); return d > -24 && d < 640; };
    const mark = o => {
      if (!see(o)) return;
      const d = Math.abs(boxCx(o) - (pl0.x + pl0.w));
      if (o.y <= muzzle + 3 && o.y + o.h >= muzzle - 3) { if (d < sd) { sd = d; straight = o; } }
      else if (o.y + o.h < muzzle - 4) { if (d < ud) { ud = d; up = o; } }
      else if (o.y > muzzle + 4) { if (d < dd) { dd = d; down = o; } }
    };
    for (const e of G.enemies) { if (!e.dead && !e.remove && enemyActive(e)) mark(e); }
    if (G.boss && G.boss.active && !G.boss.dead) for (const b of G.boss.parts) if (b.alive) mark(b);
    // 只有腾空时枪线才会抬到贴地目标之上；站在地面时平射本来就压得住它们，
    // 这时让 down 插队会抢掉「水平打不到的空降舱」的抬枪 → 中路一个兵都杀不死，
    // Bot 会在坑前原地杵到时间耗尽（实测 normal/L3 卡 13290 两分钟）
    // 只有腾空时枪线才会抬到贴地目标之上；站在地面时平射本来就压得住它们。
    // 且只收「即将贴身」的下方目标（<110px）：按纯距离抢优先级会把头顶的空降舱永久
    // 挤掉，Bot 就打不死它、在坑前原地杵到超时（实测 normal/L3 卡 13290 两分钟）。
    // 营地里的爬行虫正好在这条距离内，这才是需要腾空时低头解决的目标。
    if (!pl0.onGround && down && dd < 110) return down;
    return straight || up;
  }

  let hold = 0, release = 0, ratchet = 0, ratchetAt = null, noJump = false, brakeFrames = 0;
  function botStep() {
    const pl0 = G.player;
    if (pl0.dead) { clearIn(); hold = 0; release = 0; return; }
    clearIn();
    IN.fire = true;
    const mz = muzzleY(pl0);
    const tg = aimAt(pl0, mz);
    if (tg) { if (tg.y + tg.h < mz - 4) IN.aimUp = true; else if (tg.y > mz + 8) IN.aimDown = true; }
    const bossRun = !!(G.boss && G.boss.active && !G.boss.dead);
    // 营地判定要和游戏的「基地只在营地范围内开火」对齐：Bot 一旦在 1800px 外也把营地规则
    //（站位带 + 掐点起跳）套上，就再也跳不过回程路上的坑，等于自己走进坑里
    const inArena = bossRun && pl0.x > G.bossCol * TILE - VW * 1.15;
    // 站远 350px 输出：舱口弹在 |dx|>300 时量化成头顶水平线（不许贪满跳），
    // 但核心追身弹是真实角、擦地弹贴地 —— 这一格只能掐点小跳躲，不能站着白嫖
    const hi = inArena ? G.bossCol * TILE - 350 : 1e9;
    const capX = inArena ? hi : pl0.x + 260;
    const band = inArena ? hi : false;
    if (ratchetAt !== pl0) { ratchetAt = pl0; ratchet = pl0.x; }   // 检查点复活 = 重新推进
    if (pl0.x > ratchet) ratchet = pl0.x;
    const hb = hazards(pl0), bs = bodies(pl0);
    const threat = hb.length > 0 || bs.some(b => b.x - (pl0.x + pl0.w) < 220);
    let planned = false;
    if (threat || inArena) { planStep(pl0, capX, band, hb, bs, ratchet, noJump); planned = true; }
    else {
      let terrain = 'flat';
      if (pl0.onGround || pl0.coyote > 0) {
        const nj = sim(pl0, false, 60);
        if (nj.kind === 'fall') {
          const jj = sim(pl0, true, 110);
          terrain = (jj.kind === 'land' && jj.x > nj.fallX + 6) ? 'jump' : (nj.leave <= 6 ? 'stop' : 'flat');
        }
        if (terrain === 'jump') { if (perchDanger(pl0)) terrain = 'stop'; else hold = 24; }
        else {
          const w = wallAhead(pl0), it = itemPick(pl0);
          if (!perchDanger(pl0) && ((w >= 1 && w <= 2) || it)) hold = w ? 24 : 20;
        }
      }
      if (terrain === 'stop') { brakeFrames++; if (pl0.vx > 60) IN.left = true; }
      else IN.right = true;
    }
    if (!planned) {
      if (hold > 0 && !noJump) { IN.jump = true; hold--; if (hold === 0) release = 2; }
      else { IN.jump = false; if (release > 0) release--; }
    }
    // 站桩输出时补一帧右键定朝向：朝左打 Boss 等于零输出（单帧点按位移 ~0.4px，不影响站位）
    if (!IN.left && !IN.right && pl0.dir < 0 && tg && boxCx(tg) > pl0.x + pl0.w) IN.right = true;
  }

  const runCell = (diff, li, opts) => {
    opts = opts || {};
    noJump = !!opts.noJump;
    const speed = opts.speed || 1;
    brakeFrames = 0;
    setDiff(diff); G.score = 0; G.unlock = 3;
    clearIn(); hold = 0; release = 0; ratchetAt = null; ratchet = 0;
    startLevel(li);
    const totalItems = G.items.length;
    const snap = arr => arr.map(o => ({
      id: o.id || o.kind || '', rain: !!o.rain, aim: !!o.aim, low: !!o.low, boss: !!o.boss,
      x: o.x, y: o.y, w: o.w, h: o.h, vx: o.vx || 0, vy: o.vy || 0,
    }));
    let deaths = 0, trace = [], frames = 0, stuckAt = -1, path = [];
    const maxF = Math.round((LEVELS[li].time * DIFFS[diff].timeMul + 40) * 60);
    for (let f = 0; f < maxF; f++) {
      const wasDead = G.player.dead, preX = G.player.x, preY = G.player.y;
      const sb = snap(G.ebullets), se = snap(G.enemies);
      const sp = G.boss && G.boss.active ? snap(G.boss.parts.filter(q => q.alive)) : [];
      botStep();
      for (let s = 0; s < speed; s++) update(STEP);
      frames += speed;
      if (process.env.TRACE && frames % 600 < speed) path.push(Math.round(G.player.x) + (G.player.dead ? '†' : ''));
      if (!wasDead && G.player.dead) {
        // 接触判定用「本帧移动后」的玩家盒，前后两盒都试、弹按步长外推，否则凶手算不准
        const boxes = [{ x: preX, y: preY, w: P_W, h: P_H }, { x: G.player.x, y: G.player.y, w: P_W, h: P_H }];
        let killer = 'unknown';
        const hitAt = (o, i, bx) => aabb(bx, { x: o.x + o.vx * STEP * i, y: o.y + o.vy * STEP * i, w: o.w, h: o.h });
        const scan = list => { for (const o of list) for (let i = 0; i <= 3; i++) if (boxes.some(bx => hitAt(o, i, bx))) return o; return null; };
        let o = scan(sb);
        if (o) killer = o.rain ? 'shot<rain>' : o.aim ? 'shot<aim>' : o.low ? 'shot<low>' : o.boss ? 'shot<pod>' : 'shot<gun>';
        if (killer === 'unknown' && (o = scan(sp))) killer = 'part<' + o.id + '>';
        if (killer === 'unknown' && (o = scan(se))) {
          killer = 'touch' + o.id;
          // 接触死亡要带相对位置和腾空态：营地内「跳着打不到贴地近战兵」这类死法
          // 只有看 dx/air 才归因得出来，光一个 touchB 改不了平衡
          killer += '[dx=' + Math.round(boxCx(o) - (preX + P_W / 2)) +
            ' air=' + (preY < GROUND_Y - P_H - 1 ? 1 : 0) + ']';
        }
        if (killer === 'unknown' && preY > VH - 60) killer = 'pit';
        if (killer === 'unknown' && G.timeLeft <= 0.02) killer = 'timeout';
        trace.push(diff + '/L' + (li + 1) + ' x=' + Math.round(preX) + ' ' + killer);
        deaths++;
      }
      // 过关演出（clear）也要跑完：只有 over/result/win 才是终局，停在 clear 等于漏测结算面板
      if (G.scene !== 'play' && G.scene !== 'clear') break;
    }
    const core = G.boss && bossCore();
    return { diff, li, scene: G.scene, x: G.player.x, cols: G.cols,
      coreHp: core ? (core.alive ? core.hp : 0) : null, deaths, lives: G.lives,
      icons: totalItems - G.items.length, totalItems, gun: G.player.gun, level: G.player.level,
      score: G.score, timeLeft: G.timeLeft, frames, stuck: brakeFrames, trace, path };
  };

  const cells = [];
  for (const diff of DIFF_ORDER) for (let li = 0; li < LEVELS.length; li++) cells.push(runCell(diff, li));
  for (const c of cells) {
    const tag = c.diff + '/L' + (c.li + 1);
    ok(tag + ' 打到结算面板（不是超时/耗尽）', c.scene === 'result', c.scene + ' ' + c.trace.slice(0, 4).join(' | '));
    eq(tag + ' 基地核心被摧毁', c.coreHp, 0);
    ok(tag + ' 剩余人命不低于起始的一半（平衡红线）', c.lives >= Math.ceil(DIFFS[c.diff].lives * 0.5), 'lives=' + c.lives);
    ok(tag + ' 时限内完成', c.timeLeft > 0, 't=' + Math.round(c.timeLeft));
    ok(tag + ' 有得分', c.score > 0);
    if (c.deaths === 0) ok(tag + ' 零死亡时确实换过镜头', c.gun !== 'rifle', 'gun=' + c.gun);
  }
  eq('九格全部通关', cells.filter(c => c.scene === 'result' && c.coreHp === 0).length, 9);
  // 调平衡时看每一格的死亡现场：TRACE=1 node _test.js（默认不打扰正常输出）
  if (process.env.TRACE) for (const c of cells) console.log('TRACE', c.diff + '/L' + (c.li + 1),
    'deaths=' + c.deaths, 'gun=' + c.gun + 'Lv' + c.level, 't=' + Math.round(c.timeLeft),
    'path=' + c.path.join('>') + ' :: ' + (c.trace.join(' | ') || '（零死亡）'));
  ok('休闲档前两关全收集镜头', cells[0].icons === cells[0].totalItems && cells[1].icons === cells[1].totalItems,
    cells[0].icons + '/' + cells[0].totalItems + ' ' + cells[1].icons + '/' + cells[1].totalItems);
  ok('挑战档第三关死亡数受控（≤4）', cells[8].deaths <= 4, 'deaths=' + cells[8].deaths + ' ' + cells[8].trace.join(' | '));
  ok('Bot 不靠卡死地面推进（刹车帧占比 <2%）', cells.every(c => c.stuck / c.frames < 0.02),
    cells.map(c => (c.stuck / c.frames).toFixed(3)).join(','));

  // 反证 1：原地不动必败（不推进、不躲、不开枪 → 时限耗尽或人命耗尽）
  setDiff('normal'); G.unlock = 3; startLevel(0);
  clearIn();
  for (let f = 0; f < Math.round((LEVELS[0].time * DIFFS.normal.timeMul + 40) * 60) && G.scene === 'play'; f++) update(STEP);
  eq('原地不动必然打不过第 1 关', G.scene, 'over');
  // 反证 2：不许跳就过不去坑
  const nj = runCell('normal', 1, { noJump: true });
  ok('关掉跳跃就过不去第 2 关（坑是真的挡路）', nj.scene !== 'result' && nj.deaths >= 1,
    nj.scene + ' deaths=' + nj.deaths + ' x=' + Math.round(nj.x));
  // 反证 3：倍速下依然可胜（固定步长 + 无渲染耦合）
  const sp2 = runCell('easy', 0, { speed: 2 });
  ok('2 倍速仍能通关', sp2.scene === 'result' && sp2.coreHp === 0, sp2.scene + ' coreHp=' + sp2.coreHp);
  clearIn();
  report(cells);
})().catch(e => { console.log('测试异常：' + (e && e.stack || e)); process.exitCode = 1; });
`;

eval(src + TESTS);
