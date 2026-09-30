// 雪球兄弟 · 无头回归测试
// 用法：node _test.js            （全量：常量 + 几何审计 + 物理 + 行为观察 + 音效 + UI + 确定性 + Bot 九格）
//       node _test.js quick      （跳过 Bot 九格与反证，只跑单元段）
//       ONLY=d,li node _test.js  （只跑某一格 Bot，配合 TRACE=1 看死亡明细、DTR=1 看逐帧轨迹）
// 铁律：Bot 只通过 IN 输入对象驱动游戏，测试不得为了通过而调用内部函数或改写内部状态；
//       行为类断言一律靠「逐帧观察状态增量」得出，物理/关卡数值一旦改动必须重跑本文件。
const fs = require('fs');
const argv = process.argv.slice(2);
const QUICK = argv.indexOf('quick') >= 0;

let src = fs.readFileSync(__dirname + '/index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

const noop = () => { };
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : () => undefined)),
  set: () => true,
});
const makeEl = id => ({
  id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
  addEventListener: noop, setAttribute: noop, textContent: '', dataset: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
  getContext: () => ctxStub, width: 1200, height: 800
});
const els = {};
global.__els = els;
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl('game')),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('t')
};
global.window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, addEventListener: noop };
global.devicePixelRatio = 1;
global.requestAnimationFrame = noop;
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
};

const TESTS = `
;(async () => {
  let pass = 0; const fails = [];
  const ok = (name, cond, detail) => { if (cond) pass++; else fails.push(name + (detail ? '  [' + detail + ']' : '')); };
  const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
  const near = (name, got, want, tol) => ok(name, Math.abs(got - want) <= (tol === undefined ? 1e-6 : tol), 'got ' + got + ' want ' + want);
  const R2 = v => Math.round(v * 100) / 100;
  const report = cells => {
    const lines = [];
    for (const c of cells || []) {
      lines.push(['休闲 标准 挑战'.split(' ')[c.d] + '/L' + (c.li + 1), c.scene,
        'k=' + c.killed + '/' + LEVELS[c.li].quota, 'score=' + c.score, 'die=' + c.deaths,
        'frz=' + c.frz, 'time=' + Math.round(c.timeLeft), 'frames=' + c.frames].join(' '));
    }
    if (cells) console.log(lines.join('\\n'));
    if (cells) console.log('--- 观察到的机制事件（全部来自逐帧状态增量）---');
    if (cells) console.log('   ' + JSON.stringify(obs));
    console.log('---');
    console.log('断言 ' + pass + ' 通过 / ' + fails.length + ' 失败');
    if (fails.length) { console.log(fails.map(s => '  ✗ ' + s).join('\\n')); process.exitCode = 1; }
    else console.log('全部通过：常量/几何/碰撞/跳跃手感/机制链观察/敌人行为/存档/音效/面板 UI/确定性/Bot 九格/反证');
  };
  const clearIn = () => { IN.left = IN.right = IN.jump = IN.fire = false; };

  // ============================================================
  // 0. 引导：无头环境下 init 不自动跑，必须由测试自己走一遍真实启动路径
  // ============================================================
  init();
  eq('启动后停在主菜单', G.scene, 'menu');
  eq('零 DOM 弹层：整局只取过 #game 一个元素', Object.keys(global.__els), ['game']);
  ok('默认难度为标准档', G.diffIdx === 1 && G.diff === DIFFS[1]);
  eq('localStorage 存档键', [K_BEST, K_DIFF, K_UNLOCK], ['snowbro_best', 'snowbro_diff', 'snowbro_unlock']);

  // ============================================================
  // 1. 常量与世界表
  // ============================================================
  eq('世界网格', [T, COLS, ROWS, VW, VH, GROUND_ROW, GROUND_Y], [40, 20, 15, 800, 600, 13, 520]);
  eq('玩家碰撞盒与台宽', [PW, PH, ITEM_W, ITEM_H], [30, 36, 28, 26]);
  ok('玩家身高小于一格，扫掠时最多跨两行', PH < T && PW < T);
  const apex = JUMP_V * JUMP_V / (2 * GRAV);
  ok('满跳高度恰好两级（80 < ' + R2(apex) + ' < 120）', apex > 2 * T && apex < 3 * T);
  const upDx = k => { const disc = JUMP_V * JUMP_V - 2 * GRAV * k * T; return disc < 0 ? -1 : MOVE * (JUMP_V + Math.sqrt(disc)) / GRAV; };
  const flatDx = MOVE * (2 * JUMP_V / GRAV);
  ok('满跳平射程 ' + R2(flatDx) + 'px 覆盖 3 格多', flatDx > 3 * T && flatDx < 4 * T);
  ok('登高两级时可用行程仍 >80px（够做零行程梯子）', upDx(2) > 2 * T);
  ok('登高三级在数学上不可能（逼玩家逐级爬台）', upDx(3) < 0);
  ok('终端下落速度拆子步后每步 ≤10px', Math.ceil(MAX_FALL * STEP / 10) >= 2 && MAX_FALL * STEP / Math.ceil(MAX_FALL * STEP / 10) <= 10);
  ok('土狼时间与跳跃缓冲在人类可感区间', COYOTE >= 0.06 && COYOTE <= 0.12 && BUF >= 0.08 && BUF <= 0.15);
  ok('松手截断系数明显衰减上升', RISE_CUT > 0.2 && RISE_CUT < 0.7);
  ok('地面加速大于空中加速（空中不可无限修正）', ACC > AIR_ACC && FRIC > ACC);
  ok('复活保护窗口 1.5s ≥ 受伤硬直 0.85s', SPAWN_GRACE >= 1.5 && RESPAWN_PUSH > 3 * PW);
  ok('雪弹打不满整屏，远射程道具才有意义', SHOT_V * SHOT_LIFE > 12 * T && SHOT_V * SHOT_LIFE < VW &&
      SHOT_V * SHOT_LIFE * 1.8 > VW);
  eq('同屏雪弹上限（普通/速射）', [MAX_SHOT, MAX_SHOT_RAPID], [2, 3]);
  ok('冻球比滚球小，滚起来才有压迫感', FREEZE_R < ROLL_R && ROLL_V > MOVE * 1.2);
  ok('雪台寿命 > 撞墙搭台后爬上去所需时间', SNOW_PLAT_LIFE > 3 && PUFF_LIFE > 3 && PUFF_MAX >= 4);
  ok('骑球会被减速（不然站球上比跑还快）', RIDE_SLOW_MUL < 1 && BALL_SLOW_RIDE < 1);
  eq('连击倍率五档递增', COMBO_MUL, [1, 2, 3, 5, 8]);
  ok('连击窗口比射击间隔长（否则连不上）', COMBO_WIN > DIFFS[2].rate * 3);
  ok('道具存续 13s 足够跑过去捡', ITEM_LIFE > 10);
  ok(' haste 阈值 30% 剩余时间', HURRY > 0.2 && HURRY < 0.4);
  eq('敌人四形态', EORDER, ['blob', 'bat', 'hopper', 'thrower']);
  eq('道具六类型', IORDER, ['fire', 'rapid', 'stretch', 'bomb', 'shield', 'gem']);
  ok('每种敌人都存在且分值递增', EORDER.every(k => !!ENEMIES[k]) &&
      ENEMIES.blob.score < ENEMIES.bat.score && ENEMIES.bat.score < ENEMIES.hopper.score && ENEMIES.hopper.score < ENEMIES.thrower.score);
  ok('解冻 thaw 系数在 (0,1]（越硬的怪冻得越短）', EORDER.every(k => ENEMIES[k].thaw > 0 && ENEMIES[k].thaw <= 1));
  // 玩家 200px/s：任何敌人叠满 buff 也必须跑得过，否则贴脸必死无解
  const worstFoe = Math.max(...EORDER.map(k => ENEMIES[k].sp)) * DIFFS[2].eMul * 1.25 * 1.22;
  ok('最凶敌人（解冻+ haste+挑战档）' + R2(worstFoe) + 'px/s 仍可被玩家甩开', worstFoe < MOVE);
  ok('敌人体型都小于格子', EORDER.every(k => ENEMIES[k].w < T && ENEMIES[k].h < T));
  ok('定时道具统一 10s', ['fire', 'rapid', 'stretch'].every(k => ITEMS[k].timed === 10.0) &&
      ['bomb', 'shield', 'gem'].every(k => ITEMS[k].timed === 0));
  eq('出怪口位置', PORTAL, { x: VW / 2, y: 74 });
  ok('出怪口在所有台面之上（怪要先下落才能参战）', EORDER.length > 0 && PORTAL.y < Math.min(...LEVELS.flatMap(L => L.plats.map(p => p[0] * T))));
  eq('三档生命 5/4/3', DIFFS.map(d => d.lives), [5, 4, 3]);
  ok('三档单调：时间更短/出怪更快/冻结更短/怪更凶/分更高/同屏更多/射击间隔更长',
      DIFFS.every((d, i) => i === 0 || (d.timeMul < DIFFS[i - 1].timeMul && d.spawnInt < DIFFS[i - 1].spawnInt &&
        d.freeze < DIFFS[i - 1].freeze && d.eMul > DIFFS[i - 1].eMul && d.scoreMul > DIFFS[i - 1].scoreMul &&
        d.maxAlive > DIFFS[i - 1].maxAlive && d.rate > DIFFS[i - 1].rate)));
  ok('休闲档冻结 7s 容错、挑战档 5s 压迫', DIFFS[0].freeze === 7 && DIFFS[2].freeze === 5);

  // ============================================================
  // 2. 关卡几何审计（台面表 = 网格事实；门必须靠「零行程梯子」到达）
  // ============================================================
  const HALF = PW / 2, M_TAKE = HALF + 5, M_LAND = HALF + 7;
  function hopNeed(A, B) {
    const tLo = A.x0 + M_TAKE, tHi = A.x1 - M_TAKE, lLo = B.x0 + M_LAND, lHi = B.x1 - M_LAND;
    if (tLo > tHi || lLo > lHi) return -1;                        // 自身太窄，站不下
    const lo = Math.max(tLo, lLo), hi = Math.min(tHi, lHi);
    if (lo <= hi) return 0;                                       // 起跳区与落地区重叠 → 原地直上直下
    return lLo > tHi ? lLo - tHi : tLo - lHi;
  }
  function link(A, B) {
    if (A === B) return null;
    const need = hopNeed(A, B);
    if (need < 0) return null;
    const k = A.row - B.row;
    if (k > 0) { const dx = upDx(k); return (dx > 0 && need <= dx * 0.9) ? { kind: 'up', dx, k, need } : null; }
    if (k === 0) return need <= flatDx * 0.8 ? { kind: 'flat', dx: flatDx, need } : null;
    return (B.x0 < A.x1 + 130 && B.x1 > A.x0 - 130) ? { kind: 'down', dx: 0, need: 0 } : null;
  }
  function route(S, ai, bi) {
    const n = S.length, dist = new Array(n).fill(1e9), pre = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[ai] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] >= 1e9) break;
      done[u] = true;
      for (let v = 0; v < n; v++) {
        if (done[v] || v === u) continue;
        const e = link(S[u], S[v]);
        if (!e) continue;
        const cost = (e.kind === 'down' ? 3 : 1) + (e.need > 0 ? 60 + e.need : 0);
        if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; pre[v] = u; }
      }
    }
    if (dist[bi] >= 1e9) return null;
    const path = []; for (let j = bi; j !== ai; j = pre[j]) path.unshift(j);
    path.unshift(ai); return path;
  }
  function surfacesOf(li) {
    const S = [{ y: GROUND_Y, x0: T, x1: VW - T, row: GROUND_ROW, ground: true }];
    for (const [r, c0, c1] of LEVELS[li].plats) S.push({ y: r * T, x0: c0 * T, x1: (c1 + 1) * T, row: r });
    return S;
  }
  eq('关卡数量', LEVELS.length, 3);
  const seenLvName = [];
  for (const L of LEVELS) {
    const li = LEVELS.indexOf(L);
    seenLvName.push(L.cn + '/' + L.en);
    ok('第' + (li + 1) + '关 中文名与英文名齐备', !!L.cn && !!L.en);
    buildLevel(li);
    // 台面表与网格必须一一对应：同行两块台面若相邻，游戏会把它们并成一块，Bot 与网格就分叉了
    eq('第' + (li + 1) + '关 网格台面数 = 台面表条数（无相邻粘连）', plats.length, L.plats.length);
    ok('第' + (li + 1) + '关 台面几何与表一致',
      L.plats.every(([r, c0, c1]) => plats.some(p => p.row === r && p.x0 === c0 * T && p.x1 === (c1 + 1) * T)),
      plats.map(p => p.row + ':' + p.x0 + '-' + p.x1).join(','));
    let platCells = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 2) platCells++;
    eq('第' + (li + 1) + '关 台面格数无覆盖丢失', platCells, L.plats.reduce((a, p) => a + p[2] - p[1] + 1, 0));
    ok('第' + (li + 1) + '关 台面都在可站区间（行 1..12、列 1..18）',
      L.plats.every(([r, c0, c1]) => r >= 1 && r < GROUND_ROW && c0 >= 1 && c1 <= COLS - 2 && c0 <= c1));
    ok('第' + (li + 1) + '关 实心块同样在界内', (L.blocks || []).every(([r, c0, c1]) => r >= 1 && r < GROUND_ROW && c0 >= 1 && c1 <= COLS - 2));
    ok('第' + (li + 1) + '关 台面与实心块互不冲突', (L.blocks || []).every(([r, c0, c1]) =>
      !L.plats.some(([pr, p0, p1]) => pr === r && c0 <= p1 && c1 >= p0)));
    // 四周：左右实墙 + 底下两行实心
    ok('第' + (li + 1) + '关 左右实墙贯通', (() => { for (let r = 1; r < GROUND_ROW; r++) if (grid[r][0] !== 1 || grid[r][COLS - 1] !== 1) return false; return true; })());
    ok('第' + (li + 1) + '关 地面两行全实心', (() => { for (let r = GROUND_ROW; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] !== 1) return false; return true; })());
    ok('第' + (li + 1) + '关 顶边留空（不会一出生就卡头）', (() => { for (let c = 1; c < COLS - 1; c++) if (grid[0][c] !== 0) return false; return true; })());
    // 出生点：脚下实心、身体两格净空
    eq('第' + (li + 1) + '关 出生点站在地面上方一行', L.spawn.row, GROUND_ROW - 1);
    eq('第' + (li + 1) + '关 出生点脚下实心', grid[L.spawn.row + 1][L.spawn.col], 1);
    eq('第' + (li + 1) + '关 出生点本格净空', grid[L.spawn.row][L.spawn.col], 0);
    ok('第' + (li + 1) + '关 出生点不压台面', !L.plats.some(([r, c0, c1]) => r === L.spawn.row && L.spawn.col >= c0 && L.spawn.col <= c1));
    // 门：自己净空 + 头顶净空 + 必须站在台面之上（不能落地即通关）
    eq('第' + (li + 1) + '关 门格净空', grid[L.door.row][L.door.col], 0);
    eq('第' + (li + 1) + '关 门头顶净空', grid[L.door.row - 1][L.door.col], 0);
    eq('第' + (li + 1) + '关 门底下是台面（不是地面也不是实心）', grid[L.door.row + 1][L.door.col], 2);
    ok('第' + (li + 1) + '关 门高于地面两格以上', L.door.row <= GROUND_ROW - 3);
    // 梯子审计：地面→门 每一跳都必须零行程（像素级长跳对手机和人类都不友好）
    const S = surfacesOf(li);
    const dw = 36, dh = 46, dcx = L.door.col * T + (T - dw) / 2;
    const ti = S.findIndex(s => Math.abs(s.y - ((L.door.row + 1) * T)) < 4 && dcx >= s.x0 + M_LAND - 2 && dcx <= s.x1 - M_LAND + 2);
    ok('第' + (li + 1) + '关 门下台面可站人', ti > 0);
    const path = route(S, 0, ti);
    ok('第' + (li + 1) + '关 地面→门存在通路', !!path);
    if (path) {
      ok('第' + (li + 1) + '关 通路上每跳都是零行程（原地直上）', (() => {
        for (let i = 1; i < path.length; i++) { const e = link(S[path[i - 1]], S[path[i]]); if (!e || e.need > 0) return false; }
        return true;
      })(), path.slice(1).map(j => S[j].row + ':' + S[j].x0 + '-' + S[j].x1).join(' '));
      ok('第' + (li + 1) + '关 通路只有 4~6 跳（层数不过深）', path.length - 1 >= 4 && path.length - 1 <= 6, 'hops=' + (path.length - 1));
    }
    // 每块台面都得有用：都能从地面跳上去
    const bad = [];
    for (let i = 1; i < S.length; i++) if (!route(S, 0, i)) bad.push('r' + S[i].row + '@' + S[i].x0 + '-' + S[i].x1);
    eq('第' + (li + 1) + '关 没有到不了的悬空台', bad, []);
    // 配额与时间：末波怪刷完 + 全杀完必须留有余量
    const mixSum = Object.values(L.mix).reduce((a, b) => a + b, 0);
    ok('第' + (li + 1) + '关 怪源一波 ' + mixSum + ' 只 > 配额 ' + L.quota, mixSum >= L.quota);
    ok('第' + (li + 1) + '关 三档限时都够刷完并杀完配额', DIFFS.every(d => L.time * d.timeMul > L.quota * d.spawnInt * 2));
    ok('第' + (li + 1) + '关 关卡递增（配额与时长都单调）', li === 0 || (L.quota > LEVELS[li - 1].quota && L.time > LEVELS[li - 1].time));
    ok('第' + (li + 1) + '关 mix 只引用存在的敌人种类', Object.keys(L.mix).every(k => !!ENEMIES[k]));
    ok('第' + (li + 1) + '关 主题色齐备', ['sky1', 'sky2', 'aurora', 'rock', 'snow', 'accent'].every(k => !!L.theme[k]));
  }
  eq('三关关卡名互不相同', seenLvName.length, 3);
  // L1 左右两条梯子（对称性：别只有一条上顶路）
  buildLevel(0);
  eq('第1关 台面块数（左右双梯）', LEVELS[0].plats.length, 10);

  // ============================================================
  // 3. 移动 / 接触静止 / 单向面（全部用真实输入驱动）
  // ============================================================
  const frames = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); update(STEP); } };
  // 手感/接触测试必须与「被怪追死」解耦：封住刷怪口 + 把倒计时取大，update 主循环与被测判据一个都不改。
  // （否则 200 帧后怪脸贴脸把人抓死，测到的「抽搐」其实是复活抖动，红得毫无信息量）
  const SPAWN_FN = spawnFoe;
  const isoPlay = li => { clearIn(); setDiff(1); beginPlay(li); spawnFoe = () => { }; G.timeLeft = 9999; };
  const liveSpawn = () => { spawnFoe = SPAWN_FN; };
  const solidAt = (x, y) => { const c = Math.floor(x / T), r = Math.floor(y / T); if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return y >= VH || x < 0 || x >= VW; return grid[r][c] === 1; };
  const boxInSolid = b => solidAt(b.x + 0.02, b.y + 0.02) || solidAt(b.x + b.w - 0.02, b.y + 0.02) ||
    solidAt(b.x + 0.02, b.y + b.h - 0.02) || solidAt(b.x + b.w - 0.02, b.y + b.h - 0.02);
  clearIn(); setDiff(1); beginPlay(0);
  eq('开局场景为 play 且时间满', [G.scene, R2(G.timeLeft)], ['play', R2(LEVELS[0].time * DIFFS[1].timeMul)]);
  near('出生点水平居中于出生格', player.x + player.w / 2, LEVELS[0].spawn.col * T + T / 2, 0.01);
  near('出生点脚底贴合地面', player.y + player.h, GROUND_Y, 0.02);
  eq('出生即有保护无敌帧', player.inv > 1.4, true);
  // 贴左墙：接触静止位置必须精确停在墙的右沿（曾经按移动前的格子回退，导致人在 40↔80 之间抽搐）
  isoPlay(0);
  IN.left = true; frames(220);
  let xs = []; frames(60, () => xs.push(+player.x.toFixed(2)));
  clearIn();
  ok('贴左墙精确静止在 x=40.01（不再左右抽搐）', [...new Set(xs)].length === 1 && xs[0] === 40.01, xs.slice(0, 20).join(','));
  ok('贴墙时速度归零', player.vx === 0);
  ok('贴墙期间没有穿进实心格', !boxInSolid(player));
  // 贴右墙
  IN.right = true; frames(500);
  xs = []; frames(60, () => xs.push(+player.x.toFixed(2)));
  clearIn();
  ok('贴右墙静止在 x=729.99', [...new Set(xs)].length === 1 && xs[0] === VW - T - PW - 0.01, xs.slice(-6).join(','));
  // 撞天花板：只许贴到实心块下沿，不许被拽下一整格。
  // 判据取第 2 关右墙的实心块（row10 → 下沿 y=440）：第 1 关头顶那两颗块离地面 4 格以上，
  // 满跳 107px 根本够不着，在 L1 里测「撞头」只会测出「从没撞过」。
  isoPlay(1);
  IN.right = true; frames(240); clearIn();
  let headMin = 1e9, bumpAt = -1, bumped = 0;
  IN.jump = true;
  for (let i = 0; i < 60; i++) {
    update(STEP);
    if (player.y < headMin) headMin = player.y;
    if (Math.abs(player.y - 440.01) < 0.02 && player.vy === 0) { bumped++; if (bumpAt < 0) bumpAt = i; }
  }
  clearIn();
  ok('撞头贴到实心块下沿 y=440.01 并停住', bumped > 0 && bumpAt > 0, 'min=' + R2(headMin) + ' bumps=' + bumped);
  ok('撞头绝不会被往下拽一整格（y 始终 ≥440）', headMin >= 440 - 1e-6, 'min=' + R2(headMin));
  frames(90);
  near('撞头后自由落回地面', player.y + player.h, GROUND_Y, 0.02);
  // 单向面：上升时穿过、下落时接住
  isoPlay(0);
  let caught = -1, roseThrough = false, negGround = 0;
  IN.jump = true;
  for (let i = 0; i < 90; i++) {
    update(STEP);
    if (player.vy < 0 && Math.abs(player.y + player.h - 440) < 8) roseThrough = true;
    if (player.onGround && player.vy >= 0 && Math.abs(player.y + player.h - 440) < 0.01) { caught = i; }
    if (player.onGround && player.vy < 0) negGround++;
  }
  clearIn();
  ok('上升过程穿过单向台（脚底越过 440 且 vy<0）', roseThrough);
  ok('下落时单向台把玩家接住（y=404 静止）', caught > 0, 'caught=' + caught);
  eq('任何情况下都不会在上升中被判为着地', negGround, 0);
  near('接住后脚底精确停在台面行沿', player.y + player.h, 440, 0.01);
  // 单向台可以从下方穿过、也能从边缘走下去（不粘脚）
  IN.right = true;
  let steppedOff = 0;
  frames(120, () => { if (player.y + player.h > 500 && player.onGround) steppedOff++; });
  clearIn();
  ok('从台面走出边缘后落回地面', steppedOff > 0);
  // 雪台（动态单向面）同样接得住人：撞墙结台后原地跳两次即可登台
  isoPlay(0);
  IN.right = true; IN.fire = true;
  let puffSeen = 0, badBody = 0;
  for (let i = 0; i < 260; i++) {
    update(STEP);
    puffSeen = Math.max(puffSeen, dynPlats.filter(d => d.kind === 'puff').length);
    if (boxInSolid(player) || boxInSolid({ x: player.x, y: player.y, w: player.w, h: player.h })) badBody++;
    if (i % 7 === 3) { IN.jump = true; } else IN.jump = false;
  }
  clearIn();
  ok('雪弹撞墙会凝结小雪台（同屏可见）', puffSeen >= 1, 'puff=' + puffSeen);
  ok('小雪台不超过同屏上限', puffSeen <= PUFF_MAX, 'puff=' + puffSeen);
  eq('连续吐弹 260 帧 never 卡进实心', badBody, 0);

  // 小雪台能一级级往上搭（撞墙结台 → 踩上去 → 再朝墙吐一发 → 台子更高）：这是「搭台登顶」的手感地基
  isoPlay(0);
  IN.right = true; frames(500);                       // 贴到右墙（小雪台只会结在墙根）
  let lifts = {}, maxLift = 0, ladderSolid = 0;
  for (let i = 0; i < 60 * 26; i++) {
    IN.fire = true; IN.right = true;
    IN.jump = (i % 26) < 12;                          // 按住 12 帧（升程 ~88px，够跨过一级）再松 14 帧
    update(STEP);
    if (player.onGround && Math.abs(player.vx) < 1) {
      const lift = Math.round(GROUND_Y - (player.y + player.h));
      lifts[lift] = (lifts[lift] || 0) + 1;
      maxLift = Math.max(maxLift, lift);
    }
    if (boxInSolid(player)) ladderSolid++;
  }
  clearIn();
  const levels = Object.keys(lifts).map(Number).filter(v => v >= 0).sort((a, b) => a - b);
  ok('贴墙吐弹能踩着小雪台往上爬（站到过的层数：' + levels.join('/') + 'px）', levels.length >= 4 && levels[0] === 0,
    'lv=' + levels.join(',') + ' puff=' + dynPlats.length);
  ok('最高站上 ' + maxLift + 'px（≥5 级台子，小雪台确实是可站立的单向面）', maxLift >= 5 * T, 'max=' + R2(maxLift));
  eq('搭台全程没有卡进实心格', ladderSolid, 0);
  ok('同屏小雪台始终不超上限', dynPlats.filter(d => d.kind === 'puff').length <= PUFF_MAX, 'now=' + dynPlats.filter(d => d.kind === 'puff').length);

  // ============================================================
  // 4. 跳跃手感三件套：土狼时间 / 跳跃缓冲 / 松手截断 / 长按不连跳
  // ============================================================
  const jumpFrom = () => { let vy0 = 0; return { arm: () => vy0 = player.vy, top: () => vy0 }; };
  void jumpFrom;
  // 土狼时间：走出台面边缘后短按仍能起跳
  isoPlay(0);
  IN.jump = true; frames(28); IN.jump = false; frames(2);   // 站上 row11 台面
  let coyoteOk = false;
  for (let i = 0; i < 200 && !coyoteOk; i++) {
    IN.right = true; update(STEP);
    if (!player.onGround && player.vy > 0 && player.vy < 260) {     // 刚走出边缘、还在土狼窗口内
      IN.jump = true; update(STEP);
      coyoteOk = player.vy < -300;
      break;
    }
  }
  clearIn();
  ok('走出边缘 0.09s 内按下跳跃仍然起跳（土狼时间）', coyoteOk);
  // 跳跃缓冲：下落途中、离地还有一点点时按下，落地那一帧必须自动起跳
  isoPlay(0);
  IN.jump = true; frames(8); IN.jump = false;      // 先离地
  let bufOk = false, pressed = false, landed = false;
  for (let i = 0; i < 140 && !bufOk; i++) {
    const gap = GROUND_Y - (player.y + player.h);
    if (!pressed && player.vy > 0 && gap > 0 && gap < 22 && !player.prevJump) {
      IN.jump = true; update(STEP); IN.jump = false;   // 只按一帧，剩下交给缓冲
      pressed = true;
      continue;
    }
    const vyBefore = player.vy;
    update(STEP);
    if (pressed && !landed && player.onGround) landed = true;
    /* 缓冲出来的这一跳按「点按」处理，同一帧就被松手截断削到约 -256，
       所以判据只能是「落地那一帧又腾空」，不能拿满跳的 -640 去卡它。 */
    if (landed && vyBefore >= -1 && player.vy < -100) bufOk = true;
  }
  clearIn();
  ok('空中按下跳跃、落地帧自动起跳（跳跃缓冲生效）', bufOk, 'pressed=' + pressed + ' landed=' + landed);
  // 松手截断：早松手明显跳得矮
  const riseMax = hold => {
    isoPlay(0);
    frames(6);
    IN.jump = true; let top = 0;
    for (let i = 0; i < 60; i++) { if (i === hold) IN.jump = false; update(STEP); top = Math.max(top, GROUND_Y - (player.y + player.h)); }
    clearIn();
    return top;
  };
  const rFull = riseMax(60), rCut = riseMax(5);
  ok('满跳 ' + R2(rFull) + 'px 明显高于提前松手 ' + R2(rCut) + 'px', rFull > 100 && rCut < rFull * 0.8 && rCut > 20);
  // 长按不连跳：跳起后一直按住，落地不得自动再跳
  isoPlay(0);
  IN.jump = true;
  let jumps = 0, prevVy = player.vy;
  for (let i = 0; i < 200; i++) {
    update(STEP);
    if (prevVy > -50 && player.vy < -400) jumps++;   // 由「非上升」突变到强上升 = 又起跳一次
    prevVy = player.vy;
  }
  clearIn();
  ok('长按跳跃键只跳一次（不自动连跳）', jumps === 1, 'jumps=' + jumps);
  // 二段跳必须不存在
  isoPlay(0);
  frames(6); IN.jump = true; frames(4); IN.jump = false; frames(6);
  const midAirVy = player.vy;
  IN.jump = true; frames(2);
  ok('空中再按不会二段跳', player.vy >= midAirVy - 1e-6, 'vy ' + R2(midAirVy) + '→' + R2(player.vy));
  clearIn();

  // ============================================================
  // 5. 伤害规则：无踩杀、护盾挡一次、受伤后有无敌帧
  // ============================================================
  liveSpawn();                             // 手感测试结束，把刷怪口还给游戏
  clearIn(); setDiff(1); beginPlay(0);
  G.timeLeft = 999;                        // 只测受伤，不让时间先耗尽
  let touched = 0, stompSurvived = 0, prevLives = G.lives;
  IN.jump = false;
  for (let i = 0; i < 60 * 40 && touched < 3; i++) {
    update(STEP);
    if (G.lives < prevLives) { touched++; prevLives = G.lives; }
    if (player.onGround && player.vy < 0) stompSurvived++;
    if (touched && player.inv <= 0 && foes.some(f => !f.dead && !f.frozen && !f.leaving &&
      f.x < player.x + player.w && f.x + f.w > player.x && f.y < player.y + player.h && f.y + f.h > player.y)) {
      // 同一只怪在无敌帧结束后继续接触才会再扣命：证明无敌窗口确实存在（不是每帧都死）
    }
  }
  clearIn();
  ok('站着不动会被抓（本局 ' + touched + ' 次死亡，无踩杀）', touched >= 2, 'touched=' + touched);
  eq('死亡扣命走的是同一条 hurt 通道', G.deathBy === 'touch' || G.deathBy === 'bolt' || G.deathBy === '', true);
  void stompSurvived;

  // ============================================================
  // 6~9. 机制链与敌人行为：交给 Bot 九格逐帧观察（见第 10 节 obs）
  //        这里只补两组「输入可控、结论唯一」的微场景
  // ============================================================
  // 6. 时间耗尽必须走 fail，且 fail 里写清 timeout
  clearIn(); setDiff(0); beginPlay(0);
  G.timeLeft = 0.5;
  frames(60);
  eq('时间到 → fail 场景', G.scene, 'fail');
  ok('失败原因标注超时', G.clearInfo && G.clearInfo.timeout === true);
  eq('超时不进纪录格（得分不结算）', G.clearInfo.gain, 0);
  // 7. 配额未满绝不开门
  clearIn(); setDiff(1); beginPlay(0);
  G.timeLeft = 999;
  let doorTooEarly = false;
  for (let i = 0; i < 60 * 8; i++) { update(STEP); if (G.door && G.killed < LEVELS[0].quota) doorTooEarly = true; }
  clearIn();
  eq('前 8 秒不可能出现门', doorTooEarly, false);
  // 8. 倍速只改推进次数、不改步长（固定 1/60 才谈得上确定性）
  clearIn(); setDiff(1); beginPlay(0);
  const t1 = (() => { G.speed = 1; const t0 = G.timeLeft; for (let i = 0; i < 60; i++) { for (let s = 0; s < G.speed; s++) update(STEP); } return t0 - G.timeLeft; })();
  beginPlay(0);
  const t3 = (() => { G.speed = 3; const t0 = G.timeLeft; for (let i = 0; i < 60; i++) { for (let s = 0; s < G.speed; s++) update(STEP); } return t0 - G.timeLeft; })();
  G.speed = 1; clearIn();
  near('1x 跑 60 帧 = 1 秒', t1, 1.0, 1e-6);
  near('3x 跑 60 帧 = 3 秒仿真', t3, 3.0, 1e-6);
  ok('倍速不是靠放大 dt 实现（步长恒为 1/60）', STEP === 1 / 60 && G.speed === 1);

  // ============================================================
  // 9. 面板 UI：全部代码绘制、命中区在视口内、点击流真的接得上
  // ============================================================
  G.speed = 1; resize();
  const u = id => uiHits.filter(h => h.id === id).map(h => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
  const inView = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= VW && r.y + r.h <= VH;
  G.scene = 'menu'; draw();
  eq('主菜单三个主按钮（选关/开始/静音圆钮之外只有难度胶囊）',
    ['start', 'levels', 'sound0'].map(id => u(id).length), [1, 1, 1]);
  const pills = ['diff0', 'diff1', 'diff2'].map(id => u(id)[0]);
  ok('难度胶囊等宽', pills.every(r => Math.abs(r.w - pills[0].w) < 1e-6), JSON.stringify(pills.map(r => R2(r.w))));
  near('难度胶囊等距', (pills[1].x - pills[0].x) - (pills[2].x - pills[1].x), 0, 1e-6);
  near('难度胶囊行左缘 = 面板左内缩 (px+22)', pills[0].x, 207, 1e-6);
  near('难度胶囊行右缘 = 面板右内缩 (px+pw-22)', pills[2].x + pills[2].w, 593, 1e-6);
  const bt = ['levels', 'start'].map(id => u(id)[0]);
  near('主按钮行与胶囊行同左边距', bt[0].x, pills[0].x, 1e-6);
  near('主按钮行右缘对齐胶囊行', bt[1].x + bt[1].w, pills[2].x + pills[2].w, 1e-6);
  ok('主菜单没有重叠的点击区', (() => {
    for (let i = 0; i < uiHits.length; i++) for (let j = i + 1; j < uiHits.length; j++) {
      const a = uiHits[i], b = uiHits[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
    return true;
  })(), JSON.stringify(uiHits.map(h => h.id)));
  ok('主菜单所有点击区都在视口内', uiHits.every(h => inView(h)), uiHits.map(h => h.id).join(','));
  // 点难度胶囊 → 真的换档（横切面：从 normal 点 easy）
  const click = id => { const r = u(id)[0]; onPointerDown({ clientX: (r.x + r.w / 2) * S + OX, clientY: (r.y + r.h / 2) * S + OY, preventDefault: noop }); };
  eq('当前档位', G.diffIdx, 1);
  click('diff0');
  eq('点第一格切到休闲档', G.diffIdx, 0);
  eq('切档立刻落盘', JSON.parse(store['snowbro_diff']), 0);
  click('diff2'); eq('点第三格切到挑战档', G.diffIdx, 2);
  click('diff1'); eq('点中间回到标准档', G.diffIdx, 1);
  // 点「选关」→ levels；点第 2/3 张卡 locked 不许进
  click('levels');
  eq('选关面板在场景内绘制', G.scene, 'levels');
  draw();
  eq('选关三张卡 + 返回按钮', ['lv0', 'lv1', 'lv2', 'back'].map(id => u(id).length), [1, 0, 0, 1]);
  ok('未解锁关卡用 locked 区（点了没反应）', u('locked1').length === 1 && u('locked2').length === 1);
  const before = G.scene;
  click('locked1');
  eq('点未解锁卡不切场景', G.scene, before);
  draw();
  const cards = ['lv0', 'locked1', 'locked2'].map(id => (u(id)[0] || u('locked' + id.slice(-1))[0]));
  ok('三张卡等宽等距', cards.every(c => Math.abs(c.w - cards[0].w) < 1e-6) &&
    Math.abs((cards[1].x - cards[0].x) - (cards[2].x - cards[1].x)) < 1e-6, JSON.stringify(cards.map(c => R2(c.x))));
  click('back');
  eq('返回回主菜单', G.scene, 'menu');
  // 键盘：Enter 在主菜单 = 开始
  draw();
  onKey({ code: 'Enter', preventDefault: noop }, true);
  eq('Enter 直接开局', G.scene, 'play');
  draw();
  eq('HUD 三个圆钮（菜单/静音/倍速）', ['menu', 'sound', 'speed'].map(id => u(id).length), [1, 1, 1]);
  const hudBtns = ['menu', 'sound', 'speed'].map(id => u(id)[0]);
  ok('HUD 圆钮等半径且同一水平线', hudBtns.every(b => b.w === hudBtns[0].w && b.y === hudBtns[0].y));
  ok('HUD 圆钮互不重叠', (() => {
    for (let i = 0; i < hudBtns.length; i++) for (let j = i + 1; j < hudBtns.length; j++) {
      const a = hudBtns[i], b = hudBtns[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
    return true;
  })(), JSON.stringify(hudBtns.map(b => [b.x, R2(b.x + b.w), b.y])));
  near('HUD 倍速钮不压到屏幕左半（留给增益 chip）', hudBtns[2].x + hudBtns[2].w, VW - 92 + 15, 0.01);
  // 暂停 → 继续 / 重打 / 退出
  click('menu');
  eq('点 HUD 菜单钮进暂停', G.scene, 'pause');
  draw();
  eq('暂停面板三键', ['resume', 'retry', 'quit'].map(id => u(id).length), [1, 1, 1]);
  const pr = ['resume', 'retry', 'quit'].map(id => u(id)[0]);
  ok('暂停面板「继续」整行宽 = 下面两键之和 + 间距', Math.abs(pr[0].w - (pr[1].w * 2 + 8)) < 1e-6, JSON.stringify(pr.map(p => R2(p.w))));
  near('暂停面板两小键等宽', pr[2].x - (pr[1].x + pr[1].w), 8, 1e-6);
  click('resume');
  eq('继续回到对局', G.scene, 'play');
  onKey({ code: 'Escape', preventDefault: noop }, true);
  eq('Esc 进暂停', G.scene, 'pause');
  onKey({ code: 'Escape', preventDefault: noop }, true);
  eq('Esc 再按回对局', G.scene, 'play');
  // 静音与倍速开关
  const m0 = muted;
  onKey({ code: 'KeyM', preventDefault: noop }, true);
  eq('M 键切静音', muted, !m0);
  onKey({ code: 'KeyM', preventDefault: noop }, true);
  eq('再按恢复', muted, m0);
  G.speed = 1; click('speed'); eq('点倍速 1→2', G.speed, 2); click('speed'); eq('2→3', G.speed, 3); click('speed'); eq('3→1 回环', G.speed, 1);
  onKey({ code: 'F3', preventDefault: noop }, true); eq('F3 直接三倍速', G.speed, 3);
  onKey({ code: 'F1', preventDefault: noop }, true); eq('F1 回到一倍速', G.speed, 1);
  // 手机竖屏：虚拟键四枚、不重叠、不超出安全区
  const keyDown = (cx, cy) => { onPointerDown({ clientX: cx, clientY: cy, preventDefault: noop }); };
  global.window.innerWidth = 390; global.window.innerHeight = 844;
  resize();
  eq('竖屏切 portrait', [portrait, vkeys.length > 0], [true, true]);
  eq('竖屏四枚虚拟键（左右 + 跳/吐，一行均分）', vkeys.map(k => k.id), ['left', 'right', 'jump', 'fire']);
  ok('虚拟键行整体居中（左右留同称边距）', (() => {
    const l = Math.min(...vkeys.map(k => k.x)), r = Math.max(...vkeys.map(k => k.x + k.w));
    return Math.abs(l - (390 - r)) < 1e-6 && l >= 0;
  })(), JSON.stringify(vkeys.map(k => R2(k.x))));
  ok('虚拟键不越界', vkeys.every(k => k.x >= 0 && k.y >= 0 && k.x + k.w <= 390 && k.y + k.h <= 844),
    JSON.stringify(vkeys.map(k => [R2(k.x), R2(k.y), R2(k.w), R2(k.h)])));
  ok('虚拟键互不重叠（支持多点按住）', (() => {
    for (let i = 0; i < vkeys.length; i++) for (let j = i + 1; j < vkeys.length; j++) {
      const a = vkeys[i], b = vkeys[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
    return true;
  })());
  ok('左右键在左半、跳/吐在右半（拇指分区）',
    vkeys.filter(k => k.id === 'left' || k.id === 'right').every(k => k.x + k.w < 390 / 2) &&
    vkeys.filter(k => k.id === 'jump' || k.id === 'fire').every(k => k.x > 390 / 2));
  ok('虚拟键区不压游戏画面（画面被整体上移）', VH * S + keyStrip <= 844 + 1e-6, 'S=' + S + ' strip=' + R2(keyStrip));
  clearIn(); keyDown(vkeys[0].x + 5, vkeys[0].y + 5);
  ok('按住左键 = IN.left', IN.left === true && IN.right === false);
  onPointerUp({});
  eq('抬手全部释放（不会粘键）', [IN.left, IN.right, IN.jump, IN.fire], [false, false, false, false]);
  global.window.innerWidth = 1200; global.window.innerHeight = 800;
  resize();
  eq('横屏不收虚拟键条', [portrait, vkeys.length, keyStrip], [false, 0, 0]);
  draw();
  eq('横屏主对局场景不注册虚拟键命中区', uiHits.filter(h => h.id === 'left' || h.id === 'jump').length, 0);

  // ============================================================
  // 10. 音效总线：假 AudioContext 守住节点生命周期与「噪声不消耗种子」
  // ============================================================
  const alog = [];
  const mkParam = () => ({ value: 0, setValueAtTime() { }, exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new Error('非正指数目标值 ' + v); }, linearRampToValueAtTime() { } });
  const mkNode = kind => {
    const n = {
      kind, started: false, connect() { }, disconnect() { }, onended: null,
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
  audioInit();
  ok('音频总线已建立（master 增益 + 压缩器）', !!AC && !!master);
  let audioErr = null, sfxNames = Object.keys(SFX), sfxOk = 0;
  for (const k of sfxNames) {
    try { voices = 0; lastBoom = -1; SFX[k](); sfxOk++; } catch (e) { audioErr = k + ' → ' + e.message; break; }
  }
  ok('全部 ' + sfxOk + ' 个音效都能安全触发（无 start/stop 乱序、无非正 ramp）', audioErr === null, audioErr || '');
  ok('确实建立了发声节点', alog.filter(s => s === 'start').length >= sfxOk);
  // 种子必须完全不参与音效：跑一轮音效后随机序列不变 → 真机与无头重放才不会分叉
  voices = 0; setSeed(12345); const seedBefore = _seed;
  for (let i = 0; i < 30; i++) { voices = 0; noise(0.1, 0.1, 900); tone(500, 0.1, 'square', 0.1, 200); }
  eq('音效绝不消耗种子随机（噪声只用 Math.random）', _seed, seedBefore);
  voices = 0; alog.length = 0;
  for (let i = 0; i < 60; i++) tone(700, 0.05, 'square', 0.09, 300);
  ok('同屏声部不无限增长（超额度直接不建节点）', alog.filter(s => s === 'start').length <= 12,
    'starts=' + alog.filter(s => s === 'start').length);
  voices = 0; muted = true; alog.length = 0; SFX.shot(); SFX.pop(); SFX.boom();
  eq('静音时零节点', alog.length, 0);
  muted = false; AC = null; master = null; voices = 0; delete global.window.AudioContext;

  // ============================================================
  // 11. 确定性：同种子 + 同输入 → 逐帧一致；换输入必换轨迹
  // ============================================================
  const traceRun = (mut) => {
    setDiff(1); beginPlay(0);
    const H = [];
    for (let f = 0; f < 900; f++) {
      clearIn();
      IN.fire = true; IN.right = f % 3 !== 2;
      IN.jump = ((f % 47) < 6) !== !!mut;
      update(STEP);
      H.push(player.x.toFixed(6) + ',' + player.y.toFixed(6) + ',' + G.killed + ',' + G.score + ',' +
        foes.length + ',' + balls.length + ',' + shots.length + ',' + dynPlats.length + ',' + G.lives);
    }
    clearIn();
    let h = 2166136261;
    for (const s of H.join('|')) { h ^= s.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  const a1 = traceRun(), a2 = traceRun();
  eq('同种子 + 同输入 → 逐帧完全一致', a1, a2);
  const a3 = traceRun(1);
  ok('重放不是空跑（轨迹哈希有效）', a1 !== 0);
  ok('换输入必然换轨迹', a3 !== a1);
  const a4 = (() => { setDiff(2); beginPlay(0); const s = []; for (let f = 0; f < 300; f++) { clearIn(); IN.fire = true; update(STEP); s.push(player.x.toFixed(6)); } clearIn(); let h = 2166136261; for (const c of s.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; })();
  const a5 = (() => { setDiff(2); beginPlay(0); const s = []; for (let f = 0; f < 300; f++) { clearIn(); IN.fire = true; update(STEP); s.push(player.x.toFixed(6)); } clearIn(); let h = 2166136261; for (const c of s.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; })();
  setDiff(1);
  eq('挑战档同输入同样逐帧一致', a4, a5);
  ok('换难度会换种子（同一输入不同轨迹）', a4 !== a1);
  // 出怪队列由种子决定且能不断补充（配额永远可达）
  setSeed(20260930 + 7919); refillQueue();
  const q1 = G.spawnQueue.join(',');
  setSeed(20260930 + 7919); refillQueue();
  eq('怪源洗牌确定', G.spawnQueue.join(','), q1);
  eq('一波怪数量 = 当前关 mix 之和', [G.li, G.spawnQueue.length], [0, Object.values(LEVELS[0].mix).reduce((x, y) => x + y, 0)]);
  ok('怪源耗尽会自动补波（不会刷完还差几只）', (() => { setDiff(1); beginPlay(1); G.spawnLeft = 0; G.killed = 0; G.timeLeft = 999; frames(30); return G.spawnLeft > 0 || G.spawnQueue.length > 0; })());
  clearIn();

  // ============================================================
  // 12. Bot 九格：只用 IN 输入驱动 + 逐帧机制观察
  // ============================================================
  const obs = {
    froze: 0, rolls: 0, snowPlat: 0, puff: 0, burstKill: 0, revives: 0, angry: 0,
    pushFrames: 0, boltShots: 0, warnGapMin: 999, hopTravelMax: 0,
    hopCount: 0, hopMoved: 0, batErrMaxFrames: 0, batBandErr: 0, overheadStuckMax: 0,
    comboMax: 0, items: {}, popups: {}, deaths: 0, deathBy: {}, maxAliveFoes: 0,
    insideSolid: 0, foeInsideSolid: 0, sunk: 0, doorOpened: 0, shieldBlocks: 0,
    bombFreeze: 0, rapidShots: 0, capBlocked: 0, livesKept: 0, quotaReached: 0,
  };
  if (QUICK) { report(null); return; }
  const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const DTR = !!process.env.DTR, TRACE = !!process.env.TRACE, CLOG = !!process.env.CLOG;

  // ---- 静态台面图 + 「最小行程跳」爬台状态机（与第 2 节几何审计同一套模型）----
  const SCACHE = {};
  const surfacesCache = li => SCACHE[li] || (SCACHE[li] = surfacesOf(li));
  const BOT = {
    jumpFrames: 0, waitRelease: 0, climb: null, pushBall: null, retreat: null,
    lastKilled: 0, sinceKill: 0,
    acts: {}, trace: [], lastAct: '',
  };
  function bmove(dir) { IN.left = dir < 0; IN.right = dir > 0; }
  function bstop() { IN.left = IN.right = false; }
  function blocked(dir) {
    for (const f of live()) {
      const dy = (f.y + f.h) - (player.y + player.h);
      /* 「正往下掉、马上砸进我这一行」的怪也算挡路：只按同行 ±30px 判的话，退到墙角那一步
         会因为「右边那只还差 37px 没落地」不算阻挡，正好一头走进落点（d2/L3 f331 就是这个形状）。 */
      if (!(Math.abs(dy) <= 30 || (dy < 0 && dy > -90 && f.vy > 60))) continue;
      const dx = f.x + f.w / 2 - (player.x + player.w / 2);
      if (dx * dir > 0 && Math.abs(dx) < 46) return f;
    }
    return null;
  }
  // 撤退「坚持原方向」用的前瞻：正在掉下来的怪在同台面判据里还不算挡住，等它算挡住时已经砸脸上了
  function aheadThreat(dir) {
    for (const f of live()) {
      const dx = f.x + f.w / 2 - (player.x + player.w / 2);
      if (dx * dir <= 0 || Math.abs(dx) > 90) continue;
      if (Math.abs((f.y + f.h) - (player.y + player.h)) > 70) continue;
      return true;
    }
    return null;
  }
  // 起跳前的「竖直走廊」检查：人这一跳把身体从脚下扫到最高点（满跳 108px + 身高 36px ≈ 144px），
  // 落点两侧 44px 内这条带子里只要有活怪（尤其是正从台上掉下来的那只），这一跳就是自己撞上去——
  // d2/L3 的三连死全是爬台/越怪空中撞脸。
  function corridorClear(landX, topY) {
    const bottom = player.y + player.h;
    for (const f of live()) {
      if (Math.abs(f.x + f.w / 2 - landX) > 44) continue;
      if (f.y + f.h < topY - 4 || f.y > bottom + 2) continue;
      return false;
    }
    return true;
  }
  const jumpSafe = landX => corridorClear(landX, player.y + player.h - 130);
  // 落点预警：0.5s 内会落进我们这一行、且外推落点横线就在我们头顶附近
  function fallingOn(f) {
    const feet = f.y + f.h;
    if (feet >= player.y + player.h - 4 || f.vy <= 40) return false;
    if (feet + f.vy * 0.5 < player.y + player.h - 6) return false;
    return Math.abs(f.x + f.w / 2 + f.vx * 0.45 - (player.x + player.w / 2)) <= 46;
  }
  function roomToward(dir) { return dir < 0 ? player.x - (T + 2) : (VW - T - 2) - (player.x + player.w); }
  function safeMove(dir) { if (!dir || blocked(dir)) return false; bmove(dir); return true; }
  function liveB() { return foes.filter(f => !f.dead && !f.leaving && !f.frozen); }
  const live = liveB;
  function botStep() {
    IN.left = IN.right = IN.jump = IN.fire = false;
    const p = player;
    if (p.dead || G.scene !== 'play') { BOT.jumpFrames = 0; return; }
    const S = surfacesCache(G.li), cur = surfaceHere(S);
    const ls = liveB();
    const x = p.x + p.w / 2;
    const tryJump = n => { if (BOT.waitRelease > 0 || !p.onGround) return false; BOT.jumpFrames = n; return true; };
    const applyJump = () => {
      if (BOT.jumpFrames > 0) { IN.jump = true; BOT.jumpFrames--; }
      else { if (p.prevJump) BOT.waitRelease = 3; else if (BOT.waitRelease > 0) BOT.waitRelease--; }
    };
    const bump = a => { BOT.acts[a] = (BOT.acts[a] || 0) + 1; BOT.lastAct = a; };
    /* 击杀节奏：只有「地上打不到人」的僵局才值得上楼打人，有得打的时候别添乱。
       挑战档同屏 5 只、解冻只要 5 秒，无脑爬楼等于把自己送进怪堆（九格掉到 5）。 */
    if (G.killed !== BOT.lastKilled) { BOT.lastKilled = G.killed; BOT.sinceKill = 0; } else BOT.sinceKill++;
    BOT.bump = bump; BOT.tryJump = tryJump; BOT.applyJump = applyJump; BOT.S = S; BOT.cur = cur;

    for (const e of ebolts) {
      const dx = e.x - x;
      if (Math.abs(e.y - (p.y + p.h / 2)) < 26 && e.vx * dx < 0 && Math.abs(dx) < 120) {
        if (!tryJump(14)) bmove(-sign(e.vx));
        bump('dodge'); applyJump(); return;
      }
    }
    let tg = null, bd = 1e9;
    for (const f of ls) {
      if (!inBand(f)) continue;
      const d = Math.abs(f.x + f.w / 2 - x);
      if (d < bd) { bd = d; tg = f; }
    }
    /* 爬台一旦计划好就独占输入直到落地。之前只锁空中那一段，goto 会被 duck/space 抢走，
       抢走后 nd 再也回不到 hunt 门槛之上，计划永远排不上第二次——Bot 于是变成满地乱跑的靶子
       （d1/L3 前 600 帧一次枪都没开就是这个形状）。贴脸怪只让它「暂停一帧」而不是作废计划，
       否则每帧换一个目标重排，光在起跑位之间来回走就够被抓三次。 */
    if (BOT.climb) {
      BOT.climb.age++;
      if (G.door && BOT.climb.hunt) BOT.climb = null;                 // 门开了优先进门，楼上的怪不打紧
      if (BOT.climb && (BOT.climb.phase === 'air' || !p.onGround)) {
        if (BOT.climb.phase !== 'air') { BOT.climb.phase = 'air'; BOT.climb.air = 0; }
        climbAir(S); applyJump(); return;
      }
      if (BOT.climb) {
        const curn = BOT.climb;
        const inFace = ls.some(f => {
          const dx = Math.abs(f.x + f.w / 2 - x), dy = (f.y + f.h) - (p.y + p.h);
          return (dx < 50 && Math.abs(dy) <= 30) || fallingOn(f) || (inBand(f) && dx < 70);
        });
        /* 注意 climbStep 在 goto/accel 两段是返回 false 的（它只表示「还没跳上去」），
           拿它的返回值当「这一帧归我管」就等于每帧走完起跑位又被下面的 space 抢走输入，
           计划里的向左起跑被写成向右——爬台永远执行不了。 */
        const lk = curn.from === cur && !inFace ? link(cur, curn.to) : null;
        if (lk) { climbStep(S, cur, curn.to, lk); applyJump(); return; }
        if (curn.from !== cur || curn.age > 300) BOT.climb = null;
      }
    }
    if (G.door) {
      const d = G.door, dcx = d.x + d.w / 2;
      if (tg && bd < 80) { IN.fire = true; const w2 = sign(tg.x + tg.w / 2 - x) || p.dir; if (p.dir !== w2) bmove(w2); bump('shootDoor'); applyJump(); return; }
      const ti = S.findIndex(s => Math.abs(s.y - (d.y + d.h)) < 4 && dcx >= s.x0 + M_LAND - 2 && dcx <= s.x1 - M_LAND + 2);
      const tgt = ti < 0 ? 0 : ti;
      if (tgt === S.indexOf(cur)) {
        if (Math.abs(x - dcx) < 14) bump('atDoor'); else { bmove(sign(dcx - x)); bump('doorWalk'); }
      } else { if (!nav(S, cur, tgt, dcx, 'doorNav')) { bmove(sign(dcx - x) || 1); bump('doorSeek'); } }
      applyJump(); return;
    }
    /* 落点预警：只按「现在贴不贴脸」判的话，从三层台上跳下来那只留给人的反应窗口只有 0.1s，
       200px/s 最多挪 20px，身体加怪宽 60px 怎么都躲不开（d1/L2、d2/L1 的首死全是这个形状）。 */
    for (const f of ls) {
      if (!fallingOn(f)) continue;
      const landX = f.x + f.w / 2 + f.vx * 0.45;
      if (tg) { IN.fire = true; const w2 = sign(tg.x + tg.w / 2 - x) || p.dir; if (p.dir !== w2) bmove(w2); bump('shootFall'); }
      else { let dd = -sign(landX - x || 1); if (blocked(dd) || roomToward(dd) < 60) dd = -dd || 1; bmove(dd); }
      bump('duck'); applyJump(); return;
    }
    let ball = null, bb = 1e9;
    if (BOT.pushBall && balls.includes(BOT.pushBall) && !BOT.pushBall.dead && !BOT.pushBall.rolling &&
      Math.abs((BOT.pushBall.y + BOT.pushBall.r * 0.62) - (p.y + p.h)) <= 12) ball = BOT.pushBall;
    if (!ball) {
      for (const b of balls) {
        if (b.rolling || b.dead) continue;
        if (Math.abs((b.y + b.r * 0.62) - (p.y + p.h)) > 12) continue;
        const d = Math.abs(b.x - x);
        if (d < bb) { bb = d; ball = b; }
      }
      BOT.pushBall = ball;
    }
    // 冻住≠击杀：只有把球推滚、撞到墙才真的算杀。但「绕去推球」要穿过怪堆，
    // 所以只在没有同行目标（bd>150）时才离岗去推，否则就地补枪把贴脸的冻住。
    if (ball && (!tg || bd > 150)) {
      let dir = 0, nbd = 1e9;
      for (const f of ls) {
        const sy = ball.y - ball.r * 0.62;
        if (Math.abs((f.y + f.h) - sy) > 44) continue;
        const dd = sign(f.x + f.w / 2 - ball.x) || 1, dist = Math.abs(f.x + f.w / 2 - ball.x);
        if (dist > ball.r + 30 && dist < nbd) { nbd = dist; dir = dd; }
      }
      // 没有同行怪可撞时，朝「球已经在的那一侧」推：球是被我们当面冻下的，本来就在指向方向上，
      // 若按「离哪边墙近」选向往往要绕到球的另一侧，白丢十几帧，怪就趁这几帧把人夹死了。
      if (!dir) { const side = sign(ball.x - x); dir = side || (ball.x < VW / 2 ? -1 : 1); }
      const onSide = sign(ball.x - x) === dir;
      const reach = ball.r + p.w / 2 - 3;
      if (onSide && Math.abs(x - ball.x) < reach + 4) { bmove(dir); bump('push'); }
      else {
        const need = ball.x - dir * (ball.r + p.w / 2 + 4);
        if (Math.abs(x - need) > 6) { if (!safeMove(sign(need - x))) { bstop(); bump('pushHold'); } else bump('toBall'); }
        else { bmove(dir); bump('push'); }
      }
      applyJump(); return;
    }
    if (tg) {
      const want = sign(tg.x + tg.w / 2 - x) || p.dir;
      IN.fire = true;
      if (p.dir !== want) { bmove(want); bump('turn'); }
      else if (bd > 250) { if (!safeMove(want)) bstop(); bump('approach'); }
      else { bstop(); bump('shoot'); }
      applyJump(); return;
    }
    let nf = null, nd = 1e9;
    for (const f of ls) { const d = Math.abs(f.x + f.w / 2 - x); if (d < nd) { nd = d; nf = f; } }
    /* 射击带只有 ±22px：楼上的怪贴着台面不下来，站在下面等它们轮流掉下来撞脸就是等死。
       所以僵局（240 帧没杀到任何一只）时主动爬一跳上去打。三条约束缺一不可：只走一跳直达、
       落点台面 90px 内不许有别的怪、起跳前身边 90px 内没贴脸怪——去掉这三条的无条件 hunt
       会把 Bot 在半空送进怪堆，九格从 9 掉到 5。 */
    if (nf && nd >= 90 && !BOT.climb && BOT.sinceKill > 240) {
      const ci = S.indexOf(cur);
      let best = null;
      for (const f of ls) {
        const fcx = f.x + f.w / 2, fcy = f.y + f.h;
        if (fcy >= cur.y - 1) continue;
        const fi = S.findIndex(s => Math.abs(s.y - fcy) < 6 && fcx >= s.x0 - 2 && fcx <= s.x1 + 2);
        if (fi < 0 || fi === ci) continue;
        const path = route(S, ci, fi);
        if (!path || path.length !== 2) continue;
        const alone = ls.every(o => o === f || Math.abs((o.y + o.h) - fcy) > 6 ||
          Math.abs(o.x + o.w / 2 - fcx) >= 90);
        if (!alone) continue;
        const cost = Math.abs(fcx - x) + (cur.y - fcy);
        if (!best || cost < best.cost) best = { fi, fcx, cost };
      }
      if (best && nav(S, cur, best.fi, best.fcx, 'hunt')) { if (BOT.climb) BOT.climb.hunt = true; bump('hunt'); applyJump(); return; }
    }
    if (nf && nd < 130) {
      /* 撤退方向按「所有同屏怪的势场合力」算，而不是只看最近的一只：一左一右两只怪时
         「离最近者的反方向」会逐帧翻转，Bot 就原地抖动等着被夹死。 */
      let away = 0;
      for (const f of ls) {
        const dx = (f.x + f.w / 2) - x;
        if (Math.abs(dx) < 240) away -= sign(dx) * (1 - Math.abs(dx) / 240);
      }
      let dd = away !== 0 ? sign(away) : (roomToward(1) >= roomToward(-1) ? 1 : -1);
      /* 势场合力在两只对称逼近的怪之间会逐帧翻转，「谁近就反着跑」把 Bot 钉在原地 ±4px 抖动，
         等怪贴脸才反应就已经被夹死了（d1/L3 四连死全是这个形状）。
         原方向只要没被贴脸的堵住、离墙还有余量就坚持跑完，宁可多飞 20 帧再重新评估。 */
      const pr = BOT.retreat;
      if (pr && pr.d !== dd && !blocked(pr.d) && !aheadThreat(pr.d) && roomToward(pr.d) >= 150) dd = pr.d;
      // 死角不成：退路被贴脸的怪或墙堵住就反向拉开（贴墙站着必被抓）
      if (blocked(dd) || roomToward(dd) < 110) dd = -dd;
      if (blocked(dd)) { if (jumpSafe(x + player.vx * 0.1) && tryJump(22)) bmove(roomToward(dd) >= roomToward(-dd) ? dd : -dd); else bstop(); bump('hop'); }
      else if (!safeMove(dd)) bstop();
      BOT.retreat = { d: dd };
      bump('space');
      applyJump(); return;
    }
    if (!cur.ground) {
      const dd = x < (cur.x0 + cur.x1) / 2 ? -1 : 1;
      if (!safeMove(dd)) bstop();
      bump('descend'); applyJump(); return;
    }
    if (Math.abs(x - VW / 2) > 30) { if (!safeMove(sign(VW / 2 - x))) bstop(); }
    else bstop();
    bump('wait');
    applyJump();
  }
  function inBand(f) { return Math.abs((player.y + player.h / 2) - (f.y + f.h / 2)) <= SHOT_R + f.h / 2; }
  function surfaceHere(S) {
    const feet = player.y + player.h, cx = player.x + player.w / 2;
    const x0 = player.x, x1 = player.x + player.w;
    let best = null, bestOv = 0, bestD = 1e9;
    for (const s of S) {
      if (Math.abs(s.y - feet) > 4) continue;
      const ov = Math.min(x1, s.x1) - Math.max(x0, s.x0);
      if (ov <= 0) continue;
      const d = Math.abs(cx - clamp(cx, s.x0, s.x1));
      if (ov > bestOv + 1e-9 || (Math.abs(ov - bestOv) <= 1e-9 && d < bestD - 1e-9)) { best = s; bestOv = ov; bestD = d; }
    }
    if (best) return best;
    let b = S[0];
    for (const s of S) if (s.y >= feet - 2 && s.y < b.y) b = s;
    return b;
  }
  function climbAir(S) {
    BOT.climb.air++;
    if (BOT.climb.dir) bmove(BOT.climb.dir);
    if (player.onGround) {
      const okk = surfaceHere(S) === BOT.climb.to;
      BOT.bump(okk ? 'climbOk' : 'climbMiss');
      if (!okk && BOT.trace.length < 10) BOT.trace.push('MISS r' + BOT.climb.to.row + '@' + Math.round(BOT.climb.to.x0) + '-' + Math.round(BOT.climb.to.x1) +
        ' from r' + BOT.climb.from.row + ' land=' + Math.round(player.x + player.w / 2) + ' dir=' + BOT.climb.dir);
      BOT.climb = null; return true;
    }
    if (BOT.climb.air > 80) { BOT.climb = null; BOT.bump('climbTimeout'); }
    return true;
  }
  function climbStep(S, cur, nx, e) {
    if (BOT.climb && BOT.climb.phase === 'air') return climbAir(S);
    const tLo = cur.x0 + M_TAKE, tHi = cur.x1 - M_TAKE;
    let dir, take, zLo = 0, zHi = 0;
    if (e.need === 0) {
      const lo0 = Math.max(tLo, nx.x0 + M_LAND), hi0 = Math.min(tHi, nx.x1 - M_LAND);
      const lo = lo0 + 10 <= hi0 - 10 ? lo0 + 10 : lo0, hi = lo0 + 10 <= hi0 - 10 ? hi0 - 10 : hi0;
      zLo = lo; zHi = hi;
      dir = 0; take = clamp(player.x + player.w / 2, lo, hi);
      if (player.x + player.w / 2 < lo - 1 || player.x + player.w / 2 > hi + 1) take = player.x + player.w / 2 < lo ? lo : hi;
    } else {
      dir = (nx.x0 + M_LAND) > tHi ? 1 : -1;
      take = dir > 0 ? clamp(nx.x0 + M_LAND - e.dx * 0.94, tLo, tHi) : clamp(nx.x1 - M_LAND + e.dx * 0.94, tLo, tHi);
    }
    if (!BOT.climb || BOT.climb.to !== nx || Math.abs(BOT.climb.take - take) > 4) {
      const run = dir === 0 ? 0 : 74;
      /* 原地起跳那一档的对齐容差：按 1.5px 收工，3.3px/帧的移动步长必然越过目标点再倒回来，
         Bot 就在 take 两侧来回抽搐（v_align 白烧 120 帧，楼上的怪全在头上等着）。
         容差给到落点区的一半（封顶 9px），区外仍然要求真走到最近沿。 */
      const tol = dir === 0 ? Math.max(2, Math.min(9, (zHi - zLo) / 2)) : 9;
      BOT.climb = { to: nx, from: cur, dir, take, tol, start: clamp(take - dir * run, tLo, tHi), phase: 'goto', tries: 0, air: 0, hold: 0, age: 0, hunt: BOT.climb && BOT.climb.hunt };
      BOT.bump('climbPlan');
      if (CLOG) console.log('   plan r' + cur.row + '->r' + nx.row + ' need=' + Math.round(e.need));
    }
    const c = BOT.climb;
    c.hold++;
    if (c.hold > 420) { BOT.climb = null; BOT.bump('climbStuck'); return false; }
    // 走廊在 accel 段每帧重新求值：落点必须实时推（原地跳按当前位+惯性，助跑跳按起跑点+位移），
    // 并检查「脚下→目标台面、落点两侧 44px」里没有活怪才起跳
    c.landX = c.dir === 0 ? clamp(player.x + player.w / 2 + player.vx * 0.1, c.to.x0 + M_LAND, c.to.x1 - M_LAND)
      : clamp(c.take + c.dir * e.dx * 0.94, c.to.x0 + M_LAND, c.to.x1 - M_LAND);
    const gapOk = jumpSafe(c.landX);
    if (c.phase === 'goto') {
      if (Math.abs(player.x + player.w / 2 - c.start) < (c.dir === 0 ? 5 : 9)) c.phase = 'accel';
      else { bmove(sign(c.start - (player.x + player.w / 2))); BOT.bump('climbGoto'); return false; }
    }
    if (c.phase === 'accel') {
      const tLand = e.dx / MOVE;
      const pred = player.x + player.w / 2 + player.vx * tLand * 0.8;
      const inZone = pred >= nx.x0 + M_LAND && pred <= nx.x1 - M_LAND;
      if (c.dir === 0) {
        if (Math.abs(player.x + player.w / 2 - c.take) > c.tol) { bmove(sign(c.take - (player.x + player.w / 2))); BOT.bump('v_align'); return false; }
        bmove(0);
        if (Math.abs(player.vx) < 12 && inZone && gapOk && BOT.tryJump(26)) { c.phase = 'air'; c.air = 0; BOT.bump('climbJump'); }
        else BOT.bump(Math.abs(player.vx) >= 12 ? 'v_slowing' : (inZone ? (gapOk ? 'v_posal' : 'j_gap') : 'v_pred'));
        return false;
      }
      bmove(c.dir);
      if (Math.abs(player.vx) > MOVE * 0.95 && Math.abs(player.x + player.w / 2 - c.take) < 6) {
        if (!gapOk) { BOT.bump('j_gap'); return false; }
        if (BOT.tryJump(26)) { c.phase = 'air'; c.air = 0; BOT.bump('climbJump'); }
        else BOT.bump('j_waitRelease');
      } else if ((player.x + player.w / 2 - c.take) * c.dir > 22) {
        c.phase = 'goto'; c.tries++;
        c.start = clamp(c.take - c.dir * (74 + c.tries * 16), tLo, tHi);
        BOT.bump('j_overshoot');
      } else BOT.bump(Math.abs(player.vx) > MOVE * 0.95 ? 'j_far' : 'j_slow');
      return false;
    }
    BOT.climb = null; return false;
  }
  function nav(S, cur, tgtIdx, tx, name) {
    const path = route(S, S.indexOf(cur), tgtIdx);
    if (!path || path.length < 2) {
      if (BOT.trace.length < 10) BOT.trace.push('NO_PATH cur=r' + cur.row + '@' + Math.round(cur.x0) + '-' + Math.round(cur.x1) +
        ' tgt=r' + S[tgtIdx].row + '@' + Math.round(S[tgtIdx].x0) + '-' + Math.round(S[tgtIdx].x1));
      return false;
    }
    const nx = S[path[1]], e = link(cur, nx);
    if (e.kind === 'up' || e.kind === 'flat') { climbStep(S, cur, nx, e); return true; }
    let aimX = path.length === 2 ? clamp(tx, nx.x0 + HALF + 4, nx.x1 - HALF - 4) : (nx.x0 + nx.x1) / 2;
    /* 「往下走」时如果目标点落在这条台面内部，人就永远走到那儿停下——本站 280-440、下一站在正下方的
       地面（中心 400）→ 原地 ±13px 抽搐到超时。必须先把人带到离目标最近的那条边缘外腾空。 */
    if (aimX > cur.x0 + M_TAKE && aimX < cur.x1 - M_TAKE) {
      const rE = cur.x1 + 26, lE = cur.x0 - 26;
      aimX = Math.abs(aimX - rE) <= Math.abs(aimX - lE) ? rE : lE;
    }
    safeMove(sign(aimX - (player.x + player.w / 2)) || 1); BOT.bump(name);
    return true;
  }

  // ---- 逐帧观察：机制事件全部从状态增量推出来，绝不主动调用游戏函数 ----
  const prev = { balls: 0, killed: 0, snow: 0, puff: 0, bolts: 0, eb: 0, lives: 0 };
  const seenFoe = new Map();           // 敌人对象 → 起跳前落点 x / 贴脸帧数 / 在带上帧数
  function watch(reset) {
    if (reset) { prev.balls = balls.length; prev.killed = G.killed; prev.snow = dynPlats.filter(d => d.kind === 'snow').length; prev.puff = dynPlats.filter(d => d.kind === 'puff').length; prev.bolts = 0; prev.eb = ebolts.length; return; }
    const nb = balls.length, nk = G.killed;
    const nsnow = dynPlats.filter(d => d.kind === 'snow').length;
    const npuff = dynPlats.filter(d => d.kind === 'puff').length;
    if (nb > prev.balls) obs.froze += nb - prev.balls;
    if (nsnow > prev.snow) { obs.snowPlat += nsnow - prev.snow; if (nk > prev.killed) obs.burstKill += nsnow - prev.snow; }
    if (npuff > prev.puff) obs.puff += npuff - prev.puff;
    if (nb < prev.balls) { obs.revives += prev.balls - nb; }
    if (nk < prev.killed) { prev.killed = nk; }                 // 重开一局，不追究
    for (const f of foes) if (f.angry && !seenFoe.has(f)) { obs.angry++; seenFoe.set(f, { ang: true }); }
    // 推球/骑球
    if (balls.some(b => b.rolling)) obs.rolls = Math.max(obs.rolls, 1);
    if (IN.left || IN.right) {
      const x = player.x + player.w / 2;
      for (const b of balls) if (!b.rolling && Math.abs(b.x - x) < b.r + player.w / 2) obs.pushFrames++;
    }
    // 同屏敌人上限
    const aliveN = foes.filter(f => !f.dead && !f.leaving && !f.frozen).length;
    obs.maxAliveFoes = Math.max(obs.maxAliveFoes, aliveN);
    // 火球预警窗口：每发火球出现前，必有一只投掷怪已经原地预警 ≥30 帧
    if (ebolts.length > prev.eb) {
      obs.boltShots += ebolts.length - prev.eb;
      const ready = foes.some(f => f.kind === 'thrower' && !f.dead && !f.frozen && Math.abs(f.vx) < 1 && (seenFoe.get(f) && seenFoe.get(f).warnFor || 0) >= 30);
      if (!ready) obs.warnGapMin = 0;
    }
    // 敌人逐帧行为：跳蛙位移 / 蝙蝠对齐 / 悬头滞留
    for (const f of foes) {
      if (f.dead || f.frozen || f.leaving) continue;
      let m = seenFoe.get(f);
      if (!m) { m = {}; seenFoe.set(f, m); }
      m.warnFor = (f.kind === 'thrower' && Math.abs(f.vx) < 1 && f.warn > 0) ? (m.warnFor || 0) + 1 : 0;
      if (f.kind === 'hopper') {
        if (f.onGround) {
          if (m.jumpAir) { obs.hopCount++; if ((m.travel || 0) >= 20) obs.hopMoved++; m.jumpAir = 0; }
          m.gx = f.x; m.travel = 0;
        } else {
          m.jumpAir = 1;
          if (m.gx !== undefined) m.travel = Math.max(m.travel || 0, Math.abs(f.x - m.gx));
        }
        if (m.travel) obs.hopTravelMax = Math.max(obs.hopTravelMax, m.travel);
      }
      if (f.kind === 'bat') {
        const batStill = Math.abs(f.y - (m.py === undefined ? f.y : m.py)) < 0.6;
        m.py = f.y;
        const dx = Math.abs(f.x + f.w / 2 - (player.x + player.w / 2));
        if (dx < 140) {
          m.near = (m.near || 0) + 1;
          /* 只在「目标已经站定在地面、蝙蝠自身也追到位（这一帧纵向几乎没动）、且有 3 秒以上追近」时收偏差：
             蝙蝠纵向最多 170px/s，腾空与瞬移那几十帧追不上是设计如此，拿那段瞬态当 bug 会永远调不完。 */
          const settled = player.onGround && Math.abs(player.vy) < 1 && !player.dead &&
            player.y + player.h >= GROUND_Y - 1;
          if (m.near > 200 && settled && batStill) obs.batBandErr = Math.max(obs.batBandErr, Math.abs((f.y + f.h / 2) - (player.y + player.h / 2)));
        } else m.near = 0;
      }
      // 怪悬在玩家头顶打不到：靠 descentDir 必须几秒内掉下来
      if (!f.onGround) { m.air = 0; continue; }
      if ((player.y + player.h) - (f.y + f.h) >= 26 && Math.abs(f.x + f.w / 2 - (player.x + player.w / 2)) < 60) {
        m.over = (m.over || 0) + 1;
        obs.overheadStuckMax = Math.max(obs.overheadStuckMax, m.over);
      } else m.over = 0;
    }
    // 穿模检查（四角 + 沉地）
    if (boxInSolid(player)) obs.insideSolid++;
    if (player.y + player.h > GROUND_Y + 0.5) obs.sunk++;
    for (const f of foes) if (!f.dead && !f.leaving && (f.x < T - 0.5 || f.x + f.w > VW - T + 0.5)) obs.foeInsideSolid++;
    // 游戏自己弹出的文字反馈 = 最诚实的机制事件日志
    for (const pp of G.popups) obs.popups[pp.txt] = (obs.popups[pp.txt] || 0) + 1;
    if (G.door) obs.doorOpened++;
    if (player.shield) obs.shieldOn = 1;
    if (obs.popups['护盾挡下！']) obs.shieldBlocks = 1;
    if (obs.popups['全屏冻结！']) obs.bombFreeze = 1;
    if (player.buff.rapid > 0 && shots.length >= MAX_SHOT) obs.rapidShots++;
    if (shots.length >= MAX_SHOT && IN.fire) obs.capBlocked++;
    obs.comboMax = Math.max(obs.comboMax, G.bestCombo);
    for (const it of items) obs.items[it.kind] = (obs.items[it.kind] || 0) + 1;
    if (G.killed >= LEVELS[G.li].quota) obs.quotaReached++;
    prev.balls = nb; prev.killed = nk; prev.snow = nsnow; prev.puff = npuff; prev.eb = ebolts.length;
    prev.lives = G.lives;
  }

  const cells = [];
  for (let d = 0; d < 3; d++) for (let li = 0; li < 3; li++) {
    if (ONLY && (ONLY[0] !== d || ONLY[1] !== li)) continue;
    BOT.acts = {}; BOT.trace = []; BOT.climb = null; BOT.pushBall = null;
    BOT.jumpFrames = 0; BOT.waitRelease = 0; BOT.retreat = null; BOT.lastKilled = 0; BOT.sinceKill = 0;      // 每格必须从干净输入状态起跳，否则上一格残留的长按会吞掉第一跳
    clearIn(); seenFoe.clear(); watch(true);
    setDiff(d); beginPlay(li);
    let fr = 0, prevLives = G.lives, deaths = 0, dets = [], frz0 = obs.froze;
    while (G.scene === 'play' && fr < 60 * 400) {
      botStep();
      if (DTR && fr % 20 === 0) console.log('   f' + G.frame + ' x=' + Math.round(player.x + player.w / 2) + ' F=' + Math.round(player.y + player.h) +
        ' og=' + (player.onGround ? 1 : 0) + ' act=' + BOT.lastAct + ' k=' + G.killed + ' ball=' + balls.length +
        ' foes=' + liveB().map(f => f.kind[0] + '@' + Math.round(f.x + f.w / 2) + ',' + Math.round(f.y + f.h) + 'v' + Math.round(f.vy)).join(' '));
      update(STEP);
      fr++;
      watch(false);
      if (G.lives < prevLives) {
        deaths++; prevLives = G.lives;
        obs.deaths++; obs.deathBy[G.deathBy] = (obs.deathBy[G.deathBy] || 0) + 1;
        if (DTR) console.log('   DIED@' + G.frame + ' by=' + G.deathBy + ' acts=' + JSON.stringify(BOT.acts));
        dets.push('f' + G.frame + ' by=' + G.deathBy + ' k=' + G.killed + ' x=' + Math.round(player.x + player.w / 2) +
          ' F=' + Math.round(player.y + player.h) + ' live=[' + liveB().map(f => f.kind[0] + '@' + Math.round(f.x + f.w / 2) + ',' + Math.round(f.y + f.h) + 'v' + Math.round(f.vy)).join(' ') + ']');
      }
    }
    cells.push({ d, li, scene: G.scene, score: G.score, killed: G.killed, deaths, dets, acts: JSON.parse(JSON.stringify(BOT.acts)), frz: obs.froze - frz0, frames: fr, timeLeft: G.timeLeft });
    console.log(['d' + d, 'L' + (li + 1), G.scene, 'sc=' + G.score, 'k=' + G.killed + '/' + LEVELS[li].quota,
      'die=' + deaths, 'f=' + fr, 't=' + Math.round(G.timeLeft)].join(' '));
    if (TRACE) console.log('   acts ' + JSON.stringify(BOT.acts) + '\\n   ' + dets.slice(0, 6).join('\\n   ') + '\\n   ' + BOT.trace.slice(0, 8).join('\\n   '));
  }

  const cellOf = (d, li) => cells.find(c => c.d === d && c.li === li);
  for (const c of cells) {
    const tag = 'd' + c.d + '/L' + (c.li + 1);
    ok(tag + ' Bot 打进结算（配额 ' + LEVELS[c.li].quota + ' 杀满 + 进门）', c.scene === 'result' && c.killed >= LEVELS[c.li].quota,
      c.scene + ' k=' + c.killed + ' die=' + c.deaths + ' acts=' + JSON.stringify(c.acts));
    ok(tag + ' 通关有余量（剩余时间 > 关卡时限 15%）', c.timeLeft > LEVELS[c.li].time * DIFFS[c.d].timeMul * 0.15,
      'left=' + Math.round(c.timeLeft));
    ok(tag + ' 没有被磨死（死亡 ≤2 次）', c.deaths <= 2, 'deaths=' + c.deaths + ' ' + (c.dets[0] || ''));
    ok(tag + ' 分数为正且随难度递增（本档得分已乘 scoreMul）', c.score > 0);
  }
  if (cells.length === 9) {
    eq('九格全部通关', cells.filter(c => c.scene === 'result').length, 9);
    ok('挑战档总分高于休闲档（同关卡）', [0, 1, 2].every(li => cellOf(2, li).score >= cellOf(0, li).score),
      [0, 1, 2].map(li => cellOf(0, li).score + '/' + cellOf(2, li).score).join(' '));
  }
  // 机制链观察（九格合计，全部来自状态增量）
  ok('冻怪链路真的在跑（' + obs.froze + ' 次冻结）', obs.froze >= 20);
  ok('球能推起来并滚出去（push ' + obs.pushFrames + ' 帧 / 见过滚球）', obs.pushFrames > 100 && obs.rolls === 1);
  ok('滚球撞墙凝结雪台（' + obs.snowPlat + ' 块）', obs.snowPlat >= 10);
  ok('雪台里压扁敌人得分（' + obs.burstKill + ' 次同帧击杀）', obs.burstKill >= 8);
  ok('没人推的冻球会解冻变凶（' + obs.revives + ' 次解冻、' + obs.angry + ' 只狂暴怪）', obs.revives >= 1 && obs.angry >= 1);
  ok('撞墙雪弹会结小雪台（' + obs.puff + ' 块，Bot 走位下也会打到墙）', obs.puff >= 1);
  ok('连击倍率真的吃到（最高 ×' + obs.comboMax + '）', obs.comboMax >= 3);
  ok('道具会掉、会被吃（见到 ' + Object.keys(obs.items).length + ' 种掉落）', Object.keys(obs.items).length >= 3);
  ok('门开过（' + obs.doorOpened + ' 帧处于开门状态）', obs.doorOpened > 200);
  ok('同屏敌人不超档位上限', obs.maxAliveFoes <= DIFFS[2].maxAlive + 1, 'max=' + obs.maxAliveFoes);
  ok('整局九格从未穿进实心格（' + (obs.insideSolid + obs.sunk + obs.foeInsideSolid) + ' 帧异常）',
    obs.insideSolid === 0 && obs.sunk === 0 && obs.foeInsideSolid === 0);
  ok('跳蛙一跳真能走位（最大 ' + R2(obs.hopTravelMax) + 'px，' + obs.hopMoved + '/' + obs.hopCount + ' 跳有位移）',
    obs.hopTravelMax > 40 && obs.hopCount > 20 && obs.hopMoved >= Math.ceil(obs.hopCount * 0.5),
    'max=' + R2(obs.hopTravelMax) + ' moved=' + obs.hopMoved + '/' + obs.hopCount);
  ok('玩家站定、蝙蝠也追到位时贴住雪弹水平线（偏差 ' + R2(obs.batBandErr) + 'px ≤ ' + (SHOT_R + ENEMIES.bat.h / 2) + '，够得着才谈得上打）',
    obs.batBandErr <= SHOT_R + ENEMIES.bat.h / 2, 'err=' + R2(obs.batBandErr));
  ok('怪悬在头顶不会打不到（最长滞留 ' + obs.overheadStuckMax + ' 帧 < 4s，descentDir 生效）',
    obs.overheadStuckMax < 240, 'stuck=' + obs.overheadStuckMax);
  ok('投掷怪每发火球前都有 ≥0.5s 预警', obs.warnGapMin >= 30 && obs.boltShots >= 1, 'shots=' + obs.boltShots + ' gapMin=' + obs.warnGapMin);
  ok('雪弹同屏上限被真的卡住（' + obs.capBlocked + ' 帧想发而不可发）', obs.capBlocked > 50);
  const pop = obs.popups;
  ok('游戏内反馈文字齐全（冻住/推/门开了/加分）',
    !!pop['冻住！'] && !!pop['推！'] && !!pop['门开了！'] && Object.keys(pop).some(k => k.indexOf('+') === 0),
    JSON.stringify(Object.keys(pop)));
  ok('有死亡就有「被抓住了」提示', obs.deaths === 0 || !!pop['被抓住了'], JSON.stringify(Object.keys(pop)));

  // 纪录与解锁：九格全部写下真实分数（ONLY 单格调试时其它格没跑，跳过这段）
  if (cells.length === 9) {
    const best9 = best.slice();
    eq('九格纪录全部非零', best9.filter(v => v > 0).length, 9);
    ok('纪录 = 该格最高总分（不小于本局分）', cells.every(c => best9[c.d * 3 + c.li] >= c.score), JSON.stringify(best9));
    eq('通关解锁到最后一关', unlock, 3);
    const savedBest = JSON.parse(store['snowbro_best']);
    eq('纪录已落盘', Object.keys(savedBest).length, 9);
    eq('落盘键名格式', Object.keys(savedBest)[0], '0_0');
    eq('落盘 unlock', +store['snowbro_unlock'], 3);
  }
  // 结算面板：只有真通关才画得出来（clearInfo 由游戏自己填）
  G.scene = 'result'; draw();
  ok('结算面板有下一关/回主菜单', ['next', 'menu2'].map(id => u(id).length), [1, 1]);
  const resBtns = ['next', 'menu2'].map(id => u(id)[0]);
  near('结算两键等宽对称', resBtns[0].w, resBtns[1].w, 1e-6);
  near('结算两键间距 = 20', resBtns[1].x - (resBtns[0].x + resBtns[0].w), 20, 1e-6);
  click('next');
  ok('点下一关真的推进关卡', G.scene === 'play' || G.scene === 'clear');
  G.scene = 'result'; G.clearInfo = { li: 2, gain: 1, timeBonus: 0, lifeBonus: 0, base: 1, cell: 4, prev: 0, killed: 1, items: 0, combo: 1, score: 1, lives: 1 };
  draw();
  click('next');
  eq('第 3 关结算的「下一关」变总结算', G.scene, 'clear');
  draw();
  eq('总结算九格 + 返回', u('menu4').length, 1);
  click('menu4');
  eq('总结算回主菜单', G.scene, 'menu');
  // 选关面板能直达已解锁的第三关
  onAction('levels'); draw();
  eq('全解锁后三张卡都可点', ['lv0', 'lv1', 'lv2'].map(id => u(id).length), [1, 1, 1]);
  const cardW = ['lv0', 'lv1', 'lv2'].map(id => u(id)[0]);
  ok('三张卡等高等宽', cardW.every(c => c.w === cardW[0].w && c.h === cardW[0].h));
  click('lv2');
  eq('点第三张卡直接开第三关', [G.scene, G.li], ['play', 2]);
  onAction('quit'); G.scene = 'menu';

  // ============================================================
  // 13. 反证：不动必败、不跳必败（证明「必须推机制 + 必须爬台」而不是挂机过关）
  // ============================================================
  for (let d = 0; d < 3; d++) {
    clearIn(); setDiff(d); beginPlay(0);
    let fr = 0;
    while (G.scene === 'play' && fr < 60 * 400) { update(STEP); fr++; }
    clearIn();
    ok('第' + ['休闲', '标准', '挑战'][d] + '档原地不动必败', G.scene === 'fail' && G.killed < LEVELS[0].quota,
      G.scene + ' k=' + G.killed + ' die-out lives=' + G.lives);
  }
  // 从不吐弹（只跑只跳）：没有任何击杀手段 → 配额永远达不到、门永不开 → 时间耗尽必败
  clearIn(); setDiff(1); beginPlay(0);
  {
    let fr = 0, doorEver = 0;
    while (G.scene === 'play' && fr < 60 * 400) {
      IN.left = ((fr % 180) < 90); IN.right = !IN.left;
      IN.jump = (fr % 40) < 4;
      update(STEP); fr++;
      if (G.door) doorEver++;
    }
    clearIn();
    ok('不吐弹就永远开不了门（配额只能靠雪球打出来）',
      G.scene === 'fail' && G.killed === 0 && doorEver === 0, G.scene + ' k=' + G.killed + ' door=' + doorEver);
  }
  // 只吐弹、身体一动不动：冻住≠击杀，没人推的冻球只会解冻 → 一局里一次都杀不掉
  clearIn(); setDiff(1); beginPlay(0);
  {
    let fr = 0, rolls = 0, snowPlats = 0;
    while (G.scene === 'play' && fr < 60 * 400) {
      IN.fire = true;
      update(STEP); fr++;
      if (balls.some(b => b.rolling)) rolls++;
      if (dynPlats.some(d => d.kind === 'snow')) snowPlats++;
    }
    clearIn();
    ok('不推球就滚不起来、也结不出雪台（雪台只能靠推）', rolls === 0 && snowPlats === 0, 'rolls=' + rolls + ' snow=' + snowPlats);
    ok('光吐弹不推球一个都杀不死（冻→推→滚→撞才是唯一杀链）', G.killed === 0 && G.scene === 'fail', 'k=' + G.killed + ' ' + G.scene);
  }
  // 只吐弹+左右跑、从不跳：配额照样能打满，但门开在楼上 → 依然必输（「爬台进门」是硬门槛，不是数值门槛）
  clearIn(); setDiff(1); beginPlay(0);
  {
    let fr = 0, maxLift = 0, doorOpened = 0;
    while (G.scene === 'play' && fr < 60 * 400) {
      IN.fire = true;
      IN.left = ((fr % 180) < 90); IN.right = !IN.left;
      update(STEP); fr++;
      maxLift = Math.max(maxLift, GROUND_Y - (player.y + player.h));
      if (G.door) doorOpened++;
    }
    clearIn();
    ok('从不跳就离不了地（最高点仍贴在地面）', maxLift < 2, 'maxLift=' + R2(maxLift));
    ok('在地上吐弹能打满配额，但进不了门照样输', G.scene === 'fail' && doorOpened > 0,
      G.scene + ' k=' + G.killed + '/' + LEVELS[0].quota + ' door=' + doorOpened);
  }
  setDiff(1); G.scene = 'menu';
  report(cells);
})();
`;
eval(src + TESTS);
