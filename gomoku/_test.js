// 无头回归测试：桩掉 DOM/Canvas，验证规则引擎（四方向胜判、候选生成）与三档 AI（直胜/封堵/超时）
// 运行：node _test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
src = src.split('/* ----TESTS---- */')[0];
src = src.replace(/init\(\);\s*\n?requestAnimationFrame\(frame\);\s*$/, '');

// ---- DOM / 环境桩 ----
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient')
      ? () => ({ addColorStop: noop })
      : noop),
  set: () => true,
});
function makeEl(id) {
  return {
    id, style: {}, classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, setAttribute: noop,
    textContent: '', dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 700 }),
    getContext: () => ctxStub, width: 400, height: 700,
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => [], addEventListener: noop, createElement: () => makeEl('tmp'),
};
global.window = { devicePixelRatio: 1, addEventListener: noop, innerWidth: 400, innerHeight: 700 };
global.localStorage = { getItem: () => null, setItem: noop };
if (typeof performance === 'undefined') global.performance = require('perf_hooks').performance;

const TESTS = `
;(async () => {
  let pass = 0, fail = 0;
  const ok = (cond, msg) => {
    if (cond) { pass++; console.log('  ✓ ' + msg); }
    else { fail++; console.error('  ✗ ' + msg); }
  };
  const eq = (got, want, msg) => ok(got === want, msg + (got === want ? '' : '（got ' + got + ', want ' + want + '）'));

  const put = (bd, x, y, p) => { bd[gi(x, y)] = p; };
  const row = (bd, p, y, x0, n) => { for (let i = 0; i < n; i++) put(bd, x0 + i, y, p); };

  console.log('== 规则引擎 ==');
  // 1) 四方向胜判
  let bd = makeBoard();
  row(bd, BLACK, 7, 3, 4); put(bd, 7, 7, BLACK);
  ok(checkWinAt(bd, 7, 7), '横向五连判胜');
  bd = makeBoard();
  for (let i = 0; i < 4; i++) put(bd, 5, 3 + i, WHITE); put(bd, 5, 7, WHITE);
  ok(checkWinAt(bd, 5, 7), '纵向五连判胜');
  bd = makeBoard();
  for (let i = 0; i < 4; i++) put(bd, 2 + i, 2 + i, BLACK); put(bd, 6, 6, BLACK);
  eq(checkWinAt(bd, 6, 6).cells.length, 5, '主斜五连判胜');
  bd = makeBoard();
  for (let i = 0; i < 4; i++) put(bd, 8 - i, 2 + i, WHITE); put(bd, 4, 6, WHITE);
  ok(checkWinAt(bd, 4, 6), '副斜五连判胜');
  bd = makeBoard();
  row(bd, BLACK, 7, 3, 3); put(bd, 7, 7, BLACK);
  eq(checkWinAt(bd, 7, 7), null, '断线四子不判胜');
  bd = makeBoard();
  row(bd, BLACK, 7, 3, 4);
  eq(checkWinAt(bd, 6, 7), null, '连四不判胜');
  // 跨界边界
  bd = makeBoard();
  row(bd, WHITE, 0, 0, 4); put(bd, 4, 0, WHITE);
  ok(checkWinAt(bd, 4, 0), '边缘五连判胜');

  console.log('== 候选生成 ==');
  bd = makeBoard();
  let c = genCandidates(bd);
  eq(c.length, 1, '空盘仅一天元候选');
  eq(c[0][0] + ',' + c[0][1], '7,7', '天元为 (7,7)');
  put(bd, 7, 7, BLACK);
  c = genCandidates(bd);
  ok(c.every(([x, y]) => !bd[gi(x, y)] && Math.max(Math.abs(x - 7), Math.abs(y - 7)) <= 2 && !(x === 7 && y === 7)), '候选均为邻域空位');
  eq(c.length, 24, '天元邻域 2 圈内 24 个空位');

  console.log('== AI（棋型与决策） ==');
  const lineSc = (b, x, y, p) => lineScore(b, x, y, p, 1, 0, false);
  bd = makeBoard();
  row(bd, BLACK, 7, 4, 3);
  ok(lineSc(bd, 7, 7, BLACK) >= 1000000, '三子后落子成活四计高分');
  ok(lineSc(bd, 3, 7, BLACK) >= 60000, '三子后延伸端成活三计分');
  // 简单档：能成五就成五
  bd = makeBoard();
  row(bd, BLACK, 7, 4, 4); row(bd, WHITE, 5, 2, 2);
  let mv = aiBestMove(bd, BLACK, 0);
  ok((mv.x === 3 || mv.x === 8) && mv.y === 7, '简单档抓即 win 五点 ' + mv.x + ',' + mv.y);
  // 普通档：对方活四必堵
  bd = makeBoard();
  row(bd, WHITE, 7, 5, 4); put(bd, 2, 2, BLACK);
  mv = aiBestMove(bd, BLACK, 1);
  ok((mv.x === 4 || mv.x === 9) && mv.y === 7, '普通档封堵活四端点 ' + mv.x + ',' + mv.y);
  // 普通档：自己有活四时优先自己成五而非堵
  bd = makeBoard();
  row(bd, BLACK, 9, 4, 4); row(bd, WHITE, 7, 5, 4);
  mv = aiBestMove(bd, BLACK, 1);
  ok((mv.x === 3 || mv.x === 8) && mv.y === 9, '普通档抢先成五 ' + mv.x + ',' + mv.y);
  // 普通档：跳冲四（11011 型）识别为冲四
  bd = makeBoard();
  put(bd, 4, 4, BLACK); put(bd, 5, 4, BLACK); put(bd, 7, 4, BLACK); put(bd, 8, 4, BLACK);
  eq(lineScore(bd, 6, 4, BLACK, 1, 0, false) >= 100000, true, '跳冲四 11011 得冲四分');
  // 困难档：即 win 优先
  bd = makeBoard();
  row(bd, BLACK, 3, 4, 4); row(bd, WHITE, 10, 4, 4);
  mv = aiBestMove(bd, BLACK, 2);
  ok((mv.x === 3 || mv.x === 8) && mv.y === 3, '困难档抢先成五 ' + mv.x + ',' + mv.y);
  // 困难档：对方冲四必堵（211110 只有一端可落）
  bd = makeBoard();
  put(bd, 2, 2, BLACK);
  row(bd, WHITE, 7, 4, 4); put(bd, 3, 7, BLACK);
  mv = aiBestMove(bd, BLACK, 2);
  eq(mv.x + ',' + mv.y, '8,7', '困难档封堵单端冲四');
  // 困难档：活三封堵（对方落子成活三，己方应压制其中间或端点，非散点）
  bd = makeBoard();
  row(bd, WHITE, 7, 6, 2); put(bd, 2, 2, BLACK);
  mv = aiBestMove(bd, BLACK, 2);
  ok(Math.max(Math.abs(mv.x - 7), Math.abs(mv.y - 7)) <= 3, '困难档贴身应对活二/活三发展');
  // 困难档性能：中盘 30 子限时
  bd = makeBoard();
  const cells = [];
  for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) cells.push([x, y]);
  cells.sort(() => Math.random() - 0.5);
  cells.slice(0, 30).forEach(([x, y], i) => put(bd, x, y, i % 2 ? WHITE : BLACK));
  const t0 = Date.now();
  mv = aiBestMove(bd, BLACK, 2);
  const ms = Date.now() - t0;
  ok(ms < 1500 && mv && !bd[gi(mv.x, mv.y)], '困难档中盘决策限时 ' + ms + 'ms');

  console.log('== 满盘判定 ==');
  bd = makeBoard();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(bd, x, y, (x + 2 * y) % 4 < 2 ? BLACK : WHITE);
  eq(isFull(bd), true, '满盘 isFull');
  let anyWin = null;
  for (let y = 0; y < N && !anyWin; y++) for (let x = 0; x < N && !anyWin; x++) anyWin = checkWinAt(bd, x, y);
  eq(anyWin, null, '四方向均被 (x+2y)%4 序列打断，无五连');
  bd = makeBoard(); put(bd, 0, 0, BLACK);
  eq(isFull(bd), false, '一子不满');

  console.log('== AI 自战完整性 ==');
  for (const lvl of [0, 1, 2]) {
    bd = makeBoard();
    let p = BLACK, moves = 0, winner = 0;
    while (true) {
      const m = aiBestMove(bd, p, lvl);
      if (!m) { ok(isFull(bd), LEVELS[lvl] + '档无候选时棋盘必已满（' + moves + ' 手）'); break; }
      if (bd[gi(m.x, m.y)]) { winner = -1; break; }
      put(bd, m.x, m.y, p);
      moves++;
      if (checkWinAt(bd, m.x, m.y)) { winner = p; break; }
      p = OTHER(p);
    }
    ok(winner === BLACK || winner === WHITE || (winner === 0 && moves === 225),
      LEVELS[lvl] + '档 AI 自战正常分出结果（' + moves + ' 手，' + (winner ? '胜方 ' + winner : '满盘平局') + '）');
  }

  console.log('\\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
`;

// 测试代码必须与游戏逻辑拼进同一个 eval 串（strict eval 作用域隔离）
eval(src + TESTS);
