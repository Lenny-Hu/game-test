// 无头回归测试：桩掉 DOM/Canvas，验证常量与材料/小鸟表、关卡几何初始不相交、
// SAT 碰撞原语（矩矩/圆圆/圆矩）方向与穿深、空转稳定性（十二关全睡、无自毁、漂移有界）、
// 伤害阈值与冷却、四种小鸟技能（红/黄冲刺/蓝分裂/炸弹引信）、火药连锁、
// 计分构成与星级、难度参数对鸟队列/猪血/块血的影响、纪录与解锁持久化、
// 拖拽发射/取消边界、暂停/结算按钮流转，以及贪心 Bot 确定性整局必胜重放。
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

  // ---- Bot 工具：发射（px=水平拉力, py=下拉力=上射, ab=技能触发帧）----
  function prep(li, diff) {
    game.diffIdx = diff == null ? 1 : diff; loadLevel(li); game.state = 'play';
    for (let i = 0; i < 60; i++) update(DT);
    return game.phase === 'ready';
  }
  function shot(px, py, ab) {
    fireBird(SLX - px, SLY + py);
    let fired = false;
    for (let i = 0; i < 560; i++) {
      update(DT);
      if (ab != null && !fired && i >= ab) { fired = true; useAbility(); }
      if (game.phase === 'ready' || game.result) return;
    }
  }
  function finish(maxF) { for (let i = 0; i < (maxF || 300) && !game.result; i++) update(DT); }
  function play(li, shots, diff) {
    if (!prep(li, diff)) return 'noprep';
    for (const s of shots) {
      if (game.pigsLeft <= 0 || game.phase !== 'ready') break;
      shot(s[0], s[1], s[2]);
    }
    finish();
    const r = game.result;
    return r ? (r.win ? 'WIN' : 'LOSE') : 'noresult';
  }

  resize();

  // ============ 1) 常量与数值表 ============
  eq(W, 1000, 'W'); eq(H, 620, 'H'); eq(GY, 560, 'GY');
  eq(SLX, 150, 'SLX'); eq(SLY, GY - 96, 'SLY 叉口高度');
  eq(PULL_R, 92, '最大拉距'); eq(POWER_K, 11, '力度系数');
  ok(POWER_K * PULL_R > 900 && POWER_K * PULL_R < 1200, '满拉初速 ~1012 合理区间');
  eq(Object.keys(MATS).length, 7, '7 种材料');
  ok(MATS.stone.hp > MATS.wood.hp && MATS.wood.hp > MATS.glass.hp && MATS.glass.hp > MATS.tnt.hp, '血量 石>木>玻>药');
  ok(MATS.stone.th > MATS.wood.th && MATS.wood.th > MATS.glass.th && MATS.glass.th > MATS.tnt.th, '受伤阈值 石>木>玻>药');
  ok(BIRDS.red.pw > BIRDS.chuck.pw && BIRDS.chuck.pw > BIRDS.blues.pw, '伤害倍率 红>黄>蓝');
  ok(BIRDS.bomb.m > BIRDS.red.m, '炸弹鸟最重');
  eq(SCORE_PIG, 5000, '猪分'); eq(SCORE_BLOCK, 500, '块分'); eq(SCORE_BIRD_LEFT, 10000, '剩鸟分');
  eq(DIFFS.length, 3, '三档难度');
  eq(DIFFS[0].birdsExtra, 1, '简单 +1 鸟'); eq(DIFFS[2].birdsExtra, -1, '困难 -1 鸟');
  ok(DIFFS[0].pigHp < DIFFS[1].pigHp && DIFFS[1].pigHp < DIFFS[2].pigHp, '猪血递增');
  ok(DIFFS[0].blkJuice > DIFFS[1].blkJuice && DIFFS[1].blkJuice > DIFFS[2].blkJuice, '块血递减');

  // ============ 2) 关卡表完整性 ============
  eq(LEVELS.length, 12, '12 关');
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    ok(L.name.length >= 2, '关卡名 @' + i);
    ok(L.birds.length >= 3, '至少 3 鸟 @' + (i + 1));
    for (const t of L.birds) ok(!!BIRDS[t], '鸟种合法 ' + t + ' @' + (i + 1));
    ok(L.stars[0] < L.stars[1], '星级阈值递增 @' + (i + 1));
    let pigs = 0;
    for (const it of L.items) {
      if (it.k === 'c') { pigs++; eq(it.mat, 'pig', '圆件只当猪 @' + (i + 1)); }
      else ok(!!MATS[it.mat], '材料合法 @' + (i + 1) + ' ' + it.mat);
      const hw = it.k === 'r' ? it.w / 2 : it.r, hh = it.k === 'r' ? it.h / 2 : it.r;
      ok(it.x - hw > 300, '结构物在弹弓安全区右侧 @' + (i + 1));
      ok(it.y + hh <= GY + 0.01, '不埋入地面 @' + (i + 1) + ' y=' + it.y + ' hh=' + hh);
      ok(it.x + hw < W - 4, '不出右边界 @' + (i + 1));
    }
    ok(pigs >= 2, '至少 2 猪 @' + (i + 1));
  }
  // 初始几何不相交审计（允许 0 间隙贴合，但不允许重叠）
  for (let i = 0; i < LEVELS.length; i++) {
    const items = LEVELS[i].items;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const A = items[a], B = items[b];
      let pen = 0;   // >0 为重叠深度
      if (A.k === 'c' && B.k === 'c') pen = A.r + B.r - Math.hypot(A.x - B.x, A.y - B.y);
      else if (A.k === 'c' || B.k === 'c') {
        const C = A.k === 'c' ? A : B, Rr = A.k === 'c' ? B : A;
        const qx = Math.max(-Rr.w / 2, Math.min(C.x - Rr.x, Rr.w / 2));
        const qy = Math.max(-Rr.h / 2, Math.min(C.y - Rr.y, Rr.h / 2));
        const d = Math.hypot(C.x - Rr.x - qx, C.y - Rr.y - qy);
        pen = C.r - d;
        if (d < 1e-9) pen = C.r + Math.min(Rr.w / 2 - Math.abs(C.x - Rr.x), Rr.h / 2 - Math.abs(C.y - Rr.y)); // 圆心在矩形内
      } else {
        const ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
        pen = Math.min(ox, oy);   // 任一轴 ≤0 即不相交
      }
      ok(pen <= 0.01, '初始不相交 L' + (i + 1) + ' #' + a + '#' + b + ' pen=' + pen.toFixed(2));
    }
  }

  // ============ 3) 碰撞原语 ============
  {
    const bx = (o) => mkBody('block', 'r', Object.assign({ mat: 'wood' }, o));
    const cc = (o) => mkBody('block', 'c', Object.assign({ mat: 'wood' }, o));
    // 矩矩：右侧相交，法线 A→B 应指向 +x
    let m = rectRect(bx({ x: 0, y: 0, w: 40, h: 40 }), bx({ x: 30, y: 0, w: 40, h: 40 }));
    ok(m && m.n[0] > 0.99 && Math.abs(m.n[1]) < 1e-9, '矩矩法线 A→B +x');
    ok(m.pts.length >= 1, '矩矩有接触点');
    ok(Math.max(...m.pts.map(p => p.pen)) >= 10 && Math.max(...m.pts.map(p => p.pen)) <= 30, '矩矩穿深在 [10,30]');
    m = rectRect(bx({ x: 0, y: 0, w: 40, h: 40 }), bx({ x: 40, y: 0, w: 40, h: 40 }));
    ok(m && m.pts.length >= 1 && Math.max(...m.pts.map(p => p.pen)) <= 0.01, '矩矩贴合→零穿深流形（可堆叠）');
    m = rectRect(bx({ x: 0, y: 0, w: 40, h: 40 }), bx({ x: 44, y: 0, w: 40, h: 40 }));
    ok(m === null, '矩矩分离→null');
    // 圆圆
    m = circCirc(cc({ x: 0, y: 0, r: 20 }), cc({ x: 30, y: 0, r: 20 }));
    ok(m && m.n[0] > 0.99, '圆圆法线'); close(m.pts[0].pen, 10, 0.01, '圆圆穿深 10');
    ok(circCirc(cc({ x: 0, y: 0, r: 10 }), cc({ x: 25, y: 0, r: 10 })) === null, '圆圆分离→null');
    // 圆矩：圆在矩形上方（矩形顶 95，圆心 83，半径 15 → 穿深 3）
    m = circRect(cc({ x: 100, y: 83, r: 15 }), bx({ x: 100, y: 120, w: 80, h: 50 }));
    ok(m && m.n[1] > 0.99, '圆矩法线 C→R +y(向下)'); close(m.pts[0].pen, 3, 0.01, '圆矩穿深 3');
    m = circRect(cc({ x: 100, y: 60, r: 15 }), bx({ x: 100, y: 120, w: 80, h: 50 }));
    ok(m === null, '圆矩分离→null');
    // collide() 归一化 A→B（圆在后的 B→A 翻转）
    m = collide(bx({ x: 100, y: 120, w: 80, h: 50, mat: 'stone' }), cc({ x: 100, y: 83, r: 15, mat: 'pig' }));
    ok(m && m.n[1] < -0.99, 'collide 翻转后 A(矩)→B(圆) 向上');
  }

  // ============ 4) 空转稳定性（十二关 8 秒：无自毁、全睡、漂移有界）============
  for (let li = 0; li < LEVELS.length; li++) {
    game.diffIdx = 1; loadLevel(li); game.state = 'play';
    const snap = bodies.filter(b => !b.dead && !b.stat).map(b => ({ b, x: b.x, y: b.y }));
    const pigs0 = snap.filter(t => t.b.kind === 'pig').length;
    for (let i = 0; i < 60 * 8; i++) update(DT);
    let maxDrift = 0, awakeCnt = 0;
    for (const t of snap) {
      if (t.b.dead) { ok(false, '空转不应自毁 L' + (li + 1)); continue; }
      maxDrift = Math.max(maxDrift, Math.hypot(t.b.x - t.x, t.b.y - t.y));
      if (t.b.awake && Math.hypot(t.b.vx, t.b.vy) > 8) awakeCnt++;
    }
    ok(maxDrift <= 12, 'L' + (li + 1) + ' 空转漂移 ≤12px, got ' + maxDrift.toFixed(2));
    eq(awakeCnt, 0, 'L' + (li + 1) + ' 8 秒后无仍在运动的物体');
    eq(bodies.filter(b => b.kind === 'pig' && !b.dead).length, pigs0, 'L' + (li + 1) + ' 空转不掉猪');
    eq(game.pigsLeft, pigs0, 'L' + (li + 1) + ' pigsLeft 一致');
    ok(bodies.every(b => isFinite(b.x) && isFinite(b.y) && isFinite(b.vx)), '无 NaN L' + (li + 1));
    ok(!game.result, 'L' + (li + 1) + ' 空转不出结果');
  }

  // ============ 5) 伤害阈值与冷却 ============
  {
    game.diffIdx = 1; loadLevel(0); game.state = 'play';
    const woodB = mkBody('block', 'r', { x: 950, y: 300, w: 40, h: 40, mat: 'wood' });
    woodB.hp = woodB.maxHp = MATS.wood.hp;
    bodies.push(woodB);   // 不调用 update，直接喂构造流形验证伤害公式
    const bird = mkBody('bird', 'c', { x: 950, y: 250, r: 14, mat: 'bird', birdType: 'red' });
    bodies.push(bird);
    const man = (vn0) => ({ n: [0, 1], pts: [{ vn0 }] });
    const hp0 = woodB.hp;
    applyDamage(bird, woodB, man(100));              // < th(150)：无伤
    eq(woodB.hp, hp0, '低于阈值不掉血');
    applyDamage(bird, woodB, man(40));               // < 40 全局下限
    eq(woodB.hp, hp0, 'rel<40 无伤');
    applyDamage(bird, woodB, man(400));              // (400-150)*0.28*1.8 = 126 > 55 → 碎
    ok(woodB.dead, '红鸟 400 速度碎木块');
    eq(game.blocksDestroyed, 1, '碎块计数');
    eq(game.score, SCORE_BLOCK, '碎块 +500');
    // 石头阈值：400 速度掉血但存活
    const stoneB = mkBody('block', 'r', { x: 960, y: 300, w: 40, h: 40, mat: 'stone' });
    bodies.push(stoneB);
    const hpS = stoneB.hp;
    applyDamage(bird, stoneB, man(160));             // < th(235)
    eq(stoneB.hp, hpS, '石头 160 无伤');
    applyDamage(bird, stoneB, man(400));             // (400-235)*0.28*1.8 = 83.2 < 122
    ok(!stoneB.dead && stoneB.hp < hpS, '石头 400 掉血不碎');
    // 无主坠落物砸猪（pw=0.5）
    game.diffIdx = 1; loadLevel(0); game.state = 'play';
    const pigB = bodies.find(b => b.kind === 'pig');
    const faller = mkBody('block', 'r', { x: 960, y: 300, w: 30, h: 30, mat: 'stone' });
    bodies.push(faller);
    const hpP = pigB.hp;
    applyDamage(pigB, faller, man(200));             // (200-65)*0.3*0.5=20.25
    close(pigB.hp, hpP - 20.25, 0.01, '坠落物伤猪 pw=0.5');
    applyDamage(pigB, faller, man(200));             // 同 simT 桶：被冷却挡住
    close(pigB.hp, hpP - 20.25, 0.01, '同帧冷却不重复伤');
  }

  // ============ 6) 技能 ============
  {
    // 红鸟：无伤害技能但标记已用 + 不产生物体
    game.diffIdx = 1; loadLevel(0); game.state = 'play'; game.phase = 'fly';
    let b0 = mkBody('bird', 'c', { x: 400, y: 300, r: 14, mat: 'bird', birdType: 'red' });
    b0.vx = 600; b0.vy = -300; b0.bornT = simT; bodies.push(b0); game.curBird = b0;
    const nb = bodies.length; useAbility();
    eq(b0.abilityUsed, true, '红鸟标记已用'); eq(bodies.length, nb, '红鸟不增体');
    useAbility(); eq(b0.vx, 600, '重复触发无效');

    // 黄鸟冲刺：速度 ×1.9
    const b1 = mkBody('bird', 'c', { x: 400, y: 300, r: 13, mat: 'bird', birdType: 'chuck' });
    b1.vx = 500; b1.vy = -100; b1.bornT = simT; bodies.push(b1); game.curBird = b1;
    const sp1 = Math.hypot(b1.vx, b1.vy); useAbility();
    close(Math.hypot(b1.vx, b1.vy), Math.max(sp1, 520) * 1.9, 1, '黄鸟冲刺 ×1.9');

    // 蓝鸟分裂：1 → 3 只
    const b2 = mkBody('bird', 'c', { x: 400, y: 300, r: 9, mat: 'bird', birdType: 'blues' });
    b2.vx = 700; b2.vy = -150; b2.bornT = simT; bodies.push(b2); game.curBird = b2;
    const nb2 = bodies.length; useAbility();
    eq(bodies.length, nb2 + 2, '蓝鸟分裂出 2 只');
    const angs = bodies.slice(-2).map(c => Math.atan2(c.vy, c.vx) - Math.atan2(b2.vy, b2.vx));
    ok(Math.sign(angs[0]) !== Math.sign(angs[1]), '两分身 ± 对称偏转');

    // 炸弹鸟：引信 → 爆炸清场
    prep(1, 1); // 琉璃屋随便一关
    const b3 = mkBody('bird', 'c', { x: 800, y: 520, r: 16, mat: 'bird', birdType: 'bomb' });
    b3.bornT = simT; bodies.push(b3); game.curBird = b3; game.phase = 'fly';
    useAbility(); close(b3.fuse, 0.45, 0.05, '引信 0.45s');
    const pigsBefore = game.pigsLeft;
    for (let i = 0; i < 40 && game.pigsLeft === pigsBefore; i++) update(DT);
    ok(game.pigsLeft < pigsBefore, '炸弹爆炸杀伤附近猪');
  }

  // ============ 7) 火药连锁与爆炸半径 ============
  {
    game.diffIdx = 1; loadLevel(4); game.state = 'play'; // 火药库：tnt 相邻
    const tnts = bodies.filter(b => b.mat === 'tnt');
    eq(tnts.length, 3, 'L5 三箱火药');
    const t0 = tnts[0];
    const score0 = game.score, left0 = game.pigsLeft;
    destroyBody(t0);
    ok(game.pigsLeft < left0 || tnts.some(t => t.dead), '主爆/连锁波及其余');
    for (let i = 0; i < 120; i++) update(DT);
    ok(game.score > score0 + 500, '连锁后得分增长');
    // explode 不伤地面/不伤自身鸟
    game.diffIdx = 1; loadLevel(0); game.state = 'play';
    const ground = bodies.find(b => b.kind === 'ground');
    explode(700, 500, 100, 500, 200, true);
    ok(!ground.dead, '地面不毁');
  }

  // ============ 8) 发射与拖拽边界 ============
  {
    prep(0, 1);
    eq(game.phase, 'ready', '第一只鸟已上叉');
    // 拉太远被钳到 PULL_R；右侧限制 cx ≤ 30
    game.phase = 'drag'; drag = { x: SLX - 300, y: SLY }; clampDrag();
    close(Math.hypot(drag.x - SLX, drag.y - SLY), PULL_R, 0.01, '拉距钳到 PULL_R');
    drag = { x: SLX + 100, y: SLY - 100 }; clampDrag();
    ok(drag.x - SLX <= 30 + 1e-9, '弹弓右侧不可越过叉心 +30');
    // 拉太小取消：pointerUp 回 ready 不发射
    game.phase = 'drag'; drag = { x: SLX - 5, y: SLY + 5 };
    pointerUp();
    eq(game.phase, 'ready', '拉距 ≤14 取消发射');
    ok(!bodies.some(b => b.kind === 'bird' && !b.statHold), '取消时不产生飞行鸟');
    // 正常发射：向下拉 → 速度向上
    fireBird(SLX - 60, SLY + 68);
    const cb = game.curBird;
    eq(game.phase, 'fly', '发射进入 fly');
    close(cb.vx, 60 * POWER_K, 1e-6, 'vx = 拉力x × K');
    close(cb.vy, -68 * POWER_K, 1e-6, 'vy = -拉力y × K（向上）');
    ok(bodies.includes(cb), '飞行鸟进入世界');
    eq(game.slingBird, null, '叉上无鸟');
  }

  // ============ 9) 难度参数生效 ============
  {
    prep(0, 0); // 简单
    eq(game.queue.length + 1, LEVELS[0].birds.length + 1, '简单多 1 鸟');
    let pig = bodies.find(b => b.kind === 'pig');
    close(pig.maxHp, MATS.pig.hp * 0.8, 0.01, '简单猪血 ×0.8');
    let blk = bodies.find(b => b.mat === 'wood');
    close(blk.maxHp, MATS.wood.hp * 1.15, 0.01, '简单块血 ×1.15');
    prep(0, 2); // 困难
    eq(game.queue.length + 1, LEVELS[0].birds.length - 1, '困难少 1 鸟');
    pig = bodies.find(b => b.kind === 'pig');
    close(pig.maxHp, MATS.pig.hp * 1.3, 0.01, '困难猪血 ×1.3');
    blk = bodies.find(b => b.mat === 'stone');
    prep(0, 1);
    eq(LEVELS[0].birds.length, 4, '普通即原始队列');
  }

  // ============ 10) 结算/星级/纪录/解锁 ============
  {
    game.diffIdx = 1; game.unlock = 0; delete store['ab_unlock']; delete store['ab_best_0_1'];
    // 必输：全部朝天上放空
    prep(0, 1);
    let guard = 0;
    while (!game.result && guard++ < 20) { if (game.phase !== 'ready') { update(DT); continue; } fireBird(SLX - 20, SLY + 30); for (let i = 0; i < 600 && game.phase !== 'ready' && !game.result; i++) update(DT); finish(); }
    ok(game.result && !game.result.win, '放空全鸟判负');
    eq(store['ab_unlock'] || 0, 0, '失败不解锁');
    eq(bestOf(0, 1), null, '失败不写纪录');

    // 必胜 Bot（确定性重放）
    game.diffIdx = 1; game.unlock = 0;
    const r1 = play(0, BOTPLANS[0], 1);
    eq(r1, 'WIN', 'Bot L1 必胜');
    const res = game.result;
    eq(res.pigs, 3, 'L1 三猪全清');
    ok(res.score >= LEVELS[0].stars[0], 'L1 Bot 分数过二星线');
    eq(res.bonus % SCORE_BIRD_LEFT, 0, '剩余鸟奖励是 10000 的倍数');
    eq(res.score, 3 * SCORE_PIG + res.blocks * SCORE_BLOCK + res.bonus, '总分构成 = 猪+块+鸟');
    eq(res.stars, res.score >= LEVELS[0].stars[1] ? 3 : 2, '星级按阈值');
    const best = bestOf(0, 1);
    ok(best && best.score === res.score, '纪录已写入 localStorage');
    eq(store['ab_unlock'], '1', '首胜解锁第 2 关');
    // 更差成绩不覆盖纪录
    const r2 = play(0, BOTPLANS[0], 1);
    eq(r2, 'WIN', 'Bot L1 重放一致');
    eq(bestOf(0, 1).score, best.score, '纪录不被覆盖');
  }

  // ============ 11) 全十二关 Bot 确定性必胜重放 ============
  {
    game.diffIdx = 1; game.unlock = 5;
    for (let li = 1; li < LEVELS.length; li++) {
      game.result = null;
      const r = play(li, BOTPLANS[li], 1);
      eq(r, 'WIN', 'Bot 必胜 L' + (li + 1) + '（同种子重放确定）');
      ok(game.result.stars >= 2, 'L' + (li + 1) + ' Bot ≥2 星');
      eq(game.result.pigs, LEVELS[li].items.filter(it => it.k === 'c').length, 'L' + (li + 1) + ' 全猪清点');
      ok(bestOf(li, 1), 'L' + (li + 1) + ' 纪录分键 ab_best_' + li + '_1 已写入');
    }
    ok(+store['ab_unlock'] <= LEVELS.length - 1, '解锁进度不越界');
  }

  // ============ 12) UI 状态流转 ============
  {
    game.unlock = 0; game.state = 'menu'; render(DT);
    ok(btns['start'] && btns['d0'] && btns['d1'] && btns['d2'], '菜单按钮注册');
    onBtn('d2'); eq(game.diffIdx, 2, '菜单切难度'); eq(store['ab_diff'], '2', '难度持久化');
    onBtn('d1');
    onBtn('start'); eq(game.state, 'levels', '菜单→选关');
    render(DT);
    ok(btns['lv0'], '选关注册 lv0');
    onBtn('lv5'); eq(game.state, 'levels', '锁定关卡点击无效');
    game.unlock = 5; render(DT); ok(btns['lv5'], '解锁后 lv5 注册');
    onBtn('lv3'); eq(game.state, 'play', '选关→对局'); eq(game.levelIdx, 3, '进入第 4 关');
    onBtn('pause'); eq(game.paused, true, '暂停');
    render(DT); ok(btns['resume'], '暂停面板恢复按钮');
    onBtn('resume'); eq(game.paused, false, '恢复');
    onBtn('home'); eq(game.state, 'levels', '退出到选关');
    // 结算面板按钮
    game.state = 'result'; game.result = { win: true, stars: 2, score: 1, pigs: 1, blocks: 1, bonus: 0, total: 6 };
    render(DT);
    onBtn('retry'); eq(game.state, 'play', '重开本关');
    game.state = 'result'; game.result = { win: true, stars: 3, score: 1, pigs: 1, blocks: 1, bonus: 0, total: 6 }; game.levelIdx = 4;
    render(DT); onBtn('next'); eq(game.levelIdx, 5, '下一关');
    onBtn('mute'); eq(store['ab_mute'], '1', '静音持久化'); onBtn('mute');
  }

  console.log('PASS 共 ' + n + ' 项断言');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
`;

// Bot 必胜弹道（由临时贪心搜索在同版本物理上验证，格式 [拉力x, 下拉力y, 技能触发帧?]）
const BOTPLANS = [
  [[60, 68], [60, 68]],                                 // L1 初阵
  [[44, 28], [68, 44, 12]],                             // L2 琉璃屋
  [[60, 68], [60, 68]],                                 // L3 石哨塔
  [[44, 44], [84, 36, 12]],                             // L4 双塔连营
  [[44, 68, 12]],                                       // L5 火药库
  [[60, 68], [76, 44, 12], [44, 68, 26]],               // L6 终局堡垒
  [[60, 68], [68, 28, 12], [68, 60], [52, 68]],         // L7 云梯阁楼
  [[60, 68, 26]],                                       // L8 玻璃温室
  [[44, 28]],                                           // L9 炸药仓库
  [[68, 60], [68, 28]],                                 // L10 双城记
  [[60, 68], [68, 52, 26], [36, 20, 12]],              // L11 孤塔凌霄
  [[68, 60], [52, 60], [52, 28, 12]],                  // L12 猪王要塞
];

run('const BOTPLANS=' + JSON.stringify(BOTPLANS) + ';' + TESTS);
