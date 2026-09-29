// 无头回归测试：桩掉 DOM/Canvas，验证常量表、赛道几何审计（闭环/曲率/自交/道具盒/装饰越界）、
// 物理边界（加速/刹车/倒车/越野限速/墙内钳制/漂移三档小喷）、道具全家桶（权重/蘑菇/绿壳反弹/
// 红壳追踪/香蕉/星星/闪电）、倒计时锁定、冲线结算流、同输入确定性重放、面板点击流与 HUD 按钮、
// 纪录九格与解锁链，以及键盘输入驱动的 Bot 3 赛道 × 3 难度 9/9 夺冠与原地不动垫底。
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
  const near = (a, b, eps, msg) => { n++; if (Math.abs(a - b) > eps) throw new Error(msg + ': ' + a + ' vs ' + b + ' (eps ' + eps + ')'); };
  const clearIN = () => { IN.gas = IN.brake = IN.left = IN.right = IN.drift = IN.item = false; itemWasDown = false; };
  const setupRace = (diff, ti) => { G.diff = diff; clearIN(); startRace(ti); };
  const step = (frames, think) => { for (let i = 0; i < frames; i++) { if (think) think(G.player, i); update(STEP); } };
  const skipCountdown = () => { let g = 0; while (G.raceState === 'count' && g++ < 400) update(STEP); ok(G.raceState === 'racing', 'GO 后进入 racing'); };
  const placeKart = (k, i, lat, opts) => {
    const T = G.track;
    k.x = T.wp[i].x + T.nrm[i].x * (lat || 0);
    k.y = T.wp[i].y + T.nrm[i].y * (lat || 0);
    k.heading = T.ang[i];
    k.wp = i; k.nearHint = i;
    k.prog = k.lap * T.n + i;
    k.vx = k.vy = 0; k.speedF = 0; k.speedL = 0;
    k.driftOn = false; k.driftT = 0; k.spinT = 0; k.boostT = 0; k.starT = 0; k.shrinkT = 0; k.invulnT = 0;
    k.totalSpin = 0; k.bumpT = 0; k.stuckT = 0; k.snapFlash = 0;
    if (opts) for (const kk in opts) k[kk] = opts[kk];
  };
  const straightIdx = (T) => {
    let bi = 0, best = -1;
    for (let i = 0; i < T.n; i++) {
      let m = 1e9;
      for (let s = 0; s <= 44; s += 4) { const r = T.radius[(i + s) % T.n]; if (r < m) m = r; }
      if (m > best) { best = m; bi = i; }
    }
    return bi;
  };
  // 沿赛道循迹（仅经由 IN）：用于长距离加速测试避免冲出直线进入越野限速
  const follow = (k) => {
    const T = G.track;
    const ti = (k.wp + 6) % T.n;
    const diff = angNorm(Math.atan2(T.wp[ti].y - k.y, T.wp[ti].x - k.x) - k.heading);
    IN.left = diff < -0.03; IN.right = diff > 0.03;
    IN.gas = true;
  };
  // 恒定横向偏移循迹：保持在路肩外（越野）或墙边，用于越野/墙内测试
  const followLat = (k, lat) => {
    const T = G.track;
    const ti = (k.wp + 6) % T.n;
    const tx = T.wp[ti].x + T.nrm[ti].x * lat, ty = T.wp[ti].y + T.nrm[ti].y * lat;
    const diff = angNorm(Math.atan2(ty - k.y, tx - k.x) - k.heading);
    IN.left = diff < -0.04; IN.right = diff > 0.04;
    IN.gas = true;
  };
  const hashKarts = () => JSON.stringify({
    t: Math.round(G.raceTime * 1e6), st: G.raceState, fo: G.finishOrder.map(k => k.ch),
    k: G.karts.map(k => [k.x, k.y, k.heading, k.vx, k.vy, k.speedF, k.speedL, k.wp, k.lap, k.prog,
      k.spinT, k.boostT, k.starT, k.shrinkT, k.item, k.finished ? k.finishPlace : 0, k.totalSpin]
      .map(v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v).join(',')),
    s: G.shells.map(s => [Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, s.bounces].join(',')),
    b: G.bananas.map(b => [Math.round(b.x), Math.round(b.y), b.dead ? 1 : 0].join(',')),
    x: G.track.boxes.map(b => (b.alive ? 1 : 0) + Math.round(b.t * 100) / 100).join(','),
  });
  // Bot：只经由 IN 输入驾驶（ racing 状态每帧调用）
  const botThink = (k) => {
    const T = G.track;
    const look = 5 + Math.floor(Math.abs(k.speedF) / 50);
    const ti = (k.wp + look) % T.n;
    const diff = angNorm(Math.atan2(T.wp[ti].y - k.y, T.wp[ti].x - k.x) - k.heading);
    IN.left = diff < -0.04; IN.right = diff > 0.04;
    let minR = 1e9;
    for (let s = 1; s <= 26; s += 2) { const r = T.radius[(k.wp + s) % T.n]; if (r < minR) minR = r; }
    const target = Math.min(PW.VMAX, Math.sqrt(AI_LAT * Math.max(60, minR)) * 1.18);
    const over = k.speedF > target * 1.12;
    IN.brake = over && minR < 260;
    IN.gas = !IN.brake;
    IN.drift = !over && minR < 340 && k.speedF > 230 && Math.abs(diff) > 0.06;
    if (k.item && !IN.item) IN.item = true; else IN.item = false;
  };
  const raceWith = (diff, ti, think, cap) => {
    setupRace(diff, ti);
    let f = 0; const c = cap || 20000;
    const snaps = [];
    while (G.scene === 'race' && f < c) {
      if (G.raceState === 'racing' && think) think(G.player, f);
      update(STEP);
      f++;
      if (f % 1500 === 0) snaps.push(hashKarts());
    }
    return { frames: f, snaps };
  };

  init();

  // ============ 1. 常量与数据表 ============
  eq(LAPS, 3, '3 圈制');
  eq(N_RACERS, 6, '6 车');
  eq(STEP, 1 / 60, '固定步长 1/60');
  eq(DIFF_ORDER.length, 3, '三档难度');
  eq(Object.keys(DIFFS).length, 3, '难度表三项');
  ok(DIFFS.easy.aiMul < DIFFS.normal.aiMul && DIFFS.normal.aiMul < DIFFS.hard.aiMul, 'AI 速度随难度递增');
  ok(DIFFS.hard.aiMul < 1, 'AI 满速仍低于玩家基准（Bot 可凭漂移小喷取胜）');
  ok(DIFFS.easy.catchup > DIFFS.hard.catchup, '橡皮筋随难度减弱');
  ok(DIFFS.easy.scoreMul < DIFFS.hard.scoreMul, '得分倍率随难度递增');
  ok(DIFFS.easy.timeMul > DIFFS.hard.timeMul, '休闲时间奖励更宽松');
  eq(TRACKS.length, 3, '三条赛道');
  eq(TRACKS.map(t => t.name).join('/'), '菇菌环道/蜜糖峡谷/星夜高速', '赛道名');
  ok(new Set(TRACKS.map(t => t.theme)).size === 3, '三套主题互不重复');
  for (const t of TRACKS) { ok(t.halfW >= 55 && t.halfW <= 70, t.name + ' 半路宽合理'); ok(t.par >= 12, t.name + ' 基准圈时合理'); ok(t.cp.length >= 10, t.name + ' 控制点足够'); }
  ok(PW.VMAX < PW.BOOST_VMAX && PW.OFF_VMAX < PW.VMAX && PW.STAR_VMAX > PW.VMAX, '速度档位关系');
  ok(PW.DRIFT_T[0] < PW.DRIFT_T[1] && PW.DRIFT_T[1] < PW.DRIFT_T[2], '漂移档位时间递增');
  ok(PW.DRIFT_BOOST[0] < PW.DRIFT_BOOST[1] && PW.DRIFT_BOOST[1] < PW.DRIFT_BOOST[2], '小喷时长递增');
  ok(PW.DRIFT_MIN_SPD > PW.DRIFT_EXIT_SPD, '漂移进入速度高于退出速度（滞回）');
  ok(PW.GRIP > PW.GRIP_DRIFT * 3, '漂移抓地显著低于常规');
  ok(SHELL_SPD > PW.VMAX && RED_SPD > SHELL_SPD, '龟壳快于卡丁车，红壳快于绿壳');
  eq(ITEM_LIST.length, 6, '6 种道具');
  eq(PLACE_PTS.length, N_RACERS, '名次分表对齐 6 车');
  ok(PLACE_PTS.every((v, i) => i === 0 || v <= PLACE_PTS[i - 1]), '名次分递减');
  for (const r in ITEM_W) {
    let sum = 0; for (const k in ITEM_W[r]) sum += ITEM_W[r][k];
    ok(sum > 0, 'rank ' + r + ' 权重和为正');
  }
  eq(ITEM_W[1].star, 0, '领跑者拿不到星星');
  eq(ITEM_W[1].lightning, 0, '领跑者拿不到闪电');
  ok(ITEM_W[6].star > ITEM_W[1].star && ITEM_W[6].lightning > ITEM_W[1].lightning, '落后者强道具权重更高');
  eq(CHARS.length, N_RACERS, '角色数 = 车位数');
  ok(new Set(CHARS.map(c => c.id)).size === 6, '角色 id 唯一');
  eq(BEST_KEY + DIFF_KEY + UNLOCK_KEY, 'kart_best' + 'kart_diff' + 'kart_unlock', '持久化键名');
  ok(PW.SPIN_T > 0.8 && PW.SPIN_INVULN > 0.5, '打转与保护窗时长合理');
  near(PW.WALL_OFF, 34, 0.01, '墙在路肩外 34px');

  // rollItem 权重行为
  setSeed(987654);
  let star1 = 0, lt1 = 0;
  for (let i = 0; i < 300; i++) { const it = rollItem(1); ok(ITEM_LIST.indexOf(it) >= 0, 'rollItem 返回合法道具'); if (it === 'star') star1++; if (it === 'lightning') lt1++; }
  eq(star1 + lt1, 0, '第 1 名 300 抽零星星零闪电');
  setSeed(555);
  let star6 = 0, lt6 = 0, mush6 = 0;
  for (let i = 0; i < 500; i++) { const it = rollItem(6); if (it === 'star') star6++; if (it === 'lightning') lt6++; if (it === 'mushroom') mush6++; }
  ok(star6 > 0 && lt6 > 0 && mush6 > 0, '末位能抽到星星/闪电/蘑菇');
  // 同种子同序列
  setSeed(42); const seqA = [rng(), rng(), rng()];
  setSeed(42); const seqB = [rng(), rng(), rng()];
  eq(seqA.join(','), seqB.join(','), 'LCG 同种子同序列');

  // ============ 2. 赛道几何审计 ============
  for (let ti = 0; ti < TRACKS.length; ti++) {
    const T = getTrackGeom(ti);
    ok(T.n > 200, T.name + ' 路点数 ' + T.n);
    near(T.step, T.length / T.n, 0.01, T.name + ' 步长自洽');
    ok(T.step > 12 && T.step < 18, T.name + ' 步长在 13~17px');
    // 相邻路点间距 ≈ step（闭环）
    let maxGap = 0, minGap = 1e9;
    for (let i = 0; i < T.n; i++) {
      const a = T.wp[i], b = T.wp[(i + 1) % T.n];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > maxGap) maxGap = d;
      if (d < minGap) minGap = d;
    }
    ok(maxGap < T.step * 1.25 && minGap > T.step * 0.75, T.name + ' 等距重采样均匀 [' + minGap.toFixed(2) + ',' + maxGap.toFixed(2) + ']');
    // 曲率半径下限（可驾驶性）
    let minR = 1e9;
    for (let i = 0; i < T.n; i++) if (T.radius[i] < minR) minR = T.radius[i];
    ok(minR > 95, T.name + ' 最小转弯半径 ' + Math.round(minR) + ' > 95');
    // 非相邻路点不得靠近（防自交/并行穿路）
    // 说明：闭环沿线相邻（含首尾缝合直道）的点天然欧氏距离近，须按「弧序」豁免；
    // 诊断确认三条赛道所有 <GUARD 的点对 cyc≤15（纯沿线相邻），无 cyc≥25 的真实自交。
    const GUARD = T.halfW * 2 + 80;
    let worst = 1e9, wi = -1, wj = -1;
    for (let i = 0; i < T.n; i++) {
      for (let j = i + 1; j < T.n; j++) {
        const fwd = j - i;
        const cyc = Math.min(fwd, T.n - fwd);
        if (cyc < 20) continue;   // 沿线/缝合相邻豁免
        const d = Math.hypot(T.wp[i].x - T.wp[j].x, T.wp[i].y - T.wp[j].y);
        if (d < worst) { worst = d; wi = i; wj = j; }
      }
    }
    ok(worst > GUARD, T.name + ' 非相邻路点最小距离 ' + worst.toFixed(1) + ' > ' + GUARD + ' @[' + wi + ',' + wj + ']');
    // 道具盒：在路上、避开起点、行距
    ok(T.boxes.length >= 9 && T.boxes.length % 3 === 0, T.name + ' 道具盒按 3 个一行布设（共 ' + T.boxes.length + '）');
    let lastRow = -999;
    for (let bi = 0; bi < T.boxes.length; bi += 3) {
      const row = T.boxes.slice(bi, bi + 3);
      const i = row[0].wp;
      ok(i >= 46 && i < T.n - 20, T.name + ' 道具盒行避开起终点区 wp=' + i);
      ok(i - lastRow >= 44 || lastRow < 0, T.name + ' 道具盒行距 ≥44 路点');
      lastRow = i;
      for (const b of row) {
        const pr = projectOn(T, i, b.x, b.y);
        ok(Math.abs(pr.lat) <= T.halfW * 0.55, T.name + ' 道具盒在路上（lat=' + pr.lat.toFixed(1) + '）');
      }
    }
    // 世界边界合理
    ok(T.bounds.minX > 50 && T.bounds.minY > 50 && T.bounds.maxX < 2900 && T.bounds.maxY < 1900, T.name + ' 包围盒在合理范围');
  }

  // ============ 3. 出生格与装饰审计 ============
  for (let ti = 0; ti < TRACKS.length; ti++) {
    setupRace('easy', ti);
    const T = G.track;
    for (let a = 0; a < G.karts.length; a++) {
      for (let b = a + 1; b < G.karts.length; b++) {
        const d = Math.hypot(G.karts[a].x - G.karts[b].x, G.karts[a].y - G.karts[b].y);
        ok(d > KART_R * 2, TRACKS[ti].name + ' 出生格不重叠 ' + a + '-' + b + ' d=' + d.toFixed(1));
      }
    }
    for (const k of G.karts) {
      const pr = projectOn(T, k.wp, k.x, k.y);
      ok(Math.abs(pr.lat) < T.halfW, TRACKS[ti].name + ' 出生点在路面内');
      ok(k.wp >= T.n - 40 && k.wp < T.n, TRACKS[ti].name + ' 出生格在起点线后方');
      ok(k.lap === 0 && !k.finished, TRACKS[ti].name + ' 出生为第 0 圈');
    }
    eq(G.karts[0].isPlayer, true, TRACKS[ti].name + ' 0 号位是玩家');
    eq(G.karts.filter(k => k.ai).length, 5, TRACKS[ti].name + ' 5 个 AI');
    ok(G.decos.length > 20, TRACKS[ti].name + ' 装饰数量 ' + G.decos.length);
    for (const d of G.decos) {
      const ng = nearestWPGlobal(T, d.x, d.y);
      ok(ng.d > T.halfW + PW.WALL_OFF + 18, TRACKS[ti].name + ' 装饰在路外（d=' + ng.d.toFixed(1) + '）');
    }
    // 同种子重开 → 装饰逐位一致
    const decoSig = G.decos.map(d => Math.round(d.x) + ',' + Math.round(d.y) + ',' + d.type).join('|');
    setupRace('easy', ti);
    eq(G.decos.map(d => Math.round(d.x) + ',' + Math.round(d.y) + ',' + d.type).join('|'), decoSig, TRACKS[ti].name + ' 装饰布置确定性');
  }

  // ============ 4. 物理边界 ============
  setupRace('easy', 0);
  skipCountdown();
  const T0 = G.track;
  const si = straightIdx(T0);
  // 4.1 加速收敛到 VMAX 且不超
  const p = G.player;
  placeKart(p, si, 0);
  step(150, follow);
  ok(p.speedF > PW.VMAX * 0.85, '150 帧循迹油门后接近满速 ' + p.speedF.toFixed(1));
  ok(p.speedF <= PW.VMAX + 1, '无加成不超 VMAX');
  IN.left = IN.right = false;
  // 4.2 刹车减速 / 倒车限速
  const spdBefore = p.speedF;
  IN.gas = false; IN.brake = true;
  step(40);
  ok(p.speedF < spdBefore * 0.5, '刹车 40 帧显著减速');
  IN.brake = false;
  // 倒车限速：钉在直线中线（保留 speedF）隔离赛道几何；把 AI 停到远处，避免绕圈后撞飞钉住的玩家
  placeKart(p, si, 0);
  for (const o of G.karts) if (o !== p) placeKart(o, (si + 150) % T0.n, 0);
  IN.gas = false; IN.brake = true; IN.left = IN.right = false;
  for (let i = 0; i < 60; i++) {
    update(STEP);
    const keep = p.speedF;
    p.x = T0.wp[si].x; p.y = T0.wp[si].y; p.heading = T0.ang[si]; p.wp = si; p.nearHint = si;
    p.speedF = keep; p.speedL = 0;
    p.vx = keep * Math.cos(p.heading); p.vy = keep * Math.sin(p.heading);
  }
  ok(p.speedF < -PW.REV_MAX + 1 && p.speedF >= -PW.REV_MAX - 1, '倒车限速 REV_MAX ' + p.speedF.toFixed(1));
  IN.brake = false;
  // 4.3 转向：左打头逆时针（屏幕坐标 y 向下 → heading 减小）
  placeKart(p, si, 0);
  IN.gas = true; step(60);
  const h0 = p.heading;
  IN.left = true; step(20);
  ok(angNorm(p.heading - h0) < -0.2, '左打 20 帧 heading 逆时针变化');
  IN.left = false; IN.right = true; step(40);
  ok(angNorm(p.heading - h0) > 0, '右打回正并顺时针');
  IN.right = false;
  // 4.4 低速转向弱（原地打方向不转）
  placeKart(p, si, 0);
  const hs = p.heading;
  IN.left = true; step(5);
  ok(Math.abs(angNorm(p.heading - hs)) < 0.05, '静止时转向几乎不生效');
  IN.left = false;
  // 4.5 越野限速（恒定横向偏移循迹，保持在路肩外）
  // 取 halfW+3 而不是更深：越过路肩 RESCUE_DEEP 会触发脱困回位，那就测不到持续的越野限速了（§12.3 单独测拽回）
  placeKart(p, si, T0.halfW + 3);
  step(150, k => followLat(k, T0.halfW + 3));
  ok(p.offroad, '路肩外标记越野');
  ok(p.speedF <= PW.OFF_VMAX + 2, '越野限速 OFF_VMAX ' + p.speedF.toFixed(1));
  IN.gas = false; IN.left = IN.right = false;
  // 4.6 墙内钳制：朝墙全油门也出不去（45 帧内完成，早于深出界的回位窗口）
  placeKart(p, si, T0.halfW + 20);
  p.heading = T0.ang[si] + Math.PI / 2;   // 朝外
  IN.gas = true; step(45);
  const prWall = projectOn(T0, nearestWPGlobal(T0, p.x, p.y).idx, p.x, p.y);
  ok(Math.abs(prWall.lat) <= T0.halfW + PW.WALL_OFF + 1, '撞墙后被钳在墙内 lat=' + prWall.lat.toFixed(1));
  ok(p.speedF < PW.VMAX * 0.7, '撞墙掉速');
  IN.gas = false;
  // 4.7 漂移进入门槛与三档小喷（直接驱动漂移状态机验证档位边界）
  placeKart(p, si, 0);
  p.speedF = 100; p.vx = Math.cos(p.heading) * 100; p.vy = Math.sin(p.heading) * 100;
  IN.drift = true; IN.left = true; step(1);
  eq(p.driftOn, false, '速度不足 150 不进入漂移');
  p.speedF = 260; p.vx = Math.cos(p.heading) * 260; p.vy = Math.sin(p.heading) * 260;
  step(1);
  eq(p.driftOn, true, '高速 + 漂移键 + 转向进入漂移');
  IN.drift = false; IN.left = false;
  p.driftT = PW.DRIFT_T[0] - 0.02; step(1);
  eq(p.boostT, 0, '不足一档无小喷');
  p.driftOn = true; p.driftT = PW.DRIFT_T[0]; step(1);
  near(p.boostT, PW.DRIFT_BOOST[0], 0.02, '一档小喷时长');
  p.driftOn = true; p.driftT = PW.DRIFT_T[1]; p.boostT = 0; step(1);
  near(p.boostT, PW.DRIFT_BOOST[1], 0.02, '二档小喷时长');
  p.driftOn = true; p.driftT = PW.DRIFT_T[2]; p.boostT = 0; step(1);
  near(p.boostT, PW.DRIFT_BOOST[2], 0.02, '三档小喷时长');
  // 小喷可突破 VMAX 至 BOOST_VMAX
  placeKart(p, si, 0);
  p.speedF = PW.VMAX; p.vx = Math.cos(p.heading) * PW.VMAX; p.vy = Math.sin(p.heading) * PW.VMAX;
  IN.gas = true; p.boostT = PW.DRIFT_BOOST[2];
  step(20);
  ok(p.speedF > PW.VMAX + 20, '小喷期间突破 VMAX ' + p.speedF.toFixed(1));
  ok(p.speedF <= PW.BOOST_VMAX + 1, '不超 BOOST_VMAX');
  IN.gas = false;
  // 4.8 打转期间失控且结束后进入保护窗
  placeKart(p, si, 0);
  p.spinT = PW.SPIN_T; p.spinDir = 1;
  const hx = p.heading;
  IN.gas = true; IN.left = true; step(10);
  ok(p.heading !== hx, '打转中 heading 持续旋转');
  step(Math.ceil(PW.SPIN_T * 60) + 2);
  eq(p.spinT, 0, '打转按时结束');
  ok(p.invulnT > 0, '打转后有保护窗');
  IN.gas = false; IN.left = false;

  // ============ 5. 道具全家桶 ============
  // 5.1 蘑菇：瞬时小喷
  setupRace('easy', 0); skipCountdown();
  let P = G.player;
  placeKart(P, si, 0);
  P.speedF = PW.VMAX; P.vx = Math.cos(P.heading) * PW.VMAX; P.vy = Math.sin(P.heading) * PW.VMAX;
  P.item = 'mushroom';
  ok(useItem(P), 'useItem 成功');
  eq(P.item, null, '道具被消耗');
  near(P.boostT, PW.MUSH_BOOST_T, 0.001, '蘑菇给满小喷时长');
  IN.gas = true; step(15);
  ok(P.speedF > PW.VMAX, '蘑菇突破极速 ' + P.speedF.toFixed(1));
  IN.gas = false;
  // 打转中不能用道具
  P.item = 'mushroom'; P.spinT = 0.5;
  eq(useItem(P), false, '打转中道具锁');
  P.spinT = 0; P.item = null;
  // 5.2 绿壳：直线飞行 → 撞墙反弹 → 最终消失（反弹超限或超时）
  placeKart(P, si, T0.halfW - 16);
  P.heading = T0.ang[si] + Math.PI / 2;   // 朝外侧墙
  P.item = 'green'; useItem(P);
  eq(G.shells.length, 1, '绿壳生成');
  eq(G.shells[0].type, 'green', '壳类型');
  placeKart(P, (si + 60) % T0.n, 0);      // 把 P 移开，避免反弹壳回撞自己干扰计数
  let bounced = false, maxB = 0;
  for (let i = 0; i < 150 && G.shells.length; i++) {
    update(STEP);
    if (G.shells.length) { const b = G.shells[0].bounces; if (b >= 1) bounced = true; if (b > maxB) maxB = b; }
  }
  ok(bounced, '绿壳撞墙反弹');
  ok(maxB <= SHELL_BOUNCE_MAX, '反弹次数受限 maxB=' + maxB + ' ≤ ' + SHELL_BOUNCE_MAX);
  for (let i = 0; i < Math.ceil(SHELL_LIFE * 60) + 60 && G.shells.length; i++) update(STEP);
  eq(G.shells.length, 0, '绿壳最终消失（反弹超限或超时）');
  // 5.3 绿壳命中 → 打转 + 掉道具
  placeKart(P, si, 0);
  const vic = G.karts[1];
  const vicIdx = (si + 8) % T0.n;
  placeKart(vic, vicIdx, 0);
  vic.item = 'mushroom';
  P.item = 'green'; useItem(P);
  let spun = false;
  for (let i = 0; i < 200 && !spun; i++) {
    // 钉住靶车于直线正前方，确保直飞绿壳命中（其它 AI 移开避免挡道）
    vic.x = T0.wp[vicIdx].x; vic.y = T0.wp[vicIdx].y; vic.vx = 0; vic.vy = 0; vic.speedF = 0; vic.speedL = 0;
    for (let j = 2; j < G.karts.length; j++) { const o = G.karts[j]; if (o === P || o === vic) continue; placeKart(o, (vicIdx + 40 + j * 7) % T0.n, 0); }
    update(STEP);
    spun = vic.totalSpin >= 1;
  }
  ok(spun, '绿壳命中 AI 打转');
  eq(vic.item, null, '被打转者掉落道具');
  // 5.4 红壳：自动锁定前方目标并追踪命中
  setupRace('easy', 0); skipCountdown();
  P = G.player;
  placeKart(P, si, 0);
  const vic2 = G.karts[2];
  placeKart(vic2, (si + 30) % T0.n, T0.halfW * 0.4);
  P.item = 'red'; useItem(P);
  eq(G.shells.length, 1, '红壳生成');
  eq(G.shells[0].target, vic2, '红壳锁定前方最近目标');
  let spun2 = false;
  for (let i = 0; i < 260 && !spun2; i++) { update(STEP); spun2 = vic2.totalSpin >= 1; }
  ok(spun2, '红壳追踪命中');
  // 5.5 香蕉：主人 1s 豁免，他人踩上打转，星星车碾碎
  setupRace('easy', 0); skipCountdown();
  P = G.player;
  placeKart(P, si, 0);
  P.item = 'banana'; useItem(P);
  eq(G.bananas.length, 1, '香蕉落地');
  const ban = G.bananas[0];
  ok(Math.hypot(ban.x - P.x, ban.y - P.y) > 20, '香蕉丢在车后');
  placeKart(P, si, 0);
  P.x = ban.x; P.y = ban.y; P.nearHint = si; P.wp = si;
  step(3);
  eq(P.totalSpin, 0, '1 秒内主人踩自己香蕉豁免');
  ban.t = 1.5;
  P.x = ban.x; P.y = ban.y;
  step(2);
  ok(P.totalSpin >= 1, '过期后主人也会踩香蕉打转');
  eq(G.bananas.length, 0, '香蕉一次性消耗');
  // 星星碾碎香蕉
  P.item = 'banana'; P.spinT = 0; useItem(P);
  const ban2 = G.bananas[0];
  const starK = G.karts[3];
  placeKart(starK, si, 0);
  starK.starT = 3; starK.invulnT = 3;
  starK.x = ban2.x - Math.cos(starK.heading) * 30; starK.y = ban2.y - Math.sin(starK.heading) * 30;
  starK.vx = Math.cos(starK.heading) * 300; starK.vy = Math.sin(starK.heading) * 300; starK.speedF = 300;
  step(12);
  eq(G.bananas.length, 0, '星星车碾碎香蕉');
  eq(starK.totalSpin, 0, '星星车不打转');
  // 5.6 星星：免疫打转 + 撞飞对手
  placeKart(P, si, 0);
  P.spinT = 0; P.invulnT = 0;
  P.item = 'star'; useItem(P);
  near(P.starT, PW.STAR_T, 0.001, '星星时长');
  eq(spinOut(P), false, '星星期间免疫打转');
  // 撞飞对手：重新武装星星（spinOut 未消耗），靶车置于正前方，高速撞击
  P.starT = PW.STAR_T;
  const vic3 = G.karts[4];
  placeKart(vic3, (si + 4) % T0.n, 0);
  P.x = vic3.x - Math.cos(vic3.heading) * 24; P.y = vic3.y - Math.sin(vic3.heading) * 24;
  P.heading = vic3.heading; P.wp = vic3.wp; P.nearHint = vic3.nearHint;
  P.vx = Math.cos(vic3.heading) * 300; P.vy = Math.sin(vic3.heading) * 300; P.speedF = 300; P.speedL = 0;
  IN.gas = false; IN.left = IN.right = false;
  step(8);
  ok(vic3.totalSpin >= 1, '星星撞飞对手');
  eq(P.totalSpin, 0, '星星车自身无恙');
  // 5.7 闪电：全场缩水减速，星星车豁免
  setupRace('easy', 0); skipCountdown();
  let P2 = G.player;
  P2.item = 'lightning'; useItem(P2);
  let allShrunk = true;
  for (const k of G.karts) if (k !== P2 && !k.finished) { if (k.shrinkT !== PW.SHRINK_T) allShrunk = false; }
  ok(allShrunk, '闪电使全部对手缩水');
  ok(kartVmax(G.karts[1]) < PW.VMAX * DIFFS.easy.aiMul, '缩水者极速被压低');
  // 星星车豁免闪电
  G.karts[2].starT = 3;
  G.karts[2].shrinkT = 0;
  P2.item = 'lightning'; useItem(P2);
  eq(G.karts[2].shrinkT, 0, '星星车免疫闪电');
  // 5.8 道具盒：吃盒得道具、一次性、超时重生
  setupRace('easy', 0); skipCountdown();
  P2 = G.player;
  const T = G.track;
  const brow = T.boxes[0];
  const bxIdx = brow.wp;
  placeKart(P2, (bxIdx - 6 + T.n) % T.n, 0);
  P2.x = brow.x - Math.cos(T.ang[bxIdx]) * 60;
  P2.y = brow.y - Math.sin(T.ang[bxIdx]) * 60;
  P2.heading = T.ang[bxIdx];
  IN.gas = true;
  let got = false;
  for (let i = 0; i < 90 && !got; i++) { update(STEP); got = P2.item !== null; }
  ok(got, '撞到道具盒获得道具');
  eq(brow.alive, false, '盒子被吃掉');
  IN.gas = false;
  let respawned = false;
  for (let i = 0; i < Math.ceil(BOX_RESPAWN * 60) + 10 && !respawned; i++) { update(STEP); respawned = brow.alive; }
  ok(respawned, '道具盒超时重生');
  // 已有道具时不重复吃
  const brow2 = T.boxes.find(b => b.alive);
  ok(brow2, '存在未被吃掉的道具盒');
  P2.item = 'mushroom';
  const wasAlive = brow2.alive;
  P2.x = brow2.x; P2.y = brow2.y; P2.nearHint = brow2.wp; P2.wp = brow2.wp;
  update(STEP);
  eq(brow2.alive, wasAlive, '满道具不吃盒');
  eq(P2.item, 'mushroom', '道具不被覆盖');
  P2.item = null;
  IN.gas = false;

  // ============ 6. 倒计时锁定与冲线结算流 ============
  setupRace('easy', 0);
  const p6 = G.player;
  const sx6 = p6.x, sy6 = p6.y;
  IN.gas = true; IN.left = true;
  step(60);
  eq(G.raceState, 'count', '开局 1 秒仍在倒计时');
  near(p6.x, sx6, 1e-9, '倒计时锁定位移 x');
  near(p6.y, sy6, 1e-9, '倒计时锁定位移 y');
  let g6 = 0;
  while (G.raceState === 'count' && g6++ < 300) update(STEP);
  eq(G.raceState, 'racing', '倒计时结束进入比赛');
  ok(G.goFlash > 0, 'GO 闪光提示');
  IN.left = false;
  const T6 = G.track;
  // 第一圈冲线：计圈不终局
  placeKart(p6, T6.n - 6, 0);
  IN.gas = true;
  let f6 = 0;
  while (p6.lap < 1 && f6 < 300) { update(STEP); f6++; }
  eq(p6.lap, 1, '冲过起点线计一圈');
  eq(p6.finished, false, '第一圈不结束比赛');
  // 末圈冲线：完赛 → 收尾 → 结算
  p6.lap = LAPS - 1;
  placeKart(p6, T6.n - 6, 0);
  f6 = 0;
  while (!p6.finished && f6 < 300) { update(STEP); f6++; }
  ok(p6.finished, '末圈冲线完赛');
  eq(p6.finishPlace, 1, '首个冲线者名次 1');
  ok(p6.finishTime > 0, '完赛时间被记录');
  eq(G.raceState, 'ending', '玩家完赛进入收尾');
  f6 = 0;
  while (G.scene === 'race' && f6 < 400) { update(STEP); f6++; }
  eq(G.scene, 'result', '收尾后进入结算');
  ok(G.result && G.result.place === 1, '结算名次 1');
  eq(G.result.rows.length, 6, '结算列出 6 车');
  eq(G.result.rows[0].isPlayer, true, '榜首是玩家');
  ok(G.result.rows.every((r, i) => r.place === i + 1), '结算名次连续');
  ok(G.result.score >= PLACE_PTS[0] * DIFFS.easy.scoreMul, '冠军得分不低于名次分');
  IN.gas = false;

  // ============ 7. 确定性重放（同种子 + 同输入逐位一致）============
  const scripted = (() => {
    let f = 0;
    const snaps = [];
    const script = (k) => {
      IN.gas = true;
      IN.left = (Math.floor(f / 40) % 3 === 0);
      IN.right = false;
      IN.drift = (Math.floor(f / 55) % 4 === 0) && IN.left;
      IN.brake = (Math.floor(f / 90) % 7 === 0);
      IN.item = (f % 100 === 0);
    };
    setupRace('normal', 1);
    while (f < 3600 && G.scene === 'race') {
      if (G.raceState === 'racing') script(G.player);
      update(STEP);
      f++;
      if (f % 1200 === 0) snaps.push(hashKarts());
    }
    snaps.push(hashKarts());
    return { snaps, f, rt: Math.round(G.raceTime * 1e6) };
  })();
  const scripted2 = (() => {
    let f = 0;
    const snaps = [];
    const script = (k) => {
      IN.gas = true;
      IN.left = (Math.floor(f / 40) % 3 === 0);
      IN.right = false;
      IN.drift = (Math.floor(f / 55) % 4 === 0) && IN.left;
      IN.brake = (Math.floor(f / 90) % 7 === 0);
      IN.item = (f % 100 === 0);
    };
    setupRace('normal', 1);
    while (f < 3600 && G.scene === 'race') {
      if (G.raceState === 'racing') script(G.player);
      update(STEP);
      f++;
      if (f % 1200 === 0) snaps.push(hashKarts());
    }
    snaps.push(hashKarts());
    return { snaps, f, rt: Math.round(G.raceTime * 1e6) };
  })();
  eq(scripted.f, scripted2.f, '两次重放帧数一致');
  eq(scripted.rt, scripted2.rt, '两次重放比赛时间一致');
  eq(scripted.snaps.join('#'), scripted2.snaps.join('#'), '同种子同输入逐位一致（含壳/香蕉/盒子状态）');
  // 换难度 → AI 极速不同 → 状态必然分叉
  const scripted3 = (() => {
    let f = 0;
    setupRace('hard', 1);
    while (f < 1200 && G.scene === 'race') { IN.gas = true; update(STEP); f++; }
    return hashKarts();
  })();
  ok(scripted3 !== scripted.snaps[0], '不同难度重放分叉（AI 参数生效）');

  // ============ 8. 面板 UI 流 + HUD 按钮 + 键位 ============
  unlocked = 0;
  for (const k of Object.keys(bests)) delete bests[k];
  G.scene = 'menu'; G.diff = 'normal'; G.speed = 1;
  const findBtn = (act) => uiBtns.find(b => b.act === act);
  const clickBtn = (act) => { const b = findBtn(act); ok(!!b, '按钮 ' + act + ' 已注册'); uiHit(b.x + b.w / 2, b.y + b.h / 2); };
  drawScene();
  ok(findBtn('diff:easy') && findBtn('diff:normal') && findBtn('diff:hard'), '菜单三难度胶囊注册');
  ok(findBtn('start'), '开始按钮注册');
  ok(cornerBtns.some(b => b.act === 'mute'), '静音圆钮注册');
  clickBtn('diff:hard');
  eq(G.diff, 'hard', '点选困难生效');
  eq(store[DIFF_KEY], 'hard', '难度写入 localStorage');
  listeners.window.keydown({ key: '1', preventDefault: noop });
  eq(G.diff, 'easy', '菜单按 1 切简单');
  listeners.window.keydown({ key: '2', preventDefault: noop });
  eq(G.diff, 'normal', '菜单按 2 切普通');
  clickBtn('start');
  eq(G.scene, 'tracks', '进入选道面板');
  drawScene();
  ok(findBtn('track:0'), '赛道 0 卡注册');
  ok(!findBtn('track:1'), '锁定赛道 1 无按钮（防呆）');
  ok(findBtn('back'), '返回按钮注册');
  clickBtn('back');
  eq(G.scene, 'menu', '返回主菜单');
  drawScene();
  clickBtn('start');
  drawScene();
  clickBtn('track:0');
  eq(G.scene, 'race', '点赛道卡开跑');
  eq(G.trackIdx, 0, '赛道序号正确');
  drawScene();
  ok(hudBtns.some(b => b.act === 'menu') && hudBtns.some(b => b.act === 'mute') && hudBtns.some(b => b.act === 'speed'), 'HUD 三圆钮注册');
  const hbS = hudBtns.find(b => b.act === 'speed');
  uiHit(hbS.x + hbS.w / 2, hbS.y + hbS.h / 2);
  eq(G.speed, 2, '倍速 1x→2x');
  uiHit(hbS.x + hbS.w / 2, hbS.y + hbS.h / 2);
  uiHit(hbS.x + hbS.w / 2, hbS.y + hbS.h / 2);
  eq(G.speed, 1, '倍速 3x 后回 1x');
  listeners.window.keydown({ code: 'Escape', key: 'Escape', preventDefault: noop });
  eq(G.paused, true, 'Esc 暂停');
  drawScene();
  ok(findBtn('resume') && findBtn('restart') && findBtn('menu'), '暂停面板按钮注册');
  clickBtn('resume');
  eq(G.paused, false, '继续比赛');
  // 键位映射
  listeners.window.keydown({ code: 'ArrowUp', preventDefault: noop });
  eq(IN.gas, true, '↑ = 油门');
  listeners.window.keyup({ code: 'ArrowUp', preventDefault: noop });
  eq(IN.gas, false, '松开归位');
  listeners.window.keydown({ code: 'KeyW', preventDefault: noop }); eq(IN.gas, true, 'W = 油门');
  listeners.window.keyup({ code: 'KeyW', preventDefault: noop });
  listeners.window.keydown({ code: 'Space', preventDefault: noop }); eq(IN.item, true, '空格 = 道具');
  listeners.window.keyup({ code: 'Space', preventDefault: noop });
  listeners.window.keydown({ code: 'ShiftLeft', preventDefault: noop }); eq(IN.drift, true, 'Shift = 漂移');
  listeners.window.keyup({ code: 'ShiftLeft', preventDefault: noop });
  listeners.window.keydown({ code: 'ArrowDown', preventDefault: noop }); eq(IN.brake, true, '↓ = 刹车');
  listeners.window.keyup({ code: 'ArrowDown', preventDefault: noop });
  const diffBefore = G.diff;
  listeners.window.keydown({ key: '3', preventDefault: noop });
  eq(G.diff, diffBefore, '比赛中数字键不改难度');
  listeners.window.keydown({ key: 'm' });
  eq(muted, true, 'M 静音');
  listeners.window.keydown({ key: 'm' });
  eq(muted, false, 'M 恢复');
  drawScene();
  const hbM = hudBtns.find(b => b.act === 'menu');
  uiHit(hbM.x + hbM.w / 2, hbM.y + hbM.h / 2);
  eq(G.scene, 'menu', 'HUD 菜单钮回主菜单');
  eq(G.paused, false, '回菜单自动解除暂停');

  // ============ 9. 速胜一局 → 纪录九格与解锁链 ============
  G.diff = 'easy';
  setupRace('easy', 0);
  skipCountdown();
  const p9 = G.player;
  p9.lap = LAPS - 1;
  placeKart(p9, G.track.n - 6, 0);
  IN.gas = true;
  let f9 = 0;
  while (G.scene === 'race' && f9 < 600) { update(STEP); f9++; }
  eq(G.scene, 'result', '速胜进入结算');
  eq(G.result.place, 1, '速胜夺冠');
  const key9 = DIFF_ORDER.indexOf('easy') * TRACKS.length + 0;
  ok(bests[key9], 'easy×赛道0 纪录生成');
  eq(bests[key9].score, G.result.score, '纪录分 = 结算分');
  ok(bests[key9].time > 0 && bests[key9].time < 60, '纪录时间合理 ' + bests[key9].time);
  const parsed9 = JSON.parse(store[BEST_KEY]);
  ok(parsed9 && parsed9[key9], '纪录写入 localStorage');
  eq(parsed9[key9].score, G.result.score, 'localStorage 分数一致');
  eq(unlocked, 1, '夺冠解锁赛道 1');
  eq(store[UNLOCK_KEY], '1', '解锁写入 localStorage');
  // 结算面板按钮
  drawScene();
  ok(findBtn('retry'), '再来一局按钮');
  ok(findBtn('next'), '夺冠后出现下一赛道按钮');
  ok(findBtn('menu'), '主菜单按钮');
  ok(G.result.unlockedNext, '结算展示解锁提示');
  clickBtn('next');
  eq(G.scene, 'race', '下一赛道开跑');
  eq(G.trackIdx, 1, '进入赛道 1');
  drawScene();
  const hbM2 = hudBtns.find(b => b.act === 'menu');
  uiHit(hbM2.x + hbM2.w / 2, hbM2.y + hbM2.h / 2);
  eq(G.scene, 'menu', '回主菜单');
  clearIN();

  // ============ 10. Bot：3 赛道 × 3 难度 9/9 夺冠 ============
  const botReport = [];
  let refSnaps = null, refRt = 0;
  let itemsUsedTotal = 0, maxBoostSeen = 0;
  for (const diff of DIFF_ORDER) {
    for (let ti = 0; ti < TRACKS.length; ti++) {
      const r = raceWith(diff, ti, botThink, 20000);
      const tag = diff + '×' + TRACKS[ti].name;
      ok(G.scene === 'result', tag + ' Bot 跑完进入结算（frames=' + r.frames + '）');
      ok(r.frames < 20000, tag + ' 未触发帧数上限');
      ok(G.player.finished, tag + ' Bot 完赛');
      eq(G.finishOrder[0], G.player, tag + ' Bot 第一个冲线');
      eq(G.result.place, 1, tag + ' Bot 夺冠');
      ok(G.raceTime < 300, tag + ' 未超时（' + G.raceTime.toFixed(1) + 's）');
      itemsUsedTotal += G.player.itemsUsed;
      maxBoostSeen = Math.max(maxBoostSeen, G.player.maxBoost);
      botReport.push(tag + ': ' + G.raceTime.toFixed(2) + 's / ' + r.frames + ' 帧 / 得分 ' + G.result.score);
      if (diff === 'hard' && ti === 2) { refSnaps = r.snaps; refRt = Math.round(G.raceTime * 1e6); }
    }
  }
  ok(itemsUsedTotal > 0, 'Bot 全程确实用过道具（共 ' + itemsUsedTotal + ' 次）');
  ok(maxBoostSeen > 0, 'Bot 全程确实吃到过加速（最高档 ' + maxBoostSeen + '）');
  // Bot 重放确定性：最难档重跑逐位一致
  const rBot2 = raceWith('hard', 2, botThink, 20000);
  eq(rBot2.snaps.join('#'), refSnaps.join('#'), 'hard×星夜高速 Bot 重放逐位一致');
  eq(Math.round(G.raceTime * 1e6), refRt, 'Bot 重放比赛时间一致');
  // 九格纪录全满
  let cells = 0;
  for (let di = 0; di < 3; di++) for (let ti = 0; ti < 3; ti++) {
    const rec = bests[di * 3 + ti];
    ok(rec && rec.score > 0 && rec.time > 0, '纪录格 ' + DIFF_ORDER[di] + '×' + TRACKS[ti].name + ' 存在');
    cells++;
  }
  eq(cells, 9, '难度×赛道九格纪录');
  eq(unlocked, 2, '三赛道全夺冠后全部解锁');
  console.log('--- Bot 战报（9/9 夺冠）---');
  for (const line of botReport) console.log('  ' + line);

  // ============ 11. 原地不动必败 ============
  const rid = raceWith('hard', 0, null, 20000);
  eq(G.scene, 'result', '放任局进入结算');
  eq(G.player.finished, false, '放任玩家未完赛');
  eq(G.result.place, 6, '原地不动垫底');
  ok(G.result.rows[5].isPlayer, '结算末位是玩家');
  eq(G.finishOrder.length, 5, '五名 AI 全部完赛');
  clearIN();

  // ============ 12. 脱困回位（撞出赛道/被撞晕甩出后闪几下自动摆回中线） ============
  // 场景隔离：其他车手放到赛道对侧，并在测量窗口内持续清掉他们的道具与在飞投射物——
  // 否则一圈多它们就绕回来把玩家撞着跑，断言测的就是 AI 干扰而不是脱困逻辑本身
  const isolate = (p, si) => {
    for (const o of G.karts) if (o !== p) placeKart(o, (si + (G.track.n >> 1)) % G.track.n, 0);
    quiet();
  };
  const quiet = () => {
    G.shells.length = 0; G.bananas.length = 0;
    for (const o of G.karts) if (!o.isPlayer) o.item = null;
  };
  const latOf = (T, k) => Math.abs(projectOn(T, nearestWP(T, k.x, k.y, k.nearHint, 12).idx, k.x, k.y).lat);

  // 12.1 顶墙 + 油门：闪够预警窗口后摆回中线，并给一小脚推力
  setupRace('easy', 0);
  skipCountdown();
  {
    const T = G.track, p = G.player;
    const si = straightIdx(T);
    isolate(p, si);
    placeKart(p, si, T.halfW + 22);
    p.heading = T.ang[si] + Math.PI / 2;            // 车头死顶外墙：全油门也爬不出去
    IN.gas = true;
    let maxStuck = 0, snapAt = -1, snapSpeed = 0, maxJump = 0;
    for (let i = 0; i < 500; i++) {
      const prevProg = p.prog;
      quiet(); step(1);
      if (p.stuckT > maxStuck) maxStuck = p.stuckT;
      if (p.prog - prevProg > maxJump) maxJump = p.prog - prevProg;
      if (p.snapFlash > 0) { snapAt = i; snapSpeed = Math.hypot(p.vx, p.vy); break; }
    }
    ok(snapAt >= 0, '顶墙持续低速会触发脱困回位');
    ok(maxStuck >= PW.RESCUE_WARN, '回位前先闪够预警窗口 ' + maxStuck.toFixed(2) + 's');
    ok(latOf(T, p) < T.halfW, '回位后回到路面内');
    ok(p.invulnT > 0, '回位后有无敌窗口');
    ok(p.stuckT === 0, '回位后卡死计时清零');
    ok(snapSpeed > 0 && snapSpeed <= PW.RESCUE_POP + 1, '回位只给一小段推力 ' + snapSpeed.toFixed(0));
    ok(maxJump < 5, '回位不得白送进度（单帧最大进度跳变 ' + maxJump.toFixed(2) + ' 路点）');
    IN.gas = false;
  }
  // 12.2 撞晕甩出＋全程不踩油门：也要能自己回到中线，但不给推力、不送进度
  //（守的就是这条：撞晕时玩家本来不敢按油门，旧版把「踩油门」当触发条件，人就永久卡在草地上了）
  setupRace('easy', 0);
  skipCountdown();
  {
    const T = G.track, p = G.player;
    const si = straightIdx(T);
    isolate(p, si);
    placeKart(p, si, T.halfW + 22);
    p.heading = T.ang[si] + 0.6;
    p.spinT = PW.SPIN_T; p.spinDir = 1;             // 正在打转的典型现场
    clearIN();
    const prog0 = p.prog;
    let flashed = 0;
    // 只测 4s：打转 1.15s + 累积回位 ≈ 2.4s 已经完成；再久 AI 集团绕一圈回来会把「不动的车」顶着跑，
    // 那就变成在测追尾而不是脱困（§11 的放任局另有专门断言管最终名次）
    for (let i = 0; i < 240; i++) { quiet(); step(1); if (p.snapFlash > 0) flashed++; }
    ok(flashed > 0, '不踩油门也会触发脱困回位');
    ok(latOf(T, p) < T.halfW, '撞晕出界 4s 内已回到路面内 lat=' + latOf(T, p).toFixed(0));
    ok(Math.hypot(p.vx, p.vy) < 2, '不踩油门回位后停在原地不被推走 spd=' + Math.hypot(p.vx, p.vy).toFixed(1));
    ok(p.prog - prog0 < 1.5, '脱困不能被用来刷进度 Δprog=' + (p.prog - prog0).toFixed(2));
  }
  // 12.3 越过路肩在草地上超速抄近道：同样被拽回赛道（只经由 IN 驱动）
  setupRace('easy', 0);
  skipCountdown();
  {
    const T = G.track, p = G.player;
    const si = straightIdx(T);
    isolate(p, si);
    placeKart(p, si, 0);
    let snapAt = -1;
    for (let i = 0; i < 420; i++) { quiet(); step(1, k => followLat(k, T.halfW + 18)); if (p.snapFlash > 0) { snapAt = i; break; } }
    ok(snapAt >= 0, '贴着路肩外草地超速跑也会被拽回赛道（第 ' + snapAt + ' 帧）');
    ok(latOf(T, p) < T.halfW, '草地拽回后落在路面内');
    ok(Math.hypot(p.vx, p.vy) > 0, '草地拽回时有油门意图，给得出推力');
    clearIN();
  }
  // 12.4 正常跑线绝不被打断：沿中线追 400 帧，一次都不该出现回位闪烁
  setupRace('easy', 0);
  skipCountdown();
  {
    const T = G.track, p = G.player;
    const si = straightIdx(T);
    isolate(p, si);
    placeKart(p, si, 0);
    let flashed = 0, maxLat = 0;
    for (let i = 0; i < 400; i++) { quiet(); step(1, follow); if (p.snapFlash > 0) flashed++; maxLat = Math.max(maxLat, latOf(T, p)); }
    eq(flashed, 0, '正常跑线不被脱困机制打断');
    ok(maxLat < T.halfW, '循迹期间始终在路面内 maxLat=' + maxLat.toFixed(0));
    clearIN();
  }

  console.log('✔ ALL ' + n + ' assertions passed (' + botReport.length + ' bot races)');
})().catch(e => { console.error('✘ FAIL:', (e && e.stack) || e); process.exitCode = 1; });
`;

try { eval(src + TESTS); } catch (e) { console.error('✘ EVAL ERROR:', e); process.exit(1); }
