# 音频系统（程序化合成）

## 设计
- 所有声音由 Web Audio API 程序化生成（OscillatorNode + BiquadFilter + AudioBuffer 噪声）
- 无外部音频文件，零网络请求，体积为 0
- AudioContext 在第一次按钮点击时懒加载（绕过浏览器自动播放策略）

## 音效矩阵

| 事件 | 触发点 | 合成方式 |
| --- | --- | --- |
| 蓄力 loop | pressStart | sine 180Hz + triangle 五度 270Hz，power 提升时频率 / 增益同步上升 |
| 起跳 whoosh | pressEnd | triangle sweep (380+1·power Hz → ~2.4×) + 噪声 sweep (LP 1.8–3kHz) |
| 完美落地 | resolveLanding, accuracy > 0.75 | 三音上行琶音 (880/1320/1760 Hz sine) |
| 普通落地 | resolveLanding, accuracy ∈ (0.5, 0.75] | 双 sine 下行 (440→330) + 短噪声 thud |
| 跳太短 | landedIdx === activeBlockIdx | square 220Hz + 噪声 thud |
| Combo | 完美落地后 | 4 音琶音上行（root 随 combo 升高） |
| 掉下去 | startFalling | sawtooth 520→80Hz 下行 + 0.5s 后 thud |
| Game Over | startFalling 后 600ms | 4 音下行（523/392/311/233 Hz triangle） |
| 开始 / 重开 | startBtn / againBtn | 4 音上行琶音 (523/659/784/1046 Hz) |

## UI
- 左上角 40×40 圆形按钮（🔊 / 🔇），点击切换 mute，stopChargeSound 也会遵守 mute 状态
- AudioContext 在任何 pointerdown/keydown 时尝试 resume，绕过 suspended 限制

## 风险 / 注意
- 程序化音频在 Safari iOS 上首次需明确用户手势 — 所有按钮点击都先 `unlockAudio()` 再 `SFX.start()`
- noise burst 用 0.5s 缓冲 + biquad 低通避免尖锐
- detune / 多 osc 用于减少"廉价电子音"的单薄感