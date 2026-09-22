# 桌面端鼠标无响应问题修复

## 根因
1. 之前 onDown 监听挂在 `renderer.domElement` 上，依赖 DOM 命中。HTML 里 `#app` 内的 canvas 由 JS `appendChild` 添加，canvas 实际是 `#app` 最后子元素，理论上 z 序最上，但部分浏览器 / 用户配置下 canvas 元素 CSS height 因 `#app` `position:fixed inset:0` + canvas `width/height:100%` 的级联计算，可能出现 pointer 事件落到其它元素上的情况。
2. 之前在 onDown 中加入了 `e.target.closest('.overlay')` 检查，虽然 canvas 不命中 `.overlay`，但代码可靠性下降。

## 修复
把 `pointerdown` 监听从 `renderer.domElement` 改到 `window`，统一入口，按以下顺序过滤：
1. target 是 `<button>` 或 button 后代 → return（按钮自己处理 click）
2. state !== READY → return
3. start overlay 仍显示 → return（让开始按钮自己处理 click）
4. game over overlay 仍显示 → return
5. 鼠标右键（button !== 0）→ return
6. preventDefault + pressStart_

## 副作用
- 鼠标右键点击场景不再触发跳跃（之前的代码只过滤 button===undefined，并未过滤右键）
- 触摸事件完全不受影响（pointerType 不是 'mouse'）

## 验证
- 桌面浏览器：左键按下画布应进入 AIMING，蓄力条出现，箭头指向下一个方块
- 桌面浏览器：左键松开 → 起跳
- 点"开始游戏"按钮：游戏开始，state 进入 READY
- 点"重新开始" / "再来一局"：resetGame → state READY