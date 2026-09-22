// 无头逻辑仿真：桩掉 DOM/Canvas，让 4 个 AI 自动对局直到分出胜负
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/startGame\(1\);\s*requestAnimationFrame\(render\);?\s*$/, '');

// ---- 桩 ----
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return () => ({ width: 10 });
  return typeof k === 'string' ? (...a) => undefined : undefined;
}, set: () => true });
function makeEl(id) {
  return {
    id, style: { setProperty: noop }, classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, insertAdjacentHTML: noop, appendChild: noop,
    set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
    textContent: '', children: [], dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 660, height: 660 }),
    getContext: () => ctxStub, width: 660, height: 660,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => [], addEventListener: noop,
  createElement: () => makeEl('tmp'),
};
global.window = {};
global.requestAnimationFrame = noop;

// 加速所有定时器
const realST = setTimeout;
global.setTimeout = (fn, ms) => realST(fn, 0);

eval(src + `
;(async () => {
  // ---- 几何自检 ----
  const adj = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  if (RING.length !== 56) throw new Error('主航道应为 56 格，实为 ' + RING.length);
  for (let i = 0; i < 56; i++) if (!adj(RING[i], RING[(i + 1) % 56])) throw new Error('主航道断裂 @' + i + ' ' + RING[i] + '→' + RING[(i+1)%56]);
  const seen = new Set(RING.map(cell => cell.join(',')));
  if (seen.size !== 56) throw new Error('主航道有重复格');
  for (let c = 0; c < 4; c++) {
    const tip = RING[(COLORS[c].start + 6) % 56];           // 本臂臂尖（第二次经过时入超）
    if (!adj(tip, LANES[c][0])) throw new Error('臂尖与航道口不相邻 c=' + c);
    const le = LANES[c][4]; // 末格应紧贴中心 3×3 块（行/列 6..8）
    const near = adj(le, [6, 7]) || adj(le, [8, 7]) || adj(le, [7, 6]) || adj(le, [7, 8]);
    if (!near) throw new Error('航道末格不邻中心块 c=' + c);
    for (const cell of LANES[c]) {
      const k = cell.join(',');
      if (seen.has(k)) throw new Error('航道与主航道重叠 ' + k);
      if (cell[0] === 0 || cell[1] === 0 || cell[0] === 14 || cell[1] === 14) throw new Error('航道越界');
    }
  }
  const all = new Set([...seen, ...LANES.flat().map(x => x.join(','))]);
  if (all.size !== 56 + 20) throw new Error('航道互权重叠检查失败');
  console.log('几何自检通过：56 格闭环、4 条 5 格航道臂尖入超且直抵中心');

  // ---- 全 AI 对局 ----
  startGame(0);
  let turns = 0, guard = 0;
  const t0 = Date.now();
  const done = await new Promise(resolve => {
    const iv = realST; // poll
    (async () => {
      while (S.winner < 0 && guard++ < 20000) {
        await new Promise(r => realST(r, 1));
        if (S.phase === 'idle' && S.winner < 0) { await startRoll(); turns++; }
      }
      resolve(S.winner);
    })();
  });
  if (S.winner < 0) throw new Error('对局未在上限内结束（可能死循环）');
  const arr = [0,1,2,3].map(c => arrivedCount(c));
  console.log('AI 对局结束，冠军颜色 idx=' + S.winner + '，回合数=' + turns + '，用时' + (Date.now()-t0) + 'ms，各方到达数=' + arr);
  if (arr[S.winner] !== 4) throw new Error('胜利判定异常');
  for (const grp of S.pieces) for (const p of grp) if (!(p.r >= -1 && p.r <= 68)) throw new Error('非法位置 ' + p.r);
  console.log('ALL PASS');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
`);
