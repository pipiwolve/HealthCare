# 第七步：BRTC 流式音频与朗读播放诊断

## 本次建议上传的文件

1. `README.md`
2. `STEP7_RTC_AUDIO_PLAYBACK.md`

## 已确认的当前链路

```text
BRTC WebSocket ArrayBuffer
  -> aiWebSocket emit('audio')
  -> requestResponse onAudio
  -> audioChunks.push(buffer)
  -> createPcmStreamPlayer().append(buffer)        实时播放
  -> writeAudioChunksToTempFile(audioChunks)       完整文件
  -> wrapPcm16ToWav
  -> Taro.createInnerAudioContext().play()         “朗读”按钮
```

当前代码把所有二进制帧无条件解释为 16kHz、16-bit、单声道、小端裸 PCM。实时播放与完整文件播放都依赖这个假设，因此必须先验证真实 BRTC 帧格式。

## 发给云端 Agent 的指令

```text
现在诊断微信小程序体验版 AI 问答的两个音频故障：

1. 文本流式输出时没有同步播报音频。
2. 回答结束后虽然出现“朗读”按钮，点击也无法播放。

架构要求：音频继续完全来自百度智能云 BRTC Default Agent。不得恢复 tts-minimax，不得增加另一套 TTS Edge Function，不得用预制音频或系统朗读绕过 BRTC。

完成标准：使用一次真实 BRTC 问答，同时证明实时 PCM 播放和回答完成后的“朗读”重播均可听见，并在 iOS/Android 至少一个微信真机或体验版环境完成验证。

一、先确认 BRTC 是否真正下发可播放音频

新增 scripts/testRtcAudioE2e.mjs，使用隔离测试用户完成一次固定问题的 BRTC Default Agent 请求：

1. 调用 ws-sign，连接 WebSocket，完成 MEDIA READY 和 License 握手。
2. 发送不含个人数据的固定问题，例如“请用一句话说明早餐应如何搭配”。
3. 脱敏记录以下事件的顺序和相对耗时：
   - TTS_BEGIN_SPEAKING；
   - 第一个 [A]:[M]；
   - 最终 [A]；
   - 第一个二进制音频帧；
   - 最后一个二进制音频帧；
   - TTS_END_SPEAKING；
   - socket close/error。
4. 统计 audioChunkCount、audioByteCount、每片最小/最大/平均字节数和总接收时长，不输出音频内容、用户数据、token 或完整 URL。
5. 检查协商值：ws-sign config 中 audiocodec、WebSocket URL 的 ac 参数和 BRTC 实际输出格式必须一致。
6. 对合并后的音频做格式判定：
   - 是否以 RIFF/WAVE、ID3、MP3 frame、OggS 或其他容器/编码头开头；
   - 若按 PCM16LE 解释，字节数是否为偶数；
   - 样本 min/max、RMS、静音比例和推算时长是否合理；
   - 不能只因 URL 使用 ac=raw16k 就假定收到的数据必然是裸 PCM。
7. 若确认是 PCM16LE/16000Hz/mono，把合并数据封装成标准 WAV，在测试环境用可用的音频探测器验证 sample rate、channels、duration 和解码成功。
8. 若格式不是 PCM16LE，先按 BRTC 官方协议修正客户端格式处理；不得继续错误封装 WAV。

只有音频帧存在、格式明确且离线 WAV 可解码，才进入小程序播放器排查。

二、验证 aiWebSocket 没有提前丢弃音频

检查 src/services/aiWebSocket.ts 的 requestResponse：

1. 确认所有 WebSocket ArrayBuffer 都属于音频数据；如协议中存在非音频二进制帧，必须按官方协议分类，不能无条件 emit('audio')。
2. 记录 llm-final、tts-start、tts-end 和 audio frame 的真实顺序。
3. 当前 tts-end 会立即 notifyAudioComplete，并在已有 finalText 时 cleanup 所有监听。如果 BRTC 在 TTS_END 后仍可能到达最后音频帧，该逻辑会丢尾帧；必须依据真实时序修复。
4. audio idle timer 必须从最后一帧重新计时，不能在音频尚未到齐时 resolve 和 disconnect。
5. ws.disconnect 只能发生在所有音频帧接收完成后，不能仅因文本 final 到达就关闭。
6. 对无 TTS_BEGIN、有音频；有 TTS_BEGIN、无 TTS_END；TTS_END 先于尾帧；只有 interim 无 final 四种情况增加协议测试。

不得单纯增加等待时间。修复必须由真实事件顺序和新增测试支撑。

三、修复流式 PCM 播放器

当前风险点：

- unlockRtcAudioPlayback 调用 context.resume() 后没有等待状态变化，却直接把 sharedRtcAudioUnlocked 设为 true。
- 静音保活只有 12 秒，AI 首段音频可能在保活结束后到达。
- createPcmStreamPlayer 在异步 ws.connect 之后创建，不一定仍处于微信认可的用户手势调用栈。
- 每个 BRTC 小分片创建一个 AudioBufferSource，可能导致大量 source、调度抖动和真机资源问题。

修复要求：

1. 在发送按钮的 onTouchStart/onClick 用户手势中同步创建或准备共享 WebAudioContext，并记录 context.state、resume 前后状态和 currentTime 是否推进。
2. 不能仅用一个布尔值声称已解锁；只有上下文实际为 running 且 currentTime 推进才算成功。
3. 保活持续时间必须覆盖连接、首字和首音频延迟，或者使用不会在回答期间提前结束的安全机制；请求完成后及时释放。
4. 对输入 PCM 做缓冲聚合，建议累积约 100-250ms 音频再创建 AudioBufferSource，避免每个网络小片一个 source。
5. 维护明确的播放队列：queuedDuration、nextStartAt、context.currentTime、underrunCount、scheduledSourceCount。
6. 首个可播放批次到达后应在合理延迟内调度，并记录 firstAudioReceivedMs、firstAudioScheduledMs、firstAudioPlayedMs。
7. 如果上下文 suspended/interrupted，给出可分类日志和 UI 提示，不得静默吞掉。
8. finish 只能停止接收新数据并等待已排队音频播完；不能提前关闭仍在播放的 source。
9. stop/用户打断必须清空队列并停止所有 source，下一次问答能够重新初始化。

验收：第一次可播放音频到达后 1 秒内开始有声播放，且播放发生在文本仍在流式更新或回答刚生成期间，而不是等待完整文件。

四、验证并修复完整 WAV 文件

在 writeAudioChunksToTempFile 写文件前增加纯函数校验和测试：

1. 合并后的字节长度、格式、采样率、声道、位深必须来自已确认的 BRTC 协议，不得硬猜。
2. PCM16LE 数据必须为偶数字节；异常尾字节应报错而不是生成损坏文件。
3. WAV header 必须验证：RIFF size、WAVE、fmt、PCM format=1、channels=1、sampleRate=16000、byteRate=32000、blockAlign=2、bitsPerSample=16、data length。
4. 写入后立即 stat 并重新读取前 44 字节，确认文件大小等于 44 + dataLength。
5. 记录 file size、durationMs 和格式，不记录音频内容。
6. 页面卸载、应用后台恢复或消息状态替换时，确认 audio_url 没有指向已删除的临时文件。
7. 当前会话需要重复播放时可以使用 USER_DATA_PATH；如产品要求跨会话/重启播放，应使用微信允许的持久文件机制并管理清理，不得长期泄漏文件。

新增 WAV 纯函数测试，至少覆盖正常 PCM、奇数字节、空音频、已带 WAV 容器、非 PCM 格式和损坏 header。

五、修复“朗读”按钮播放

检查 handlePlayAudio 和 InnerAudioContext：

1. 在设置 src 前注册 onCanplay、onPlay、onWaiting、onPause、onStop、onEnded、onError，并记录脱敏状态。
2. 点击时先 stat 文件并校验 WAV header/duration，不允许只检查 size > 256。
3. 记录 onError 的 errCode/errMsg、文件格式、大小和本地路径类型，但不得输出用户内容。
4. 确认微信静音开关、系统媒体音量和 InnerAudioContext 的 obeyMuteSwitch/音频选项符合产品要求；只能使用微信官方支持的 API。
5. 确认 ctx.volume、playbackRate、startTime 未处于静音或异常值。
6. 明确处理 onCanplay 与 play 的时序；不能因为 src 尚未可播放就无日志失败。
7. 切换音频时先停止并销毁旧 context，但不能误销毁刚创建的新 context。
8. 播放状态只能由 onPlay/onPause/onEnded/onError 驱动，不能在 ctx.play() 前就显示“正在播放”。
9. 用同一个生成的 WAV 连续点击播放、暂停/停止、再次播放至少 2 次。

六、区分两个故障，不得用一个假修复掩盖

测试矩阵：

1. 有音频帧 + WebAudio 正常 + WAV 正常：实时和朗读都应通过。
2. 有音频帧 + WebAudio 不支持：实时明确降级，但完整 WAV 的朗读必须能用。
3. 有音频帧 + WAV 不可解码：实时可能通过，朗读必须显示格式错误而不是无声。
4. 无音频帧：不应生成朗读按钮，必须报告 BRTC TTS 未下发。
5. 音频全静音：必须通过 RMS 检查识别，不能显示可播放成功。

七、允许修改范围

- src/services/aiWebSocket.ts
- src/pages/chat/index.tsx
- scripts/testRtcAudioE2e.mjs（新增）
- src/utils/rtcAudio.ts（只有抽离 WAV/PCM 纯函数确实降低复杂度时新增）
- scripts/checkChatStreaming.mjs 及新增音频纯函数测试
- supabase/functions/ws-sign/index.ts（仅当证据证明 audiocodec/ac 协商错误；不得重构 Default Agent）

禁止修改数据库、Secrets 值、登录链路、图片识别协议或增加旧 TTS 服务。环境变量只能报告 present/missing，不得传输值。

八、检查、部署与真机验收

1. 运行 TypeScript、pnpm lint、现有回归、新增 WAV/播放器测试、testRtcAudioE2e 和微信小程序构建。
2. 如果只改客户端，不重复部署 Edge Function；生成新的体验版进行真机验证。
3. 真机至少覆盖：
   - 点击发送后文本流式出现，音频同步开始；
   - 回答完成后点击“朗读”可完整播放；
   - 播放、停止、再次播放；
   - 连续发送两轮问答；
   - 播放中发起新的语音输入，旧音频正确停止；
   - 应用切后台再回来后的状态恢复；
   - 系统静音开关和媒体音量场景。
4. 分别在至少一台 iOS 或 Android 真机记录结果；若另一平台未测，明确列为剩余兼容性风险。

九、完成报告

必须报告：

1. BRTC 音频事件顺序、chunk 数、总字节、实际格式、RMS 和推算时长。
2. 流式播放失败的确切阶段：未收到帧、格式错误、上下文未解锁、队列未调度、source 异常或设备静音。
3. 朗读失败的确切阶段：文件无效、WAV header、文件路径、InnerAudioContext canplay/play/error 或设备策略。
4. 每个修改文件及对应失败证据和新增测试。
5. testRtcAudioE2e、TypeScript、lint、构建和真机结果。
6. 首音频接收、调度、实际播放延迟，以及完整音频时长。
7. 连续两轮问答和重复朗读结果。

不得以“按钮已出现”“文件已写入”“调用了 ctx.play()”“已增加日志”作为完成。必须证明真机能够在文本流式输出时听到音频，并能在结束后通过朗读按钮再次完整播放。
```

