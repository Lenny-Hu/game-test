// 无头回归测试：桩掉 DOM/Canvas，验证规则引擎（perft 基准、特殊约束、绝杀）与 AI 完整对局
// 运行：node _test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

// ---- DOM / 环境桩 ----
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : (...a) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : undefined)),
  set: () => true,
});
function makeEl(id) {
  return {
    id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, setAttribute: noop,
    textContent: '', dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1180, height: 790 }),
    getContext: () => ctxStub, width: 1180, height: 790,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('tmp'),
};
global.window = { devicePixelRatio: 1 };
global.devicePixelRatio = 1;
global.requestAnimationFrame = noop;
if (typeof performance === 'undefined') global.performance = require('perf_hooks').performance;

const run = (extra) => eval(src + extra);

const TESTS = `
;(async () => {
  const eq = (got, want, msg) => { if (got !== want) throw new Error(msg + ': got ' + got + ', want ' + want); };
  const b0 = newBoard();

  // 1) 初始局面合法性：32 子、双方将在位
  let cnt = 0; for (let i = 0; i < 90; i++) if (b0[i]) cnt++;
  eq(cnt, 32, '初始应 32 子');
  eq(kingSq(b0, true), S(4, 9), '红帅位置');
  eq(kingSq(b0, false), S(4, 0), '黑将位置');

  // 2) 特殊约束用例
  const mk = (list) => { const b = new Int8Array(90); for (const [f, r, p] of list) b[S(f, r)] = p; return b; };
  let b;
  // 蹩马腿：四个马腿全被堵则寸步难行
  b = mk([[4,4,HS],[4,3,BING],[4,5,BING],[3,4,BING],[5,4,BING],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(genPseudo(b, true).filter(m => m.from === S(4,4)).length, 0, '四面蹩马腿应封死马步');
  b = mk([[4,4,HS],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(genPseudo(b, true).filter(m => m.from === S(4,4)).length, 8, '无蹩时马可走 8 步');
  // 塞象眼 + 象不过河（角位象只有两个飞点，塞一对角线另一侧即剩一路）
  b = mk([[2,9,XI],[3,8,BING],[4,9,JZ],[4,0,JZ|BLK]]);
  const xiMoves = genPseudo(b, true).filter(m => m.from === S(2,9));
  eq(xiMoves.length, 1, '一侧象眼被塞仅剩一路');
  eq(xiMoves[0].to, S(0,7), '象只能飞本侧');
  // 炮隔子吃：无炮架不吃，有炮架跳吃
  b = mk([[0,4,PAO],[4,4,BING],[8,4,RK|BLK],[4,9,JZ],[4,0,JZ|BLK]]);
  const paoCaps = legalMoves(b, true).filter(m => m.from === S(0,4) && b[m.to]);
  eq(paoCaps.length, 1, '炮仅可隔一个炮架跳吃');
  eq(paoCaps[0].to, S(8,4), '炮跳吃目标为炮架后第一子');
  // 兵过河横移，未过河只进（2 路兵，4 路有仕做屏避免双王照面）
  b = mk([[2,5,BING],[4,8,SH],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(legalMoves(b, true).filter(m => m.from === S(2,5)).length, 1, '兵未过河只许直进');
  b = mk([[2,4,BING],[4,8,SH],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(legalMoves(b, true).filter(m => m.from === S(2,4)).length, 3, '兵过河可前及左右');
  // 白脸将：垫在双王连线上的仕不能离线
  b = mk([[4,8,SH],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(legalMoves(b, true).filter(m => m.from === S(4,8)).length, 0, '离线致双王照面应判非法');
  // 九宫限制：将在宫心 3 点、士在宫心 4 点（伪合法层面）
  b = mk([[4,9,JZ],[4,0,JZ|BLK]]);
  eq(genPseudo(b, true).filter(m => m.from === S(4,9)).length, 3, '帅在宫心可行 3 点');
  b = mk([[4,8,SH],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(genPseudo(b, true).filter(m => m.from === S(4,8)).length, 4, '仕在宫心可行 4 点');

  // 3) 将军与绝杀判定：双车错杀势（逃宫心被白脸将封死）
  b = mk([[0,0,RK],[5,5,RK],[4,9,JZ],[4,0,JZ|BLK]]);
  eq(inCheck(b, false), true, '黑将应处于被将军');
  eq(legalMoves(b, false).length, 0, '双车错应为绝杀（无合法应着）');

  // 4) 记谱：中文纵线号
  b = newBoard();
  const mC = legalMoves(b, true).find(m => m.from === S(7,7) && m.to === S(4,7));
  eq(notation(b, mC), '炮二平五', '记谱应为“炮二平五”');
  const mR = legalMoves(b, true).find(m => m.from === S(0,9) && m.to === S(0,8));
  eq(notation(b, mR), '車九進一', '记谱应为“車九進一”');
  const mH = legalMoves(b, false).find(m => m.from === S(7,0) && m.to === S(6,2));
  eq(notation(b, mH), '馬8進7', '黑方记谱用阿拉伯数字（纵线从左起 1-9）');

  // 5) perft 基准（初始局面合法着法树计数）
  eq(perft(newBoard(), true, 1), 44,   'perft(1)');
  eq(perft(newBoard(), true, 2), 1920, 'perft(2)');
  const t0 = Date.now();
  eq(perft(newBoard(), true, 3), 79666, 'perft(3)');
  console.log('perft(3) 用时 ' + (Date.now() - t0) + 'ms');

  // 6) AI：完整对局（快速档）——必须分出胜负或和棋，且终局合法
  BUDGET_PER_DEPTH = 15; MAX_DEPTH = 2;
  startMatch('demo');
  let steps = 0;
  while (!G.over && steps < 1500) {
    if (G.ai) aiStep();
    else if (seatOfTurn() === 'human') throw new Error('演示局出现人类回合');
    G.anim = null;
    steps++;
  }
  if (!G.over) throw new Error('对局未在 ' + steps + ' 步内结束');
  eq(kingSq(G.board, true) >= 0, true, '终局红帅缺失');
  eq(kingSq(G.board, false) >= 0, true, '终局黑将缺失');
  console.log('AI 演示局结束：' + steps + ' 步，结果 ' + G.over.kind +
    (G.over.red !== undefined ? ' ' + (G.over.red ? '红胜' : '黑胜') : '') + '，着法记录 ' + G.hist.length + ' 条');

  // 7) 悔棋：退一步后回合与子力复原
  startMatch('pvp');
  const before = Array.from(G.board);
  const mv = legalMoves(G.board, true)[0];
  applyMove(mv);
  eq(G.turn, false, '走子后应轮到对方');
  doUndo();
  eq(G.turn, true, '悔棋后应回到走子方回合');
  eq(Array.from(G.board).join(',') === before.join(','), true, '悔棋应完全复原盘面');
  eq(G.hist.length, 0, '悔棋后记录清空');
  console.log('悔棋复原校验通过');

  console.log('ALL PASS');
})().catch(e => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
`;

run(TESTS);
