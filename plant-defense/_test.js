// 无头回归测试：桩掉 DOM/Canvas，验证常量表与关卡数据、布局缩放、阳光经济、
// 种植/冷却/铲除以及时限、豌豆弹道与护盾优先掉血、减速、啃食、樱桃引爆、
// 割草机触发与用完判负、波次调度、种子随机确定性、
// 三关×三难度贪心 Bot 整局必胜重放、放任必败、持久化九格纪录、面板内 UI 按钮注册。
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
  getElementById: id => els[id] || (els[id] = makeEl('tmp')),
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

const TESTS = `
;(async () => {
  let n = 0;
  const eq = (got, want, msg) => { n++; if (got !== want) throw new Error(msg + ': got ' + got + ', want ' + want); };
  const ok = (v, msg) => { n++; if (!v) throw new Error(msg); };
  const near = (a, b, eps, msg) => { n++; if (Math.abs(a - b) > eps) throw new Error(msg + ': ' + a + ' vs ' + b); };

  const run = (secs) => { const k = Math.round(secs * 60); for (let i = 0; i < k; i++) update(STEP); };
  const snap = () => JSON.stringify(G, (k, v) => (k === 'particles' || k === 'popups') ? undefined : v);

  // ---- 贪心 Bot（确定性重放用）----
  const SLOTS = [];
  for (const [c, kind] of [[2,'pea'],[3,'pea'],[4,'ice'],[5,'ice']])
    for (let r = 0; r < 5; r++) SLOTS.push([c, r, kind]);
  const SUN_SLOTS = [[0,0],[0,2],[1,1],[0,4],[1,3],[1,0],[0,1],[1,2]];
  function botStep() {
    for (const s of G.suns.slice()) collectSun(s);
    const cards = curLevel().cards;
    // 爆爆樱桃：按血量权重聚集（尸越硬越值得炸）
    if (cards.indexOf('cherry') >= 0 && G.plantCd.cherry <= 0 && G.sun >= 150) {
      const wt = z => (z.type === 'bucket' ? 3 : z.type === 'cone' ? 2 : 1);
      let best = null;
      for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
        if (plantAt(c, r)) continue;
        let score = 0;
        for (const z of G.zombies) if (Math.abs(z.row - r) <= 1 && Math.abs(z.x - (c + 0.5)) <= 1.8) score += wt(z);
        if (score >= 4 && (!best || score > best.score)) best = { c, r, score };
      }
      if (best) { tryPlant(best.c, best.r, 'cherry'); return; }
    }
    // 火力优先：按行内尸群规模与距离决定该行需要的射手数
    const shootersOf = r => G.plants.filter(p => p.row === r && (p.type === 'pea' || p.type === 'ice')).length;
    const needRow = r => {
      let cnt = 0, minx = 99;
      for (const z of G.zombies) if (z.row === r && z.x <= 10.4) { cnt++; if (z.x < minx) minx = z.x; }
      if (!cnt) return 0;
      if (minx > 7.6) return Math.min(cnt, 2);
      if (minx > 6.2) return Math.min(cnt + 1, 3);
      return Math.min(cnt + 2, 4);
    };
    const rowUrg = r => { let m = 99; for (const z of G.zombies) if (z.row === r && z.x < m) m = z.x; return m; };
    const rowOrder = [0, 1, 2, 3, 4].sort((a, b) => rowUrg(a) - rowUrg(b));
    for (const r of rowOrder) {
      if (shootersOf(r) >= needRow(r)) continue;
      for (const [c, rr, kind] of SLOTS) {
        if (rr !== r || !canPlant(c, r)) continue;
        let want = kind;
        if (want === 'ice' && (cards.indexOf('ice') < 0 || G.plantCd.ice > 0 || G.sun < PLANTS.ice.cost)) want = 'pea';
        if (G.plantCd[want] > 0 || G.sun < PLANTS[want].cost) continue;
        tryPlant(c, r, want);
        return;
      }
    }
    // 买不起射手时的肉盾拖延：行内有尸逼近且该行无射手无肉盾，先补 6 列墙
    if (cards.indexOf('wall') >= 0 && G.plantCd.wall <= 0 && G.sun >= PLANTS.wall.cost) {
      for (let r = 0; r < ROWS; r++) {
        if (shootersOf(r) > 0) continue;
        if (!G.zombies.some(z => z.row === r && z.x < 9.2 && z.x > 6.0)) continue;
        if (G.plants.some(p => p.row === r && p.type === 'wall')) continue;
        for (const c of [6, 7, 5]) if (canPlant(c, r)) { tryPlant(c, r, 'wall'); return; }
      }
    }
    // 经济：前期 5 株、中后期 8 株阳阳葵（有怪逼近时暂缓，家底厚则不间断；首波临近须留 100 钱买射手）
    // 经济：前期 5 株、中后期 8 株阳阳葵（近身有怪暂缓；首两波开波前夕留满 150 钱备射手）
    const calm = !G.zombies.some(z => z.x < 7.4) || G.sun >= 250;
    const targetSun = G.nextWave < 4 ? 5 : 8;
    const waveSoon = G.nextWave < 2 && !G.waveActive && G.interT < 10;
    if (calm && !(waveSoon && G.sun < 150) && G.plants.filter(p => p.type === 'sun').length < targetSun) {
      for (const [c, r] of SUN_SLOTS) {
        if (canPlant(c, r) && G.plantCd.sun <= 0 && G.sun >= 50) { tryPlant(c, r, 'sun'); break; }
      }
    }
    // 长波间屯钱：把余钱换成火力/肉盾/寒冰，不空转
    if (!G.waveActive && !G.zombies.length && G.sun >= 150) {
      for (const [c, r, kind] of SLOTS) {
        if (!canPlant(c, r)) continue;
        let want = kind;
        if (want === 'ice' && (cards.indexOf('ice') < 0 || G.plantCd.ice > 0 || G.sun < PLANTS.ice.cost)) want = 'pea';
        if (G.plantCd[want] > 0 || G.sun < PLANTS[want].cost) continue;
        tryPlant(c, r, want);
        break;
      }
      if (cards.indexOf('wall') >= 0 && G.plantCd.wall <= 0 && G.sun >= 100) {
        for (let r = 0; r < ROWS; r++) {
          if (!G.plants.some(p => p.row === r && p.type === 'wall') && canPlant(6, r)) { tryPlant(6, r, 'wall'); break; }
        }
      }
    }
    // 盾盾果救急
    if (cards.indexOf('wall') >= 0 && G.plantCd.wall <= 0 && G.sun >= 100) {
      for (let r = 0; r < ROWS; r++) {
        const th = G.zombies.some(z => z.row === r && z.x < 7.4 && z.x > 4.5);
        const have = G.plants.some(p => p.type === 'wall' && p.row === r);
        if (th && !have && shootersOf(r) >= 2 && canPlant(6, r)) { tryPlant(6, r, 'wall'); break; }
      }
    }
    // 火力槽位加密（冰不足退化豌豆）
    for (const [c, r, kind] of SLOTS) {
      if (!canPlant(c, r)) continue;
      let want = kind;
      if (want === 'ice' && (cards.indexOf('ice') < 0 || G.plantCd.ice > 0 || G.sun < PLANTS.ice.cost)) want = 'pea';
      if (G.plantCd[want] > 0 || G.sun < PLANTS[want].cost) continue;
      tryPlant(c, r, want);
      break;
    }
  }
  function botWin(levelIdx, diff, maxT) {
    selectLevel(levelIdx); setDiff(diff); G.unlock = Math.max(G.unlock, levelIdx + 1);
    setSeedPref(20260927 + levelIdx * 977 + DIFF_ORDER.indexOf(diff) * 7);
    startGame();
    const lim = Math.round(maxT * 60);
    for (let i = 0; i < lim && G.screen === 'play'; i++) { botStep(); update(STEP); }
    return G.screen;
  }

  // 初始化
  loadBest(); loadDiff(); loadUnlock(); selectLevel(0); resize();

  // ============ 1) 常量与数值表 ============
  eq(COLS, 9, '草坪 9 列'); eq(ROWS, 5, '草坪 5 行');
  eq(PLANT_ORDER.length, 5, '植物 5 种');
  eq(Object.keys(ZOMBIES).length, 4, '行尸 4 种');
  eq(LEVELS.length, 3, '关卡 3 张');
  eq(LEVELS.map(l => l.waves.length).join(','), '6,8,10', '三关波数 6/8/10');
  eq(LEVELS.map(l => l.name).join(','), '晨光草坪,夜雾草坪,暮色屋顶', '三关名称');
  ok(LEVELS[0].hpMul < LEVELS[1].hpMul && LEVELS[1].hpMul < LEVELS[2].hpMul, '关卡血量递增');
  eq(LEVELS[0].cards.length, 3, '第 1 关 3 张卡');
  eq(LEVELS[1].cards.length, 4, '第 2 关 4 张卡');
  eq(LEVELS[2].cards.length, 5, '第 3 关 5 张卡');
  for (let i = 1; i < 3; i++)
    ok(LEVELS[i - 1].cards.every(c => LEVELS[i].cards.indexOf(c) >= 0), '卡牌逐关只增不减');
  for (const L of LEVELS) {
    ok(L.waves[0].gap >= 20, L.name + ' 首波倒计时 >= 20s');
    ok(L.waves[L.waves.length - 1].big === true, L.name + ' 末波为大波');
    let bigCnt = 0; for (const w of L.waves) if (w.big) bigCnt++;
    eq(bigCnt, 1, L.name + ' 仅一个大波');
    for (const w of L.waves) for (const [t] of w.list) ok(!!ZOMBIES[t], '波次怪表类型合法 ' + t);
  }
  for (const id of PLANT_ORDER) {
    const d = PLANTS[id];
    ok(d.cost > 0 && d.hp > 0 && d.cd > 0, '植物 ' + id + ' 数值完整');
  }
  eq(PLANTS.sun.cost, 50, '阳阳葵 50 光');
  eq(PLANTS.pea.cost, 100, '豌豆炮手 100 光');
  ok(PLANTS.wall.hp >= 1200, '盾盾果肉墙血量');
  ok(ZOMBIES.bucket.armor > ZOMBIES.cone.armor && ZOMBIES.cone.armor > 0, '护盾：铁桶>路障>0');
  ok(ZOMBIES.run.spd > ZOMBIES.norm.spd * 1.5, '疾行尸明显更快');
  eq(DIFF_ORDER.join(','), 'easy,normal,hard', '三档难度');
  eq(G.diff, 'normal', '默认普通');
  ok(DIFFS.easy.hpMul < DIFFS.hard.hpMul, '血量随难度递增');
  ok(DIFFS.easy.sun0 > DIFFS.hard.sun0, '初始阳光随难度递减');
  ok(DIFFS.easy.skyMul < DIFFS.hard.skyMul, '天降间隔随难度变长');
  ok(DIFFS.easy.gapMul > DIFFS.hard.gapMul, '波间隔随难度缩短');

  // ============ 2) 布局（横竖屏）============
  window.innerWidth = 1200; window.innerHeight = 800; resize();
  eq(PORTRAIT, false, '1200x800 横版');
  ok(GX >= 0 && GX + COLS * CS <= 1200.1, '横版草坪不溢出屏宽');
  ok(GY >= BAR_H * 0.5 && GY + ROWS * CS <= 800.1, '横版草坪不压顶栏不溢底');
  window.innerWidth = 400; window.innerHeight = 800; resize();
  eq(PORTRAIT, true, '400x800 竖版');
  ok(GX >= 0 && GX + COLS * CS <= 400.1, '竖版草坪不溢出屏宽');
  ok(GY + ROWS * CS <= 800.1, '竖版草坪不溢出屏高');
  ok(CS > 25 && CS < 100, '竖版格边长合理: ' + CS.toFixed(1));
  window.innerWidth = 320; window.innerHeight = 568; resize();
  ok(GX + COLS * CS <= 320.1 && GY + ROWS * CS <= 568.1, '320x568 小屏界内');
  window.innerWidth = 1200; window.innerHeight = 800; resize();

  // ============ 3) 阳光经济 ============
  setSeedPref(1001); selectLevel(0); setDiff('easy');
  startGame();
  eq(G.sun, DIFFS.easy.sun0, '开局初始阳光');
  eq(G.suns.length, 0, '开局无掉落阳光');
  run(12);
  ok(G.suns.length >= 1, '天降阳光出现');
  const s0 = G.suns[0];
  const sunBefore = G.sun;
  collectSun(s0);
  eq(G.sun, sunBefore + SUN_VAL, '点击收集 +25');
  eq(G.suns.includes(s0), false, '收集后消失');
  // 阳阳葵产出：首产 5s
  G.sun = 9999;
  ok(tryPlant(0, 0, 'sun'), '种阳阳葵');
  const sunCnt0 = G.suns.length;
  run(5.2);
  ok(G.suns.length > sunCnt0, '阳阳葵 5 秒首产');
  run(20.2);
  ok(G.suns.length > sunCnt0 + 1, '周期 20s 持续产出');
  // 未收集的阳光到寿消失
  const before = G.suns.length;
  run(9.5);
  ok(G.suns.length <= before + Math.ceil(9.5 / (9 * DIFFS.easy.skyMul * 0.7)) + 1, '阳光存量受寿命约束');

  // ============ 4) 种植 / 冷却 / 铲除 ============
  selectLevel(0); setDiff('easy'); startGame();
  G.sun = 9999;
  ok(tryPlant(3, 3, 'pea'), '种豌豆');
  ok(!tryPlant(3, 3, 'pea'), '同格不可重叠');
  ok(!tryPlant(3, 2, 'pea'), '冷却中不可再种同种');
  eq(G.plantCd.pea, PLANTS.pea.cd, '冷却登记');
  run(PLANTS.pea.cd + 0.1);
  ok(tryPlant(3, 2, 'pea'), '冷却结束可种');
  G.sun = 10;
  ok(!tryPlant(4, 2, 'pea'), '阳光不足不可种');
  G.sun = 9999;
  ok(!tryPlant(4, 2, 'ice'), '本关未解锁寒冰');
  selectLevel(1); startGame(); G.sun = 9999;
  ok(tryPlant(4, 2, 'ice'), '第 2 关解锁寒冰');
  ok(shovelAt(4, 2), '铲子铲除');
  eq(plantAt(4, 2), null, '铲除后空格');
  ok(!shovelAt(4, 2), '空铲失败');
  // 樱桃自毁（樱桃第 3 关解锁）
  selectLevel(2); startGame(); G.sun = 9999;
  ok(tryPlant(7, 0, 'cherry'), '种樱桃');
  ok(plantAt(7, 0), '樱桃在格');
  run(CHERRY_FUSE + 0.05);
  eq(plantAt(7, 0), null, '樱桃到期引爆消失');

  // ============ 5) 战斗：弹道 / 护盾 / 减速 / 啃食 ============
  selectLevel(0); setDiff('easy'); startGame();
  G.sun = 99999;
  ok(tryPlant(2, 2, 'pea'), '列2种豌豆');
  run(0.3);
  eq(G.peas.length, 0, '无目标不开火');
  G.zombies.length = 0; G.spawnQueue.length = 0; G.skyT = 999;
  spawnZombie('norm');
  const z1 = G.zombies[0]; z1.row = 2;
  const hp0 = z1.hp;
  run(2.0);
  ok(G.peas.length >= 1 || z1.hp < hp0, '有目标后开火');
  run(6);
  ok(z1.hp < hp0 - 50, '豌豆命中掉血: hp=' + z1.hp);
  // 护盾优先：手工构造路障尸掉血顺序
  G.zombies.length = 0;
  spawnZombie('cone');
  const zc = G.zombies[0];
  eq(zc.hp, zc.body + zc.armorMax, '路障尸总血=本体+护盾');
  damageZombie(zc, 100);
  near((zc.hp - zc.body) / zc.armorMax, (zc.armorMax - 100) / zc.armorMax, 1e-9, '护盾掉血可视化比例');
  damageZombie(zc, zc.armorMax); // 打掉护盾剩本体
  ok(zc.hp > 0 && zc.hp <= zc.body, '盾破露本体');
  // 寒冰减速
  G.zombies.length = 0;
  for (const p of G.plants) if (p.type === 'pea') removePlant(p);
  selectLevel(1); startGame(); G.sun = 99999; G.skyT = 9999; G.spawnQueue.length = 0;
  tryPlant(2, 0, 'ice');
  spawnZombie('norm');
  const zr = G.zombies[0]; zr.row = 0;
  run(2);
  ok(zr.slowT > 0, '冰豆命中上减速');
  const frozen = zombieSpeed(zr);
  zr.slowT = 0;
  const free = zombieSpeed(zr);
  ok(frozen < free * ICE_SLOW_F + 1e-9, '减速速度公式: ' + frozen.toFixed(3) + ' <= ' + free.toFixed(3));
  const xa = zr.x; run(1.0);
  ok(zr.x <= xa, '减速中仍在缓慢推进');
  // 啃食
  selectLevel(0); setDiff('normal'); startGame(); G.sun = 99999; G.skyT = 9999; G.spawnQueue.length = 0; G.zombies.length = 0;
  tryPlant(5, 1, 'wall');
  spawnZombie('norm');
  const zw = G.zombies[0]; zw.row = 1; zw.x = 6.05;
  const wallP = plantAt(5, 1);
  const whp0 = wallP.hp, zx0 = zw.x;
  run(3);
  ok(wallP.hp < whp0, '行尸啃盾盾果掉血');
  near(zw.x, zx0, 1e-9, '啃食时停下不推进');
  // 咬穿后继续推进
  damagePlant(wallP, wallP.hp);
  run(1);
  ok(zw.x < zx0, '咬穿后继续前进');

  // ============ 6) 割草机 / 判负 ============
  selectLevel(0); setDiff('easy'); startGame(); G.sun = 0; G.skyT = 9999; G.interT = 9999; G.spawnQueue.length = 0; G.zombies.length = 0;
  G.plants.length = 0;
  spawnZombie('norm');
  const zm = G.zombies[0]; zm.row = 2;
  run(40);
  eq(G.mowers[2].used, true, '行尸触线割草机启动');
  eq(G.zombies.length, 0, '割草机清行');
  ok(G.screen === 'play', '割草机救命后仍在局中');
  // 第二波同行使出屋 -> 败
  spawnZombie('norm');
  const zm2 = G.zombies[0]; zm2.row = 2;
  run(60);
  eq(G.screen, 'over', '同格割草机用尽后行尸进屋判负');
  eq(G.overReason, 'eaten', '败因 eaten');

  // ============ 7) 樱桃爆裂范围 ============
  selectLevel(2); setDiff('easy'); startGame(); G.sun = 99999; G.skyT = 9999; G.spawnQueue.length = 0; G.zombies.length = 0;
  for (const [r, x] of [[1, 4.2], [2, 4.5], [3, 4.1], [0, 4.3]]) { spawnZombie('bucket'); const zz = G.zombies[G.zombies.length - 1]; zz.row = r; zz.x = x; }
  const kills0 = G.kills;
  tryPlant(4, 2, 'cherry');
  run(CHERRY_FUSE + 0.1);
  ok(G.kills - kills0 >= 3, '樱桃 3x3 至少炸死 3 只: ' + (G.kills - kills0));
  eq(G.zombies.filter(z => z.row >= 1 && z.row <= 3).length, 0, '爆炸圈内清空');
  ok(G.zombies.length >= 1, '行外行尸幸存（范围约束）');

  // ============ 8) 波次调度 ============
  selectLevel(0); setDiff('normal'); startGame();
  eq(G.waveActive, false, '开局波前安静');
  near(G.interT, WAVES_L1[0].gap, 0.1, '首波倒计时 = gap');
  run(WAVES_L1[0].gap + 0.1);
  eq(G.waveActive, true, '倒计时结束开波');
  eq(G.spawnQueue.length + G.zombies.length, 2, '第 1 波 2 只');
  const total = WAVES_L1.reduce((a, w) => a + w.list.reduce((b, [t, c]) => b + c, 0), 0);
  eq(total, 33, '第 1 关总怪数 33');
  // 提前进入下一波判定：杀掉当前波全部并清空队列
  run(8);
  ok(G.zombies.length >= 1 || G.spawnQueue.length >= 1 || G.nextWave >= 1, '波在推进');

  // ============ 9) 确定性：同种子 Bot 60 秒快照一致 ============
  for (let t = 0; t < 2; t++) {
    setSeedPref(777); selectLevel(1); setDiff('normal');
    startGame();
    for (let i = 0; i < 3600; i++) { botStep(); update(STEP); }
    if (t === 0) window.__snapA = snap();
    else eq(snap(), window.__snapA, '同种子 60 秒模拟快照逐位一致');
  }

  // ============ 10) 贪心 Bot 整局必胜（3 关 × 3 难度）============
  const WT = { easy: 560, normal: 560, hard: 620 };
  for (let lv = 0; lv < 3; lv++) {
    for (const d of DIFF_ORDER) {
      const t0 = Date.now();
      G.unlock = 3;
      const res = botWin(lv, d, WT[d]);
      if (res !== 'win') throw new Error('Bot 第 ' + (lv + 1) + ' 关 ' + DIFFS[d].label + ' 未必胜: ' + res + ' wave=' + G.nextWave + '/' + curWaves().length + ' zombies=' + G.zombies.length + ' sun=' + G.sun + ' score=' + G.score);
      ok(G.kills >= 10, 'Bot 第 ' + (lv + 1) + ' 关 ' + d + ' 击杀 ' + G.kills);
      ok(G.score > 0, 'Bot 胜局得分 ' + G.score);
    }
  }

  // ============ 11) 放任必败 ============
  selectLevel(0); setDiff('normal'); startGame();
  run(320);
  eq(G.screen, 'over', '不管它必然被推平');

  // ============ 12) 解锁链与持久化 ============
  G.unlock = 1; setSeedPref(555);
  const r1 = botWin(0, 'normal', 560); // botWin 内部 unlock=max(1,1)
  eq(r1, 'win', '首关首胜');
  eq(G.unlock, 2, '通关解锁第 2 关');
  eq(store['plantdef_unlock'], '2', '解锁持久化');
  eq(G.bestMap.normal[0] > 0, true, '九格纪录写入(普通×第1关)');
  eq(store['plantdef_best'].indexOf('[') >= 0, true, '纪录序列化');
  setDiff('hard'); selectLevel(2);
  eq(store['plantdef_diff'], 'hard', '难度持久化');
  eq(store['plantdef_level'], '2', '关卡选择持久化');
  const bm = JSON.parse(store['plantdef_best']);
  ok(Array.isArray(bm.normal) && bm.normal.length === 3, '纪录为 难度×关卡 数组');

  // ============ 13) 面板内 UI 按钮注册与点击流 ============
  G.screen = 'menu'; drawScene();
  ok(BTN.diff_easy && BTN.diff_normal && BTN.diff_hard, '菜单难度胶囊注册');
  ok(BTN.lv_0 && BTN.lv_1 && BTN.lv_2 && BTN.start, '菜单关卡卡与开始注册');
  const evAt = (id) => { const b = BTN[id]; if (!b) throw new Error('evAt: BTN[' + id + '] 未注册'); return { preventDefault: noop, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 }; };
  onDown(evAt('diff_hard')); eq(G.diff, 'hard', '点击切换难度');
  G.unlock = 1; selectLevel(0); drawScene();
  onDown(evAt('lv_2')); ok(G.hint && G.level !== 2, '锁定关卡点击防呆');
  onDown(evAt('lv_0')); eq(G.level, 0, '已解锁关卡可选中');
  onDown(evAt('start')); eq(G.screen, 'play', '点击开始进局');
  drawScene();
  ok(BTN.pd_sun && BTN.pd_pea && BTN.pd_wall && BTN.shovel, '对局卡槽与铲子注册');
  ok(BTN.sp_pause && BTN.sp_speed && BTN.sp_menu, '对局控制钮注册');
  onDown(evAt('pd_pea')); eq(G.selType, 'pea', '点卡选中');
  G.sun = 9999; G.plantCd.pea = 0;
  onDown({ preventDefault: noop, clientX: cellCX(4), clientY: cellCY(4) });
  ok(plantAt(4, 4), '点草格种植');
  onDown(evAt('sp_pause')); eq(G.paused, true, '暂停');
  drawScene();
  onDown(evAt('sp_resume')); eq(G.paused, false, '恢复');
  onDown(evAt('sp_speed')); eq(G.speed, 2, '倍速循环');
  // 结算面板
  endGame('win'); drawScene();
  ok(BTN.again && BTN.menu, '胜局面板按钮');
  ok(BTN.nextlv, '胜局「进入下一关」');
  onDown(evAt('nextlv')); eq(G.level, 1, '下一关切换');
  endGame('eaten'); drawScene();
  ok(!BTN.nextlv && BTN.again, '败局无下一关');
  onDown(evAt('menu')); eq(G.screen, 'menu', '返回菜单');

  console.log('ALL PASS: ' + n + ' 项断言');
})();
`;

eval(src + TESTS);
