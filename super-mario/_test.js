// 无头回归测试：桩掉 DOM/Canvas，验证常量表、关卡块与拼接几何审计、瓦片碰撞、
// 顶砖/问号/道具/状态切换、踩怪与龟壳连锁、火球与无敌、死亡/检查点/时限、
// 同输入确定性重放、面板内 UI 按钮注册与点击流、localStorage 二十七格纪录，
// 以及键盘输入驱动的贪心 Bot 九关 × 三档难度整局必胜与原地不动必败。
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
const listeners = { window: {}, doc: {} };
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl('game')),
  querySelectorAll: () => [], addEventListener: (ev, fn) => { listeners.doc[ev] = fn; },
  createElement: () => makeEl('tmp'),
};
global.window = {
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: (ev, fn) => { listeners.window[ev] = fn; },
};
global.devicePixelRatio = 1;
global.requestAnimationFrame = noop;
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
if (typeof performance === 'undefined') global.performance = require('perf_hooks').performance;

const TESTS = `
;(async () => {
  let n = 0;
  const eq = (got, want, msg) => { n++; if (got !== want) throw new Error(msg + ': got ' + got + ', want ' + want); };
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); };
  const near = (a, b, eps, msg) => { n++; if (Math.abs(a - b) > eps) throw new Error(msg + ': ' + a + ' vs ' + b); };
  const run = (secs, fn) => { const k = Math.round(secs * 60); for (let i = 0; i < k; i++) { if (fn) fn(i); update(STEP); } };
  const hash = () => JSON.stringify({
    score: G.score, coins: G.coinCount, lives: G.lives, time: Math.round(G.timeLeft * 1000), scene: G.scene,
    p: [G.player.x, G.player.y, G.player.vx, G.player.vy, G.player.state, G.player.star].map(v => Math.round(v * 1000) / 1000),
    e: G.enemies.map(e => [e.kind, Math.round(e.x), Math.round(e.y), e.state, e.dir].join(',')),
    it: G.items.map(i => [i.type, Math.round(i.x), Math.round(i.y), i.state].join(',')),
    fr: G.fires.map(f => [Math.round(f.x), Math.round(f.y)].join(',')),
    grid: G.grid.map(r => r.join('')).join('|'),
  });
  const clearInput = () => { IN.left = IN.right = IN.jump = IN.run = IN.fire = false; jumpWasDown = false; };
  const setup = (diff, idx) => {
    G.diff = diff; G.score = 0; G.coinCount = 0;
    clearInput();
    startLevel(idx);
  };

  // ============ 1. 常量与数据表 ============
  eq(TILE * ROWS, VH, '世界高度 = 行 × 瓦');
  eq(VW_TILES * TILE, VW, '视口宽 = 瓦 × 瓦');
  eq(VW / TILE, 28, '视口 28 瓦');
  ok(GRAV > JUMP_V, '重力 > 起跳速度');
  ok(RUN_MAX > WALK_MAX && WALK_MAX > 120, '冲刺快于常速');
  ok(JUMP_CUT < JUMP_V && JUMP_CUT > 60, '松手截断低于满跳');
  ok(MAX_FALL > JUMP_V, '末速度大于起跳初速');
  ok(COYOTE > 0.03 && COYOTE < 0.2 && JBUF > 0.03, '土狼与跳跃缓冲合理');
  ok(STOMP_BOUNCE < JUMP_V, '踩怪反弹低于满跳');
  ok(SHELL_SPD > RUN_MAX, '龟壳滑行快于冲刺');
  ok(KICK_MAX > 0, '踢壳上限常量存在');
  ok(PLAYER_BIG_H > PLAYER_SMALL_H + 14, '变大明显增高');
  ok(PLAYER_BIG_H < TILE * 1.5, '大形态仍能过 2 格高通道');
  ok(FIRE_SPD > RUN_MAX, '火球快于人物');
  eq(SC_FLAG_PER_ROW * (ROWS - 2), 4200, '触旗满额高度分');
  eq(Object.keys(DIFFS).length, 3, '三档难度');
  eq(DIFF_ORDER.length, 3, '难度顺序表');
  eq(DIFFS.easy.lives > DIFFS.normal.lives && DIFFS.normal.lives > DIFFS.hard.lives, true, '生命数随难度递减');
  eq(DIFFS.easy.timeMul > DIFFS.hard.timeMul, true, '休闲时限更宽松');
  eq(DIFFS.easy.enemyMul < DIFFS.hard.enemyMul, true, '挑战敌人更快');
  eq(DIFFS.easy.scoreMul < DIFFS.hard.scoreMul, true, '挑战得分倍率更高');
  for (const id in ENEMY) {
    ok(ENEMY[id].w > 8 && ENEMY[id].w < TILE && ENEMY[id].h > 8 && ENEMY[id].h < TILE * 1.2, id + ' 尺寸在瓦内');
    ok(ENEMY[id].spd > 20 && ENEMY[id].spd < WALK_MAX, id + ' 速度慢于玩家');
    ok(ENEMY[id].pts > 0, id + ' 有分值');
  }
  eq(ENEMY.k.shell, true, '团团龟可留壳');
  eq(ENEMY.g.shell, false, '蓬蓬栗踩死不留壳');
  eq(ENEMY.h.hop > 0, true, '蹦蹦蝠会周期起跳');
  eq(LEVELS.length, 9, '九关卡');
  eq(LEVELS.map(l => l.name).join('/'), '晨光草原/蜜糖峡谷/云顶砖城/翠雾密林/齿轮工厂/熔岩洞窟/星夜高塔/落霞砂糖/终局魔城', '关卡名');
  eq(BEST_KEY + DIFF_KEY + UNLOCK_KEY, 'shroom_best' + 'shroom_diff' + 'shroom_unlock', '持久化键名');
  for (const lv of LEVELS) {
    ok(lv.time >= 240 && lv.time <= 420, lv.name + ' 基线时限合理');
    ok(!!SKYCOL[lv.sky], lv.name + ' 天色合法');
    ok(!!SKYTHEME[lv.sky], lv.name + ' 有配套地面主题');
  }
  eq(new Set(LEVELS.map(l => l.sky)).size, LEVELS.length, '九关天色互不重复');

  // ============ 2. 关卡块审计 ============
  const chunkNames = Object.keys(CHUNKS);
  ok(chunkNames.length >= 27, '块库规模 ' + chunkNames.length);
  for (const name of chunkNames) {
    const ck = CHUNKS[name];
    eq(ck.length, 16, name + ' 有 16 行');
    for (let r = 0; r < 16; r++) {
      eq(ck[r].length, 16, name + ' 第 ' + r + ' 行宽 16');
      for (const ch of ck[r]) ok(TILE_CHARS.indexOf(ch) >= 0, name + ' 非法字符 ' + ch);
    }
    let mark = 0;
    for (let r = 0; r < 14; r++) for (let c = 0; c < 16; c++) if (ck[r][c] !== '.') mark++;
    ok(mark > 0 || name === 'flat' || name.indexOf('pit') === 0, name + ' 上部应有内容');
  }
  // 每个块都被至少一个关卡使用
  for (const name of chunkNames) {
    let used = false;
    for (const lv of LEVELS) if (lv.parts.indexOf(name) >= 0) used = true;
    ok(used, '块 ' + name + ' 未被使用（应删或补进关卡）');
  }
  // 坑块：底部两行必须留空且左右端接地（否则不可跳）
  for (const name of ['pit2', 'pit3', 'pitwide', 'gapledge', 'pitkoopa']) {
    const ck = CHUNKS[name];
    const rowA = ck[14], rowB = ck[15];
    eq(rowA, rowB, name + ' 底部两行一致');
    eq(rowA[0], '#', name + ' 左端有地');
    eq(rowA[15], '#', name + ' 右端有地');
    let gap = 0, maxGap = 0;
    for (let c = 0; c < 16; c++) { if (rowA[c] === '.') { gap++; maxGap = Math.max(maxGap, gap); } else gap = 0; }
    ok(maxGap <= 5, name + ' 坑宽 ' + maxGap + ' ≤ 5 瓦可跳');
    ok(maxGap >= 3, name + ' 坑宽 ' + maxGap + ' 有挑战');
  }

  // ============ 3. 拼接后的关卡几何审计 ============
  for (let li = 0; li < LEVELS.length; li++) {
    buildLevel(li);
    const lv = LEVELS[li];
    eq(G.cols, lv.parts.length * 16, lv.name + ' 宽度 = 块数 × 16');
    ok(G.cols >= 16 * 14, lv.name + ' 足够长（' + G.cols + ' 列）');
    ok(G.flagCol > 0, lv.name + ' 有旗杆');
    ok(G.flagCol * TILE > G.cols * TILE * 0.8, lv.name + ' 旗杆在末段');
    eq(G.flagTopRow, 5, lv.name + ' 杆顶第 5 行');
    eq(G.flagBotRow, 13, lv.name + ' 杆底第 13 行');
    // 出生点：唯一、脚下有地、头顶净空
    let sCount = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < G.cols; c++) if (G.grid[r][c] === 'S') sCount++;
    eq(sCount, 0, lv.name + ' 出生标记已在构建时清除');
    const sx = G.spawnX, sy = G.spawnY;
    ok(isSolidCh(tileChar(Math.floor((sx + 12) / TILE), Math.floor((sy + PLAYER_SMALL_H + 2) / TILE))), lv.name + ' 出生点脚下实心');
    ok(!isSolidCh(tileChar(Math.floor((sx + 12) / TILE), Math.floor(sy / TILE))), lv.name + ' 出生点净空');
    ok(sx > 8, lv.name + ' 出生点不在左墙');
    ok(sy + PLAYER_SMALL_H <= VH, lv.name + ' 出生点在场内');
    // 坑与地面连续性：所有 14/15 行的空洞宽度 ≤5，且两侧有地
    for (let c = 1; c < G.cols; c++) {
      const a = isSolidCh(tileChar(c, 14));
      if (!a) eq(isSolidCh(tileChar(c, 15)), false, lv.name + ' 坑应上下贯通 col ' + c);
    }
    let gap = 0, maxGap = 0, gapAt = -1;
    for (let c = 0; c < G.cols; c++) {
      if (!isSolidCh(tileChar(c, 14)) && !isSolidCh(tileChar(c, 15))) { gap++; if (gap > maxGap) { maxGap = gap; gapAt = c; } }
      else gap = 0;
    }
    ok(maxGap <= 5, lv.name + ' 最大坑宽 ' + maxGap + '（col ' + gapAt + '）≤5 瓦');
    ok(maxGap >= 3, lv.name + ' 应有真坑（最大 ' + maxGap + '）');
    // 任何地面以上的实心柱高度 ≤4（保证可跳上）
    for (let c = 0; c < G.cols; c++) {
      let col = 0;
      for (let r = 0; r < GROUND_TOP; r++) { if (isSolidCh(tileChar(c, r))) col++; else col = 0; if (col > 4) throw new Error(lv.name + ' col ' + c + ' 有 >4 连高实心柱'); }
    }
    // 问号块/道具块可达：所在行 ≥ 8（顶部留 6 行净空才顶得到）
    let qn = 0, pw = 0, stars = 0, bricks = 0, coins = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < G.cols; c++) {
      const ch = G.grid[r][c];
      if (ch === '?') { qn++; ok(r >= 8, lv.name + ' 金币块行 ' + r + ' 过低不可达'); }
      if (ch === '!') { pw++; ok(r >= 8, lv.name + ' 道具块行 ' + r + ' 不可达'); }
      if (ch === 'T') { stars++; ok(r >= 8, lv.name + ' 星星块行 ' + r + ' 不可达'); }
      if (ch === 'b') bricks++;
      if (ch === 'C') { coins++; ok(r >= 7, lv.name + ' 金币行 ' + r + ' 高于跳跃顶点'); }
      if (ch === 'p') {
        ok(r >= 10 || isSolidCh(tileChar(c, r + 1)), lv.name + ' 水管悬空 col ' + c + ' row ' + r);
        let h = 0; for (let rr = r; rr < ROWS && tileChar(c, rr) === 'p'; rr++) h++;
        ok(h <= 4, lv.name + ' 水管高 ' + h + ' 超过可跳高度');
      }
      // 可顶块上方必须留净空，否则冒出的道具/金币会嵌进实心里
      if (ch === '?' || ch === '!' || ch === 'T') {
        ok(!isSolidCh(tileChar(c, r - 1)), lv.name + ' 块 col ' + c + ' row ' + r + ' 上方被实心挡住');
      }
    }
    ok(qn >= 1, lv.name + ' 有金币块');
    ok(pw >= 1, lv.name + ' 有道具块');
    ok(bricks >= 3, lv.name + ' 有可碎砖');
    ok(coins >= 8, lv.name + ' 有散落金币 ' + coins);
    // 敌人：所在列下方最终要有地面（不会凭空掉出世界）
    for (const e of G.enemies) {
      let g = false;
      for (let r = Math.floor(e.y / TILE) + 1; r < ROWS; r++) if (isSolidCh(tileChar(Math.floor((e.x + e.w / 2) / TILE), r))) g = true;
      ok(g, lv.name + ' ' + e.kind + ' 敌人下方无地 col ' + Math.floor(e.x / TILE));
    }
    ok(G.enemies.length >= 4, lv.name + ' 敌人数量 ' + G.enemies.length);
    // 检查点：必须落在能站稳的地方，且在出生点与旗杆之间
    ok(G.checkX > G.spawnX + TILE * 4, lv.name + ' 检查点在出生点之后');
    ok(G.checkX < G.flagCol * TILE, lv.name + ' 检查点在旗杆之前');
    const ccol = Math.floor((G.checkX + 12) / TILE);
    ok(isSolidCh(tileChar(ccol, GROUND_TOP)), lv.name + ' 检查点脚下实心');
    ok(!isSolidCh(tileChar(ccol, GROUND_TOP - 1)) && !isSolidCh(tileChar(ccol, GROUND_TOP - 2)), lv.name + ' 检查点身位净空');
    // 检查点安全：前后都要有落脚地面，且附近没有待命敌人，否则复活瞬间就被撞死形成重复死亡
    for (let c = ccol - 4; c <= ccol + 10; c++) ok(isSolidCh(tileChar(c, GROUND_TOP)), lv.name + ' 检查点附近 col ' + c + ' 是坑');
    for (const e of G.enemies) {
      const dd = Math.abs(e.x / TILE - ccol);
      ok(dd >= 13, lv.name + ' 检查点 col ' + ccol + ' 距 ' + e.kind + ' 仅 ' + dd.toFixed(1) + ' 格，复活会被伏击');
    }
    // 路面道具（supply 块）：贴地摆在实地上，跑过去就能吃
    const supN = lv.parts.filter(x => x === 'supply').length;
    const groundItems = G.items.filter(it => it.state !== 'emerge');
    eq(groundItems.length, supN * 2, lv.name + ' 路面道具应为 supply 块数 ×2（实际 ' + groundItems.length + '）');
    if (supN > 0) {
      ok(groundItems.some(it => it.type === 'mushroom'), lv.name + ' supply 应有蘑菇');
      ok(groundItems.some(it => it.type === 'flower'), lv.name + ' supply 应有火焰花');
    }
    for (const it of groundItems) {
      eq(it.y + it.h, GROUND_TOP * TILE, lv.name + ' 路面道具应贴地');
      ok(isSolidCh(tileChar(Math.floor((it.x + it.w / 2) / TILE), GROUND_TOP)), lv.name + ' 路面道具下方无地');
    }
    ok(!G.grid.some(r => r.indexOf('m') >= 0 || r.indexOf('f') >= 0), lv.name + ' 路面道具字符应被转换成实体');
  }
  // 关卡长度逐关递增（难度曲线）
  for (let i = 1; i < LEVELS.length; i++) {
    ok(LEVELS[i].parts.length > LEVELS[i - 1].parts.length, LEVELS[i].name + ' 应比上一关更长（' + LEVELS[i - 1].parts.length + ' → ' + LEVELS[i].parts.length + '）');
  }
  // 连续坑之间的落脚岛必须够长：两个坑之间地面太短时，冲刺跳跃会越过小岛摔进第二个坑
  for (let li = 0; li < LEVELS.length; li++) {
    buildLevel(li);
    const name = LEVELS[li].name;
    const segs = [];
    for (let c = 0; c < G.cols; c++) {
      const solid = isSolidCh(tileChar(c, 14)) && isSolidCh(tileChar(c, 15));
      const last = segs[segs.length - 1];
      if (last && last.solid === solid) last.len++; else segs.push({ solid, len: 1, start: c });
    }
    for (let i = 1; i < segs.length - 1; i++) {
      if (!segs[i].solid) { ok(segs[i].len <= 5, name + ' 单坑宽 ' + segs[i].len + ' 列超过跳跃上限（col ' + segs[i].start + '）'); continue; }
      if (segs[i - 1].solid || segs[i + 1].solid) continue;            // 只查「两边都是坑」的岛
      // 冲刺跳跃水平射程约 331px ≈ 9 格，落脚岛短于此会被一跃而过摔进第二个坑
      ok(segs[i].len >= 8, name + ' 两坑之间落脚岛仅 ' + segs[i].len + ' 列（col ' + segs[i].start + '）');
    }
  }

  // ============ 4. 瓦片碰撞 ============
  setup('normal', 0);
  (function () {
    const p = G.player;
    p.x = 3 * TILE; p.y = 13 * TILE - 1; p.vx = 0; p.vy = 0;
    run(0.6);
    ok(p.onGround, '自由落体后着地');
    near(p.y + p.h, 14 * TILE, 1.5, '脚底贴住地面顶边');
    eq(p.vy, 0, '着地后竖直速度归零');
    // 向右撞水管
    const pc = makePlayer(0, 0);
    pc.x = 0; pc.y = 13 * TILE;
    setTile(2, 13, 'p');
    sweepX(pc, 12); sweepX(pc, 12); sweepX(pc, 12);
    ok(pc.x + pc.w <= 2 * TILE + 1, '撞墙停在墙面前');
    eq(isSolidCh(tileChar(2, 13)), true, '水管为实心');
    // 向上顶头：11 行放一块实心砖，角色从 12 行下方顶上去
    const pu = makePlayer(0, 0);
    pu.x = 5 * TILE + 4; pu.y = 12 * TILE + 8;
    setTile(5, 11, 'b');
    const res = sweepY(pu, -30);
    ok(res && res.side === 'up', '向上撞到实心块');
    eq(res.row, 11, '顶头命中行号');
    ok(res.cols.indexOf(5) >= 0, '顶头命中列号');
    near(pu.y, 12 * TILE, 1.5, '顶头后被压回块下方');
    // 拆分步长不穿透：撞墙贴住墙面停下
    const pf = makePlayer(0, 0);
    pf.x = 4 * TILE; pf.y = 13 * TILE;
    setTile(9, 13, 'X');
    sweepX(pf, 300);
    ok(pf.x > 4 * TILE, '大步长仍然向前推进');
    ok(pf.x + pf.w <= 9 * TILE + 0.5, '拆分步长不穿透墙面');
    // 对照：单次大位移会穿透，说明拆分是必要的
    const pn = makePlayer(0, 0);
    pn.x = 4 * TILE; pn.y = 13 * TILE;
    moveX(pn, 300);
    ok(pn.x + pn.w > 9 * TILE, '单次大位移会穿透（故必须拆分步长）');
    // 竖直向下同理：拆分后脚底贴住块顶
    const pd = makePlayer(0, 0);
    pd.x = 9 * TILE + 4; pd.y = 8 * TILE;
    setTile(9, 12, 'b');
    sweepY(pd, 200);
    near(pd.y + pd.h, 12 * TILE, 1.5, '拆分下落贴住块顶');
    // 顶墙推挤不能积累超速（历史 bug：贴墙一直加速到 vx≈87000）
    setTile(5, 13, 'X'); setTile(5, 12, 'X');
    p.x = 3 * TILE; p.y = 13 * TILE - 1; p.vx = 0; p.vy = 0;
    clearInput(); IN.right = true; IN.run = true;
    run(10);
    ok(Math.abs(p.vx) <= RUN_MAX + 1, '顶墙 600 帧后水平速度仍受限：' + p.vx.toFixed(1));
    ok(p.x + p.w <= 5 * TILE + 1, '顶墙 600 帧不穿透');
    clearInput();
  })();

  // ============ 5. 顶砖 / 问号块 / 道具 / 状态 ============
  setup('normal', 0);
  (function () {
    let col = -1, row = -1;
    for (let r = 0; r < ROWS && col < 0; r++) for (let c = 0; c < G.cols; c++) if (G.grid[r][c] === '?') { col = c; row = r; break; }
    ok(col >= 0, '找到金币块');
    const coins0 = G.coinCount, sc0 = G.score;
    hitBlock(col, row, G.player);
    eq(G.grid[row][col], 'u', '金币块顶过后变用尽块');
    eq(G.coinCount, coins0 + 1, '金币 +1');
    eq(G.score, sc0 + Math.round(SC_BLOCKCOIN * DIFFS.normal.scoreMul), '金币块得分按难度倍率');
    eq(tileChar(col, row), 'u', '用尽块仍为实心');
    ok(isSolidCh('u'), '用尽块实心');
    // 小形态撞砖只晃不碎
    let bcol = -1, brow = -1;
    for (let r = 0; r < ROWS && bcol < 0; r++) for (let c = 0; c < G.cols; c++) if (G.grid[r][c] === 'b') { bcol = c; brow = r; break; }
    hitBlock(bcol, brow, G.player);
    eq(G.grid[brow][bcol], 'b', '小形态顶不碎砖');
    ok(G.bumps.some(b => b.col === bcol && b.row === brow), '小形态顶砖有晃动动画');
    // 大形态碎砖
    const s1 = G.score;
    setPlayerState(G.player, 'big');
    eq(G.player.h, PLAYER_BIG_H, '变大后高度增加');
    hitBlock(bcol, brow, G.player);
    eq(G.grid[brow][bcol], '.', '大形态顶碎砖');
    eq(G.score, s1 + Math.round(SC_BRICK * DIFFS.normal.scoreMul), '碎砖加分');
    ok(G.parts.length > 0, '碎砖产生碎片粒子');
    // 道具块：小形态出蘑菇、大形态出火花
    let pcol = -1, prow = -1;
    for (let r = 0; r < ROWS && pcol < 0; r++) for (let c = 0; c < G.cols; c++) if (G.grid[r][c] === '!') { pcol = c; prow = r; break; }
    setPlayerState(G.player, 'small');
    G.items.length = 0;
    hitBlock(pcol, prow, G.player);
    eq(G.items.length, 1, '道具块掉出一个道具');
    eq(G.items[0].type, 'mushroom', '小形态 → 蘑菇');
    // 大形态 → 火花（第 1 关只有一个道具块，另造一块来顶）
    setPlayerState(G.player, 'big');
    const p2 = pcol + 4, r2 = prow;
    setTile(p2, r2, '!');
    G.items.length = 0;
    hitBlock(p2, r2, G.player);
    eq(G.items.length, 1, '大形态顶道具块掉出一个道具');
    eq(G.items[0].type, 'flower', '大形态 → 火花');
    // 道具冒升与拾取
    const it = G.items[0];
    eq(it.state, 'emerge', '道具先冒升');
    run(0.6);
    eq(it.state, 'still', '火花冒升后静止');
    near(it.y + it.h, r2 * TILE, 2, '火花停在块顶');
    it.x = G.player.x; it.y = G.player.y;
    contactPass(STEP);
    eq(G.player.state, 'fire', '拾取火花进入火力形态');
    ok(it.remove, '火花被消耗');
    // 星星块
    buildLevel(2); setup('normal', 2);
    let scol = -1, srow = -1;
    for (let r = 0; r < ROWS && scol < 0; r++) for (let c = 0; c < G.cols; c++) if (G.grid[r][c] === 'T') { scol = c; srow = r; break; }
    ok(scol >= 0, '第 3 关有星星块');
    G.items.length = 0;
    setPlayerState(G.player, 'big');
    hitBlock(scol, srow, G.player);
    eq(G.items[0].type, 'star', '星星块出星星');
    run(0.7);
    eq(G.items[0].state, 'starMove', '星星进入弹跳态');
    const py0 = G.items[0].y; run(0.4);
    ok(G.items[0].y !== py0, '星星持续弹跳');
    G.items[0].x = G.player.x; G.items[0].y = G.player.y;
    contactPass(STEP);
    ok(G.player.star > 0, '拾星进入无敌');
  })();

  // ============ 6. 敌人：踩杀 / 龟壳 / 连锁 / 火球 / 无敌 ============
  setup('normal', 0);
  (function () {
    const spawnAt = (kind, x, y) => { spawnEnemy(kind, x, y); return G.enemies[G.enemies.length - 1]; };
    const stompOn = e => {
      const p = G.player;
      p.x = e.x + e.w / 2 - p.w / 2;
      p.y = e.y - p.h + 6;          // 与怪有重叠（本帧刚落下）
      p.prevBottom = e.y - 6;       // 上一帧脚底还在怪头顶之上 → 判定为踩
      p.vy = 300; p.star = 0; p.invuln = 0;
      contactPass(STEP);
    };
    // 蓬蓬栗：踩扁
    G.enemies.length = 0;
    const g1 = spawnAt('g', 200, 470);
    stompOn(g1);
    ok(g1.squash > 0, '踩扁蓬蓬栗');
    eq(g1.dead, false, '压扁不是死亡翻转');
    eq(G.combo, 1, '连击起算 1');
    run(0.5);
    ok(g1.remove, '压扁后移除');
    // 侧面碰到：小形态直接死（先清掉复活保护，这里测的是碰撞受伤本身）
    setup('normal', 0);
    G.enemies.length = 0;
    const g2 = spawnAt('g', 200, 470);
    const p = G.player;
    p.x = 150; p.y = 470; p.prevBottom = 470 + p.h; p.vy = 0;
    p.invuln = 0;
    p.x = g2.x - p.w + 2;
    contactPass(STEP);
    ok(p.dead, '小形态侧面撞怪即死');
    // 复活保护：重生后短暂无敌，避免出生点旁的游荡敌人瞬间收命
    setup('normal', 0);
    G.lives = 2;
    respawn();
    ok(G.player.invuln > 0 && G.player.invuln <= SPAWN_GRACE + 1e-6, '复活后有保护窗口（' + SPAWN_GRACE + 's）');
    // 大形态先缩小 + 无敌帧
    setup('normal', 0);
    G.enemies.length = 0;
    setPlayerState(G.player, 'big');
    const g3 = spawnAt('g', 300, 470);
    const p3 = G.player;
    p3.x = g3.x - p3.w + 2; p3.y = g3.y; p3.prevBottom = g3.y + g3.h + 4; p3.vy = 10; p3.invuln = 0;
    contactPass(STEP);
    eq(p3.state, 'small', '大形态受击缩小');
    ok(p3.invuln > 1, '受击后有无敌帧');
    eq(p3.dead, false, '未直接死亡');
    const before = G.score;
    p3.x = g3.x - p3.w + 2; p3.prevBottom = g3.y + g3.h + 4; p3.vy = 10;
    contactPass(STEP);
    eq(G.score, before, '无敌帧内不再受伤');
    // 团团龟：踩下变壳，再踢滑行
    setup('normal', 0);
    G.enemies.length = 0;
    const k1 = spawnAt('k', 400, 460);
    stompOn(k1);
    eq(k1.state, 'shell', '踩龟变壳');
    near(k1.y + k1.h, 460 + ENEMY.k.h, 2, '壳保持原脚底');
    eq(k1.h, SHELL_H, '壳高度变矮');
    const sc2 = G.score;
    // 侧面踢壳
    const p4 = G.player;
    p4.star = 0; p4.invuln = 0; p4.vy = 0; p4.prevBottom = k1.y + k1.h;
    p4.x = k1.x - p4.w + 2; p4.y = k1.y - 6;
    contactPass(STEP);
    eq(k1.state, 'slide', '侧面触碰静止壳 → 踢出');
    ok(k1.vx > 0, '向右滑行');
    ok(G.score > sc2, '踢壳得分');
    eq(p4.dead, false, '踢壳不伤自己');
    // 滑行壳连锁击杀：必须由壳自己在滑行中撞到，不允许手工调 killEnemy 凑断言
    const g4 = spawnAt('g', k1.x + 150, k1.y);
    const before2 = G.score;
    eq(g4.dead, false, '连锁目标初始存活');
    run(0.5);
    eq(g4.dead, true, '滑行壳撞死蓬蓬栗');
    ok(G.score > before2, '连锁击杀加分');
    eq(k1.state, 'slide', '撞完的壳继续滑行');
    // 静止壳超时复活
    setup('normal', 0);
    G.enemies.length = 0;
    const k2 = spawnAt('k', 300, 460);
    stompOn(k2);
    eq(k2.state, 'shell', '变壳');
    // 把玩家挪开，避免落回壳上把壳踢成滑行态
    G.player.x = 60; G.player.y = GROUND_TOP * TILE - G.player.h; G.player.vx = 0; G.player.vy = 0;
    run(SHELL_IDLE + 0.4);
    eq(k2.state, 'walk', '壳久置复活');
    eq(k2.h, ENEMY.k.h, '复活恢复身高');
    // 滑行壳撞墙回弹
    setup('normal', 0);
    G.enemies.length = 0;
    const k3 = spawnAt('k', 300, 460);
    k3.state = 'slide'; k3.h = SHELL_H; k3.y = 470; k3.vx = SHELL_SPD; k3.dir = 1;
    setTile(Math.floor((k3.x + k3.w) / TILE) + 3, 13, 'X');
    const d0 = k3.dir;
    run(0.25);
    ok(k3.state === 'slide', '滑行保持');
    ok(k3.dir !== d0 || k3.x < 300 + 120, '撞墙回弹或继续推进');
    // 火球杀怪
    setup('normal', 0);
    setPlayerState(G.player, 'fire');
    G.enemies.length = 0; G.fires.length = 0;
    const g5 = spawnAt('g', 420, 470);
    const p5 = G.player;
    p5.x = 380; p5.y = 470; p5.dir = 1; p5.fireCd = 0;
    IN.fire = true; updatePlayer(p5, STEP); IN.fire = false;
    eq(G.fires.length, 1, '发射火球');
    eq(G.fires[0].vx, FIRE_SPD, '火球向右');
    let guard = 0;
    while (!g5.dead && guard++ < 200) { G.fires.forEach(f => !f.remove && updateFire(f, STEP)); contactPass(STEP); }
    ok(g5.dead, '火球命中炸死');
    ok(G.fires.length === 0 || G.fires[0].remove, '命中的火球消失');
    // 火球落地反弹
    G.fires.length = 0;
    G.fires.push({ x: 300, y: 440, w: 14, h: 14, vx: FIRE_SPD, vy: 200, bounces: 0, t: 0 });
    const vy0 = G.fires[0].vy;
    run(0.2);
    ok(G.fires.length === 0 || G.fires[0].vy < vy0, '火球触地反弹');
    // 无敌星撞怪即死且不伤自己
    setup('normal', 0);
    G.enemies.length = 0;
    const g6 = spawnAt('g', 300, 470);
    const p6 = G.player;
    p6.star = 3; p6.x = g6.x - p6.w + 2; p6.y = g6.y; p6.prevBottom = g6.y + g6.h + 4; p6.vy = 10;
    contactPass(STEP);
    ok(g6.dead, '无敌状态撞死怪');
    eq(p6.dead, false, '无敌不受伤');
    // 蹦蹦蝠：踩后也留壳
    setup('normal', 0);
    G.enemies.length = 0;
    const h1 = spawnAt('h', 300, 400);
    stompOn(h1);
    eq(h1.state, 'shell', '蹦蹦蝠踩后留壳');
    // 连击倍率：空中连续踩 4 只
    setup('normal', 0);
    G.enemies.length = 0;
    G.combo = 0;
    let gained = [];
    for (let i = 0; i < 4; i++) {
      const e = spawnAt('g', 200 + i * 40, 300);
      const s0 = G.score;
      stompOn(e);
      gained.push(G.score - s0);
    }
    eq(gained[0], Math.round(100 * 1.5), '第 1 踩 ×1');
    eq(gained[1], Math.round(100 * 2 * 1.5), '第 2 踩 ×2');
    eq(gained[2], Math.round(100 * 4 * 1.5), '第 3 踩 ×4');
    eq(gained[3], Math.round(100 * 8 * 1.5), '第 4 踩封顶 ×8');
    G.player.onGround = false; G.player.vy = 0;
    G.combo = 0;
    // 落地清零连击
    G.player.y = 13 * TILE - G.player.h; G.player.x = 100;
    run(0.3);
    eq(G.combo, 0, '落地后连击归零');
    // 敌人速度随难度
    setup('easy', 0);
    const spdE = ENEMY.g.spd * DIFFS.easy.enemyMul;
    setup('hard', 0);
    const spdH = ENEMY.g.spd * DIFFS.hard.enemyMul;
    ok(spdH > spdE, '挑战难度敌人更快');
  })();

  // ============ 7. 死亡 / 生命 / 检查点 / 时限 / 结算 ============
  (function () {
    setup('normal', 0);
    eq(G.lives, DIFFS.normal.lives, '标准 3 条命');
    eq(G.scene, 'play', '进入对局');
    near(G.timeLeft, LEVELS[0].time * DIFFS.normal.timeMul, 0.001, '时限按难度');
    // 掉坑死亡
    const p = G.player;
    p.y = VH + 100;
    const lv0 = G.lives;
    run(0.1);
    ok(p.dead, '坠入深渊判死');
    run(2.0);
    eq(G.lives, lv0 - 1, '扣一条命');
    eq(G.scene, 'play', '还有命则重生');
    ok(!G.player.dead, '重生后复活');
    // 难度生命数
    setup('hard', 0); eq(G.lives, DIFFS.hard.lives, '挑战 2 条命');
    setup('easy', 0); eq(G.lives, DIFFS.easy.lives, '休闲 5 条命');
    // 耗尽 → over
    setup('hard', 0);
    for (let i = 0; i < 4; i++) { G.player.y = VH + 200; run(2.2); }
    eq(G.scene, 'over', '生命耗尽判负');
    // 时限归零判死
    setup('normal', 0);
    G.timeLeft = 0.2;
    run(0.4);
    ok(G.player.dead || G.lives < DIFFS.normal.lives, '时间到判死');
    // 检查点：跑过中点后死亡从检查点重生
    setup('normal', 0);
    const p2 = G.player;
    p2.x = G.checkX + 20; p2.y = 13 * TILE - p2.h; p2.onGround = true;
    updatePlayer(p2, STEP);
    ok(p2.checkpointed, '越过中点标记检查点');
    const cx = G.spawnX;
    eq(cx, G.checkX, '重生点推进到检查点');
    p2.y = VH + 300; run(2.2);
    near(G.player.x, cx, 1, '从检查点重生');
    eq(G.player.state, 'small', '重生回到小形态');
    // 触旗 → 过关结算
    setup('normal', 0);
    G.timeLeft = 123.7;
    const p3 = G.player;
    p3.x = G.flagCol * TILE - p3.w + 8; p3.y = 8 * TILE;
    updatePlayer(p3, STEP);
    eq(G.scene, 'clear', '触旗进入过关动画');
    eq(G.flagContactRow, 8, '记录触杆行');
    run(2.3);
    eq(G.scene, 'result', '动画后进入结算面板');
    const r = G.lastResult;
    eq(r.flagBonus, (13 - 8) * SC_FLAG_PER_ROW, '触杆越高奖励越多（按行差）');
    eq(r.timeBonus, 123 * SC_TIME, '剩余时间 50 分/秒');
    eq(r.gained, Math.round((r.flagBonus + r.timeBonus) * DIFFS.normal.scoreMul), '结算按难度倍率');
    eq(G.unlock >= 2, true, '过关解锁下一关');
    // 九关串联：非末关进下一关，末关进总结算
    G.levelIdx = LEVELS.length - 2; G.score = 500;
    finishClear();
    nextLevel();
    eq(G.scene, 'play', '非最后一关过关后直接开下一关');
    eq(G.levelIdx, LEVELS.length - 1, '推进到最后一关（第 ' + LEVELS.length + ' 关）');
    G.levelIdx = LEVELS.length - 1; G.score = 999;
    finishClear();
    eq(G.scene, 'result', '最后一关也走结算');
    nextLevel();
    eq(G.scene, 'win', '最后一关过关后进总结算');
  })();

  // ============ 8. 确定性重放 ============
  (function () {
    const script = i => {
      IN.right = true; IN.run = (i % 3 !== 0); IN.fire = (i % 37 === 0);
      IN.jump = (i % 46) < 16;
      IN.left = (i % 300) < 40;
    };
    const play = () => {
      setup('normal', 1);
      let maxX = 0;
      for (let i = 0; i < 900; i++) { script(i); update(STEP); maxX = Math.max(maxX, G.player.x); }
      clearInput();
      return hash() + '#' + Math.round(maxX);
    };
    const a = play(), b = play(), c = play();
    eq(a, b, '同输入重放逐位一致');
    eq(b, c, '重放稳定');
    ok(Number(a.slice(a.lastIndexOf('#') + 1)) > 400, '重放里玩家确实前进了（maxX ' + a.slice(a.lastIndexOf('#') + 1) + '）');
    // 不同输入 → 不同结果（证明输入真的驱动模拟，而非固定动画）
    let maxAlt = 0;
    setup('normal', 1);
    for (let i = 0; i < 900; i++) { IN.right = true; IN.jump = (i % 46) < 16; update(STEP); maxAlt = Math.max(maxAlt, G.player.x); }
    clearInput();
    ok(hash() + '#' + Math.round(maxAlt) !== a, '输入差异导致状态差异');
    // 关卡构建确定：两次 buildLevel 网格一致
    buildLevel(2); const g2a = G.grid.map(r => r.join('')).join('|');
    buildLevel(2); eq(G.grid.map(r => r.join('')).join('|'), g2a, '关卡网格确定');
    buildLevel(2);
    eq(G.enemies.length, (() => { buildLevel(2); return G.enemies.length; })(), '敌人布置确定');
  })();

  // ============ 9. 面板内 UI：按钮注册与点击流 ============
  (function () {
    G.scene = 'menu'; G.started = false; G.speed = 1; muted = false;
    drawScene();
    const ids = () => G.ui.map(u => u.id);
    ok(ids().some(x => /^diff(easy|normal|hard)$/.test(x)), '菜单含三档难度胶囊');
    ok(ids().indexOf('btn开始冒险') >= 0, '菜单含开始按钮');
    ok(ids().indexOf('btn选择关卡') >= 0, '菜单含选关按钮');
    ok(ids().some(x => /音效/.test(x)), '菜单含音效开关');
    // 视口内布局：所有可点区域必须落在 1200×800 画布内（横屏 U 缩放后）
    for (const u of G.ui) {
      ok(u.sx >= -1 && u.sy >= -1 && u.sx + u.sw <= 1200 + 2 && u.sy + u.sh <= 800 + 2,
        '菜单按钮越界：' + u.id + ' ' + [u.sx, u.sy, u.sw, u.sh]);
    }
    // 点难度 → 生效
    const tap = id => { const u = G.ui.filter(x => x.id === id)[0]; ok(!!u, '找不到按钮 ' + id); u.cb(); drawScene(); };
    G.diff = 'normal';
    tap('diffeasy');
    eq(G.diff, 'easy', '点胶囊切难度');
    eq(store['shroom_diff'], 'easy', '难度写入 localStorage');
    tap('diffhard'); eq(G.diff, 'hard', '再点切挑战');
    tap('diffnormal');
    // 进选关
    G.unlock = LEVELS.length;
    tap('btn选择关卡');
    eq(G.scene, 'levels', '进入选关面板');
    const lvBtns = G.ui.filter(x => x.id === 'btn进入');
    eq(lvBtns.length, G.unlock, '只有已解锁关卡有「进入」按钮（' + G.unlock + ' 关）');
    eq(lvBtns.length, 9, '九关全部解锁时选关应有 9 个入口');
    for (const u of G.ui) ok(u.sy + u.sh <= 800 + 2 && u.sx >= -1, '选关按钮越界 ' + u.id);
    // 九宫卡片：3 列 × 3 行，逐格按关卡顺序排列且互不重叠
    const xs = [...new Set(lvBtns.map(u => u.sx))].sort((a, b) => a - b);
    const ys = [...new Set(lvBtns.map(u => u.sy))].sort((a, b) => a - b);
    eq(xs.length, 3, '九宫入口分三列排布（实际 ' + xs.length + ' 列）');
    eq(ys.length, 3, '九宫入口分三行排布');
    eq(new Set(lvBtns.map(u => u.sx + ',' + u.sy)).size, 9, '九宫每格位置互不重复');
    lvBtns.forEach((u, i) => {
      eq(u.sx, xs[i % 3], '第 ' + (i + 1) + ' 关卡片列位置');
      eq(u.sy, ys[(i / 3) | 0], '第 ' + (i + 1) + ' 关卡片行位置');
    });
    for (const u of lvBtns) ok(u.sw >= 60 && u.sh >= 22, '进入按钮可点尺寸 ' + [u.sw, u.sh]);
    // 锁定关卡不可点：构造 unlock=1 场景
    G.unlock = 1; G.scene = 'levels'; drawScene();
    eq(G.ui.filter(x => x.id === 'btn进入').length, 1, '未解锁关卡不给按钮（防呆）');
    G.unlock = LEVELS.length; G.scene = 'levels'; drawScene();
    tap('btn进入');
    eq(G.scene, 'play', '选关后开局');
    eq(G.levelIdx, 0, '从第 1 关开始');
    // 第 9 宫卡片可点且进第 9 关
    G.scene = 'levels'; drawScene();
    const last = G.ui.filter(x => x.id === 'btn进入')[LEVELS.length - 1];
    ok(!!last, '第 9 关入口存在');
    last.cb(); drawScene();
    eq(G.scene, 'play', '点第 9 关开局');
    eq(G.levelIdx, LEVELS.length - 1, '落在终局魔城');
    eq(curLevel().name, '终局魔城', '第九关名');
    // 对局中 HUD 按钮
    muted = false; G.speed = 1;
    drawScene();
    ok(G.ui.some(x => x.id === 'hud0菜单'), 'HUD 有菜单按钮');
    ok(G.ui.some(x => x.id === 'hud1音'), 'HUD 有静音按钮');
    ok(G.ui.some(x => x.id === 'hud2' + G.speed + 'x'), 'HUD 有倍速按钮');
    for (const u of G.ui) ok(u.sy + u.sh <= 800 + 2, 'HUD 按钮越界 ' + u.id);
    tap('hud1音'); ok(muted, 'HUD 静音生效');
    ok(G.ui.some(x => x.id === 'hud1静'), '静音后按钮文案切为「静」');
    tap('hud1静'); ok(!muted, 'HUD 取消静音');
    tap('hud2' + G.speed + 'x'); eq(G.speed, 2, 'HUD 倍速循环 1→2');
    tap('hud2' + G.speed + 'x'); eq(G.speed, 3, '倍速 2→3');
    tap('hud2' + G.speed + 'x'); eq(G.speed, 1, '倍速 3→1');
    G.speed = 1;
    tap('hud0菜单'); eq(G.scene, 'pause', 'HUD 菜单进暂停');
    drawScene();
    ok(G.ui.some(x => x.id === 'btn继续游戏'), '暂停面板含继续');
    ok(G.ui.some(x => x.id === 'btn重玩本关'), '暂停面板含重玩');
    ok(G.ui.some(x => x.id === 'btn主菜单'), '暂停面板含主菜单');
    tap('btn继续游戏'); eq(G.scene, 'play', '继续对局');
    // 结算面板：中途关卡给「下一关」，最后一关给「查看成绩」
    G.scene = 'result'; G.levelIdx = 0; G.lastResult = { level: 'x', timeBonus: 1, flagBonus: 2, gained: 3, total: 4, coins: 5, lives: 6, best: 7 };
    drawScene();
    ok(G.ui.some(x => x.id === 'btn下一关'), '结算含下一关');
    ok(!G.ui.some(x => x.id === 'btn查看成绩'), '中途关卡不给查看成绩');
    G.levelIdx = LEVELS.length - 1; drawScene();
    ok(G.ui.some(x => x.id === 'btn查看成绩'), '最后一关结算改给查看成绩');
    ok(!G.ui.some(x => x.id === 'btn下一关'), '最后一关不再给下一关');
    G.levelIdx = 0;
    ok(G.ui.some(x => x.id === 'rstmenu'), '结算含返回主菜单');
    for (const u of G.ui) ok(u.sy >= -1 && u.sy + u.sh <= 800 + 2, '结算按钮越界 ' + u.id);
    // 失败面板
    G.scene = 'over'; drawScene();
    ok(G.ui.some(x => x.id === 'btn再来一次'), '失败面板含再来一次');
    ok(G.ui.some(x => x.id === 'btn返回主菜单'), '失败面板含返回主菜单');
    // 通关面板
    G.scene = 'win'; drawScene();
    ok(G.ui.some(x => x.id === 'btn再挑战一次'), '通关面板含再挑战');
    tap('btn主菜单'); eq(G.scene, 'menu', '面板回主菜单');
    // 遮挡回归：同一屏内任意两个命中区不得互相压住（历史上出过分值胶囊压住按钮）
    const overlaps = list => {
      const bad = [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ow = Math.min(a.sx + a.sw, b.sx + b.sw) - Math.max(a.sx, b.sx);
        const oh = Math.min(a.sy + a.sh, b.sy + b.sh) - Math.max(a.sy, b.sy);
        if (ow > 1 && oh > 1) bad.push(a.id + '×' + b.id);
      }
      return bad;
    };
    for (const sc of ['menu', 'levels', 'pause', 'result', 'over', 'win', 'play']) {
      G.started = true; G.scene = sc; drawScene();
      eq(overlaps(G.ui).length, 0, sc + ' 面板命中区互相遮挡：' + overlaps(G.ui).join(' '));
    }
    // 竖屏布局也必须在画布内
    window.innerWidth = 390; window.innerHeight = 780; lastTouch = true; resize();
    ok(KEYS, '触屏竖屏生成虚拟键');
    const karr = Object.keys(KEYS).map(k => ({ id: k, sx: KEYS[k].x, sy: KEYS[k].y, sw: KEYS[k].w, sh: KEYS[k].h }));
    eq(overlaps(karr).length, 0, '虚拟键互相遮挡：' + overlaps(karr).join(' '));
    // 竖屏下面板同样不得压到按键带（九宫选关比三卡更高，必须回归）
    for (const sc of ['menu', 'levels', 'pause', 'result', 'over', 'win']) {
      G.scene = sc; drawScene();
      for (const u of G.ui) ok(u.sy >= -1 && u.sy + u.sh <= 780 - BAR_H + 2, '竖屏 ' + sc + ' 按钮压按键带 ' + u.id + ' ' + [u.sy, u.sh]);
      eq(overlaps(G.ui).length, 0, '竖屏 ' + sc + ' 面板互相遮挡：' + overlaps(G.ui).join(' '));
    }
    G.scene = 'play'; G.started = true; setup('normal', 0); drawScene();
    for (const k in KEYS) {
      const r = KEYS[k];
      ok(r.x >= 0 && r.y >= 780 - BAR_H - 2 && r.x + r.w <= 390 + 1 && r.y + r.h <= 780 + 1, '虚拟键越界 ' + k + ' ' + [r.x, r.y, r.w, r.h]);
      ok(r.w >= 26 && r.h >= 26, '虚拟键 ' + k + ' 尺寸可点');
    }
    ok(OY + VH * U <= 780 - BAR_H + 2, '竖屏场景不压到按键带');
    for (const u of G.ui) ok(u.sy + u.sh <= 780 - BAR_H + 2, '竖屏 HUD 按钮不落入按键带 ' + u.id);
    // 键位命中
    const jr = KEYS.jump;
    ok(keyHit(jr.x + 2, jr.y + 2) === 'jump', '跳键命中');
    ok(keyHit(KEYS.left.x + 2, KEYS.left.y + 2) === 'left', '左键命中');
    ok(keyHit(200, 200) === null, '场景中部不是按键');
    window.innerWidth = 1200; window.innerHeight = 800; lastTouch = false; resize();
    eq(KEYS, null, '键盘横屏不收按键带');
  })();

  // ============ 10. 持久化二十七格 ============
  (function () {
    store['shroom_best'] = '';
    G.best = {}; G.diff = 'normal'; G.levelIdx = 1; G.score = 12345; G.unlock = 3;
    saveBest();
    const saved = JSON.parse(store['shroom_best']);
    eq(saved['normal_1'], 12345, '按 难度_关卡 写格');
    eq(store['shroom_unlock'], '3', '解锁进度持久化');
    G.score = 100; saveBest();
    eq(JSON.parse(store['shroom_best'])['normal_1'], 12345, '低分不覆盖纪录');
    G.score = 20000; saveBest();
    eq(JSON.parse(store['shroom_best'])['normal_1'], 20000, '高分覆盖纪录');
    G.diff = 'hard'; G.levelIdx = 0; G.score = 777; saveBest();
    eq(JSON.parse(store['shroom_best'])['hard_0'], 777, '不同难度互不干扰');
    eq(Object.keys(JSON.parse(store['shroom_best'])).length, 2, '纪录格按需增长');
    loadBest(); eq(G.best['hard_0'], 777, 'loadBest 读回');
    loadUnlock(); eq(G.unlock, 3, 'loadUnlock 读回');
    // 三档难度 × 九关 = 二十七格，互不覆盖
    G.best = {}; store['shroom_best'] = '';
    DIFF_ORDER.forEach((d, di) => {
      for (let i = 0; i < LEVELS.length; i++) {
        G.diff = d; G.levelIdx = i; G.score = di * 100000 + i * 111 + 1; saveBest();
      }
    });
    const all = JSON.parse(store['shroom_best']);
    eq(Object.keys(all).length, DIFF_ORDER.length * LEVELS.length, '二十七格纪录全部写入');
    eq(all['hard_8'], 200889, '挑战第 9 关独立成格');
    eq(all['easy_0'], 1, '休闲第 1 关独立成格');
    G.diff = 'normal'; G.levelIdx = 4; G.score = 500000; saveBest();
    eq(JSON.parse(store['shroom_best'])['normal_4'], 500000, '新增关卡同样入格');
    store['shroom_unlock'] = '99'; loadUnlock();
    eq(G.unlock, LEVELS.length, '存档解锁数超过关卡数时收敛到九关');
    store['shroom_unlock'] = '0'; loadUnlock();
    eq(G.unlock, 1, '脏存档不会锁死全部关卡');
  })();

  // ============ 11. 输入驱动 Bot：九关 × 三档整局必胜 ============
  (function () {
    const AIR = 2 * JUMP_V / GRAV;
    let hold = 0, wasG = true;
    function botStep() {
      const p = G.player;
      IN.left = false; IN.right = false; IN.fire = false;
      if (!p || p.dead) { IN.jump = false; IN.run = false; return; }
      IN.right = true; IN.run = true;
      // 落地帧重置按压计数：跳跃需要新的抬升沿
      if (wasG !== p.onGround && p.onGround) hold = 0;
      wasG = p.onGround;
      const feet = p.y + p.h;
      const vx = Math.max(80, p.vx);
      // 坑沿与坑的远端落点
      let edge = -1, farX = -1;
      for (let d = 0; d <= 360; d += 6) if (!solidAt(p.x + p.w + d, feet + 8)) { edge = d; break; }
      if (edge >= 0) for (let d = edge; d <= 500; d += 6) if (solidAt(p.x + p.w + d, feet + 8)) { farX = p.x + p.w + d; break; }
      // 正前方台阶 / 墙
      let wall = -1;
      for (let d = 6; d <= 66; d += 6) if (solidAt(p.x + p.w + d, feet - 10)) { wall = d; break; }
      // 同层最近敌人
      let en = null, enD = 999;
      for (const e of G.enemies) {
        if (e.dead || e.squash > 0) continue;
        const d = e.x - (p.x + p.w);
        if (d < -10 || d > 260) continue;
        if (Math.abs((e.y + e.h) - feet) > 26) continue;
        if (d < enD) { enD = d; en = e; }
      }
      // 起跳抛物线在 x 处相对脚底升起的净高
      const arcH = x => { const t = (x - p.x) / vx; return JUMP_V * t - 0.5 * GRAV * t * t; };
      const reach = p.x + vx * AIR;
      let go = false, commit = false;
      // 坑：抛物线要够高跨过远端，且落点留余量
      if (edge >= 0) { if (farX < 0 || edge < 24) commit = true; else if (arcH(farX) > 16 && reach > farX + 40) go = true; }
      if (wall >= 0 && wall <= 42) go = true;
      if (en) {
        if (enD < 60) commit = true;                       // 贴脸了，不起跳就是撞
        else if (arcH(en.x + en.w / 2) > en.h + 14 && reach > en.x + en.w + 24) go = true;
      }
      if (commit) go = true;
      // 抬升沿保护：上一帧仍按着则本帧不续按，否则收不到新跳跃指令
      if (go && p.onGround && hold === 0 && !IN.jump) hold = 26;
      IN.jump = hold > 0;
      if (hold > 0) hold--;
      // 火焰形态：只要正前方有目标就喷（半空的蹦蹦蝠与滑行的龟壳也算），射击没有代价
      if (p.state === 'fire' && p.onGround) {
        for (const e of G.enemies) {
          if (e.dead || e.squash > 0) continue;
          const d = e.x - (p.x + p.w);
          if (d > 0 && d < 280) { IN.fire = true; break; }
        }
      }
    }
    function playLevel(diff, idx) {
      G.diff = diff;
      if (idx === 0) { G.score = 0; G.coinCount = 0; }
      startLevel(idx);
      hold = 0; wasG = true;
      let frames = 0, fireF = 0, bigF = 0;
      while ((G.scene === 'play' || G.scene === 'clear') && frames < 60 * 700) {
        botStep(); update(STEP); frames++;
        const s = G.player ? G.player.state : 'small';
        if (s === 'fire') fireF++; else if (s === 'big') bigF++;
      }
      clearInput();
      return { scene: G.scene, frames, score: G.score, coins: G.coinCount, lives: G.lives,
        res: G.lastResult, fireF, bigF };
    }
    const botTable = [];
    for (const diff of ['easy', 'normal', 'hard']) {
      G.unlock = 1;
      let prev = 0;
      for (let i = 0; i < LEVELS.length; i++) {
        const r = playLevel(diff, i);
        eq(r.scene, 'result', diff + ' 第 ' + (i + 1) + ' 关 Bot 必须过关（实际 ' + r.scene + '，剩命 ' + r.lives + '，用时 ' + (r.frames / 60).toFixed(1) + 's）');
        ok(r.frames > 60 * 15, diff + ' 第 ' + (i + 1) + ' 关不是一步蹦过去的（' + (r.frames / 60).toFixed(1) + 's）');
        ok(r.frames < 60 * 690, diff + ' 第 ' + (i + 1) + ' 关没有跑到回放上限（' + (r.frames / 60).toFixed(1) + 's）');
        const gained = r.score - prev; prev = r.score;
        ok(gained > 500, diff + ' 第 ' + (i + 1) + ' 关本关净得分 ' + gained + ' 应高于 500');
        ok(r.lives >= 0, diff + ' 第 ' + (i + 1) + ' 关过关时生命不为负');
        eq(G.unlock, Math.min(i + 2, LEVELS.length), diff + ' 第 ' + (i + 1) + ' 关后解锁推进');
        botTable.push({ diff, i, score: r.score, frames: r.frames, fireF: r.fireF, supply: LEVELS[i].parts.indexOf('supply') >= 0 });
      }
    }
    eq(botTable.length, 27, '二十七档（三难度 × 九关）全部重放');
    // 实测下界：末关累计分 easy 263710 / normal 319920 / hard 440600，跌破说明关卡或形态改动伤了通关收益
    for (const pair of [['easy', 250000], ['normal', 300000], ['hard', 420000]]) {
      const last = botTable.filter(x => x.diff === pair[0]).pop();
      ok(last.score >= pair[1], pair[0] + ' 九关累计得分 ' + last.score + ' 不应低于实测下界 ' + pair[1]);
    }
    // 路面补给：摆了 supply 的关卡 Bot 必须真吃到道具（火焰帧占比 > 10%），否则 'm'/'f' 等于白放
    const sup = botTable.filter(x => x.supply);
    eq(sup.length, 18, '第 4~9 关每档都含路面补给块');
    for (const r of sup) ok(r.fireF / r.frames > 0.1, '第 ' + (r.i + 1) + ' 关（' + r.diff + '）火焰帧占比仅 ' + (r.fireF / r.frames * 100).toFixed(0) + '%，补给没被吃到');
    // 前三关不放路面补给，保持入库时的挑战曲线（Bot 全程小形态）
    for (const r of botTable.filter(x => !x.supply)) {
      ok(r.i < 3, '只有前三关没有 supply 补给（第 ' + (r.i + 1) + ' 关）');
      eq(r.fireF, 0, '前三关 Bot 不靠道具通关');
    }
    // 确定性：同难度同关卡 Bot 重放逐位一致
    (function () {
      const once = idx => {
        G.diff = 'normal'; G.unlock = LEVELS.length; G.score = 0; G.coinCount = 0; startLevel(idx);
        hold = 0; wasG = true;
        for (let i = 0; i < 1800; i++) { botStep(); update(STEP); }
        clearInput();
        return hash();
      };
      eq(once(2), once(2), 'Bot 整段操作可逐位重放');
      eq(once(5), once(5), '第 6 关（熔岩洞窟）重放逐位一致');
    })();
    // 放任必败：不操作 → 每条命都耗到时间归零，最终 over
    (function () {
      G.diff = 'normal'; G.unlock = 3; G.score = 0; startLevel(0);
      clearInput();
      let frames = 0;
      const cap = Math.ceil((LEVELS[0].time * DIFFS.normal.timeMul + 8) * 60) * (DIFFS.normal.lives + 1);
      while (G.scene === 'play' && frames < cap) { update(STEP); frames++; }
      eq(G.scene, 'over', '什么都不做必然输（实际 ' + G.scene + '，跑了 ' + (frames / 60).toFixed(0) + 's）');
      ok(frames > 60 * 100, '放任也需耗时 ' + (frames / 60).toFixed(0) + 's');
    })();
    // 只向右冲不跳：应摔坑而死（证明 Bot 的跳跃确实在起作用）
    (function () {
      G.diff = 'normal'; G.unlock = 3; startLevel(0);
      clearInput(); IN.right = true; IN.run = true;
      let frames = 0;
      while (G.scene === 'play' && frames < 60 * 400) { update(STEP); frames++; }
      clearInput();
      ok(G.scene !== 'result', '只冲不跳不能过关（实际 ' + G.scene + '）');
    })();
    // 只有键盘输入能改变结果：模拟 keydown/keyup 通道写 IN
    (function () {
      const kd = listeners.window.keydown, ku = listeners.window.keyup;
      ok(!!kd && !!ku, 'window 注册了键盘监听');
      clearInput();
      kd({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: noop });
      eq(IN.right, true, 'keydown 写输入位');
      kd({ code: 'Space', key: ' ', preventDefault: noop });
      eq(IN.jump, true, '空格跳跃');
      kd({ code: 'ShiftLeft', key: 'Shift', preventDefault: noop });
      eq(IN.run, true, 'Shift 冲刺');
      ku({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: noop });
      eq(IN.right, false, 'keyup 清输入位');
      G.scene = 'play'; G.started = true;
      kd({ code: 'Escape', key: 'Escape', preventDefault: noop });
      eq(G.scene, 'pause', 'Esc 进入暂停');
      kd({ code: 'Escape', key: 'Escape', preventDefault: noop });
      eq(G.scene, 'play', 'Esc 恢复对局');
      kd({ key: 'm', code: 'KeyM', preventDefault: noop });
      kd({ key: 'm', code: 'KeyM', preventDefault: noop });
      kd({ code: 'Enter', key: 'Enter', preventDefault: noop });
      ok(true, 'Enter 确认通道无异常');
    })();
  })();

  // ============ 12. 手机/触屏：pointer 通道与倍速 ============
  (function () {
    const pd = listeners.window.pointerdown, pu = listeners.window.pointerup;
    ok(!!pd && !!pu, 'window 注册了 pointer 监听');
    window.innerWidth = 420; window.innerHeight = 800; lastTouch = true; resize();
    setup('normal', 0);
    ok(KEYS, '竖屏有虚拟键');
    const jk = KEYS.jump;
    pd({ pointerId: 1, clientX: jk.x + 5, clientY: jk.y + 5, preventDefault: noop });
    eq(IN.jump, true, '点虚拟跳键置位');
    pu({ pointerId: 1 });
    eq(IN.jump, false, '抬手清位');
    const lk = KEYS.left, rk = KEYS.right;
    pd({ pointerId: 2, clientX: rk.x + 5, clientY: rk.y + 5, preventDefault: noop });
    pd({ pointerId: 3, clientX: jk.x + 5, clientY: jk.y + 5, preventDefault: noop });
    eq(IN.right && IN.jump, true, '多点触控：边跑边跳');
    pu({ pointerId: 2 }); pu({ pointerId: 3 });
    eq(IN.right || IN.jump, false, '全部抬手归零');
    pd({ pointerId: 4, clientX: (OX + 10), clientY: (OY + 10), preventDefault: noop });
    pu({ pointerId: 4 });
    window.innerWidth = 1200; window.innerHeight = 800; lastTouch = false; resize();
    // 倍速：3 倍速下同一时间推进更多模拟
    setup('normal', 0);
    const t0 = G.timeLeft;
    G.speed = 3;
    for (let i = 0; i < 10; i++) { for (let s = 0; s < G.speed; s++) update(STEP); }
    const fast = t0 - G.timeLeft;
    setup('normal', 0);
    const t1 = G.timeLeft;
    G.speed = 1;
    for (let i = 0; i < 10; i++) update(STEP);
    eq(Math.round((t1 - G.timeLeft) * 1000), Math.round(fast / 3 * 1000), '倍速即多跑步长');
    eq(G.speed, 1, '速度常量可回写');
    ok(typeof frame === 'function' && typeof init === 'function', '主循环与初始化函数存在');
  })();

  return n;
})()
`;

eval(src + TESTS).then(total => {
  console.log('全部断言通过：' + total + ' 项');
}).catch(e => {
  console.error('测试失败：' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 5).join('\n'));
  process.exit(1);
});
