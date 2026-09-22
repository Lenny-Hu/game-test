# 移动端适配改动记录

## 问题
1. 窄屏（手机竖屏）看不到下一个方块 —— FOV 40° + 固定 cameraOffset 在窄视口太挤
2. 文字提示在小屏溢出 / 没居中
3. 按钮可能被刘海 / 安全区遮挡

## 改动

### CSS 响应式
- 所有 HUD 字号用 `clamp()` —— 分数 48–84px、中央标题 26–52px、副标 12–18px
- HUD 顶部偏移用 `max(20px, env(safe-area-inset-top))`，按钮用 `env(safe-area-inset-right)`
- `.center-prompt` 加 `padding: 0 24px` + `max-width: 92vw` 防溢出
- `.overlay .panel` 改用 clamp padding 和 min(280px, 86vw) 防止小屏内容裁剪
- viewport meta 加 `viewport-fit=cover` 让 safe-area 生效
- 蓄力条加 backdrop-filter 提升小屏可读性

### 摄像机自适应
- 新增 `computeCameraFit()`：
  - 视口宽高比 < 0.7（典型手机竖屏）时拉远相机（distance factor 1.0→1.6）
  - 同时把 FOV 微增（最多 1.2x）
- 摄像机目标点改为「当前方块 + 下一个方块」的中点并加 Y 抬高，避免前景方块遮挡下一个方块
- resize 监听同步调用 `computeCameraFit()`

### 输入加固
- onDown 排除 overlay / button 上的点击
- pointerup 全局监听，手指拖出 canvas 仍能结束蓄力