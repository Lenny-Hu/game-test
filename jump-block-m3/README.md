# 跳一跳 H5（Three.js 版）

一个单文件的 3D「跳一跳」玩法网页游戏：长按蓄力、松开起跳，让小人从方块跳到方块，命中中心拿高分并累计 COMBO。

- 全部逻辑在一个文件里：`index.html`（HTML + CSS + ES Module JS，无构建步骤、无本地依赖）
- 渲染：Three.js（通过 importmap 从 unpkg CDN 加载 `three@0.160.0`）
- 音效：Web Audio API 程序化合成，零音频文件、零额外请求
- 最高分：`localStorage` 的 `jumpBest`

## 运行

因为使用了 `<script type="importmap">` 和 ES Module，**直接双击用 `file://` 打开可能因浏览器模块策略失败**，请用本地静态服务器打开：

```bash
# 任选一种
cd jump-block-m3
python -m http.server 5173        # http://localhost:5173
npx serve .                       # http://localhost:3000
```

首次加载需要联网（从 unpkg 拉取 Three.js）。离线使用时把 importmap 里的两个 URL 换成本地 `three.module.js` 路径即可。

## 玩法

| 操作 | 桌面端 | 移动端 |
| --- | --- | --- |
| 蓄力 | 鼠标左键按住画布 | 手指长按屏幕 |
| 起跳 | 松开左键 | 抬起手指 |
| 重新开始 | 右上角「重新开始」/ 结算面板「再来一局」 | 同左 |
| 静音 | 左上角 🔊 / 🔇 | 同左 |

按住时间决定跳跃力度（1.5 秒蓄满），蓄力时地面箭头会指向下一个方块并随之变长变大。右键不会触发跳跃。

状态机：`READY → AIMING → JUMPING → (落地判定) → READY`，失败则 `FALLING → GAMEOVER`。

## 得分规则

`accuracy = 1 - 落点到方块中心的距离 / 方块半边长`（用未修正的原始落点计算）。

| 落点 | 得分 | COMBO |
| --- | --- | --- |
| 正中（accuracy > 0.75） | `2^combo`：+2、+4、+8、+16、+32 …（上限 2^16） | 累加 |
| 贴边（0.5 < accuracy ≤ 0.75） | +1 | 重置为 0 |
| 极边缘但挂住（accuracy ≤ 0.5） | +1 | 重置为 0 |
| 跳太短落回原方块 | 不扣分也不加分 | 不变 |
| 掉下去 | 本局结束 | 重置为 0 |

落地后角色只向方块中心"软吸附"25%，剩余偏移会保留到下一次起跳点，所以越贪心的落点下一跳越难。详细反馈（文案时长、字号脉冲）见 [SCORING.md](SCORING.md)。

## 视觉与音效

- 低多边形糖果色方块 + 顶面高光环，玩家是带眼睛和腮红的方块小人，含 squash & stretch 挤压、空中旋转、落地粒子、投影圆盘
- 三光源（半球光 + 平行主光源带 PCF 软阴影 + 冷色轮廓光），ACES 色调映射 + 雾
- 音效矩阵（蓄力 loop / 起跳 whoosh / 完美落地琶音 / 普通落地 / 跳太短 / COMBO / 掉落 / Game Over / 开局）见 [AUDIO.md](AUDIO.md)

## 自适应

- 字号统一用 `clamp()`，HUD 与按钮适配 `env(safe-area-inset-*)`，viewport 加 `viewport-fit=cover`
- `computeCameraFit()`：竖屏窄视口自动拉远相机（距离系数 1.0→1.6）并微增 FOV，保证下一个方块始终在画面内
- 相机目标点取「当前方块 + 下一个方块」中点，避免前景遮挡
- 输入监听挂在 `window` 而非 canvas，手指拖出画布也能正常结束蓄力；细节见 [MOBILE_FIXES.md](MOBILE_FIXES.md) 与 [DESKTOP_INPUT_FIX.md](DESKTOP_INPUT_FIX.md)

## 测试钩子

`window.__JUMP_TEST_HOOKS__` 暴露了自动化检查用的接口：

```js
__JUMP_TEST_HOOKS__.getState()          // { state, score, combo, activeBlockIdx, blocks }
__JUMP_TEST_HOOKS__.setState('jumping') // 直接触发一次跳跃（固定力度 0.6）
__JUMP_TEST_HOOKS__.setSeed(1234)       // 固定随机种子，复现同一套关卡
__JUMP_TEST_HOOKS__.reset()             // 重开一局
```

## 已知限制

- 加载依赖 unpkg CDN，纯离线环境需自备 Three.js 文件
- 不支持键盘操作，只能用指针（鼠标/触摸）
- 一局内旧方块不做剔除，跳得极多时场景对象会持续累积
- 随机种子固定为 `20260524`（开局关卡布局可复现），重开一局才改用时间种子

## 相关文档

- [SCORING.md](SCORING.md) — COMBO 累加得分规则与反馈时长
- [AUDIO.md](AUDIO.md) — 程序化音频合成方案
- [MOBILE_FIXES.md](MOBILE_FIXES.md) — 移动端适配改动记录
- [DESKTOP_INPUT_FIX.md](DESKTOP_INPUT_FIX.md) — 桌面端鼠标无响应问题修复
