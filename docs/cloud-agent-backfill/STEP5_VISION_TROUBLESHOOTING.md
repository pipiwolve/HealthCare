# 第五步：BRTC Default Agent 拍照识图修复

## 本次建议上传的 3 个文件

1. `README.md`
2. `STEP5_VISION_TROUBLESHOOTING.md`
3. `西红丝.jpg`

测试图片位于本地：`/Users/chenpengjian/Downloads/西红丝.jpg`。它是 612x612、约 35KB 的 JPEG 番茄图片。

## 已确认的架构约束

- AI 文字问答、语音和图片识别统一走百度智能云 BRTC 链路。
- 每次请求都先由 `ws-sign` 创建具备多模态能力的 BRTC Default Agent。
- `agentProfile: chat/vision/voice-*` 是本项目的客户端场景标识，不代表需要创建不同模型或恢复旧版客户端 `CHAT_CFG/VISION_CFG/VOICE_CFG`。
- 不恢复已删除的 `src/utils/brtcConfig.ts`，不把模型 token 放回客户端，不增加独立 HTTP 图像识别兜底。
- `upload-food-image` 只负责把图片持久化到 Storage；AI 识别结果仍必须来自 BRTC Default Agent WebSocket。

## 发给云端 Agent 的指令

```text
现在修复首页拍照添加食材失败问题。架构要求已经明确：所有 AI 能力统一使用百度智能云 BRTC Default Agent。Default Agent 本身具备图片识别能力，不允许恢复旧版 CHAT_CFG/VISION_CFG 调用方式，也不允许新建独立 HTTP 识图服务绕开 BRTC。

完成标准不是“增加日志”或“Storage 上传成功”，而是用附件西红丝.jpg 通过当前 BRTC Default Agent 链路真实识别出“番茄”或“西红柿”，并跑通首页添加食材。

一、固定架构边界

1. 保留 ws-sign 的统一 Default Agent 创建机制。
2. agentProfile 只作为 chat、vision、voice-realtime、voice-ptt 的场景标识、日志字段和客户端交互选择，不用于恢复旧版模型配置。
3. 不恢复 src/utils/brtcConfig.ts，不使用历史提交中的任何旧 token，不新增客户端模型 token。
4. 不新增 recognize-food-image 或其他绕开 BRTC 的识图 Edge Function。
5. 不修改数据库 schema、RLS、trigger、storage policy，不执行 00000_complete_supabase_import.sql。
6. 不通过延长超时、伪造 UPLOAD_IMAGE、根据文件名返回结果或硬编码“番茄”来通过测试。

二、先建立可重复的 BRTC 原始协议测试

新增 scripts/testVisionE2e.mjs。它必须直接复现小程序当前链路，而不是只测试 upload-food-image：

1. 使用隔离测试用户获取短期 Supabase access token。优先使用测试项目；如只能使用生产项目，可创建不含个人信息的临时 Auth 用户，完成后删除用户和测试数据。
2. 通过生产 Supabase 代理调用 ws-sign，body 为 {agentProfile: 'vision'}。
3. 只验证返回字段存在，不输出 Authorization、apikey、Agent token、完整 WebSocket URL 或 userId。
4. 连接 BRTC WebSocket，完成 MEDIA READY 和 License 握手。
5. 发送与 buildFoodRecognitionPrompt('trigger') 完全一致的 [T] 文本。
6. 脱敏记录随后收到的每一条文本消息的时间、长度和协议前缀，不能记录 token、图片 base64 或用户数据。
7. 断言在规定时间内收到 Default Agent 的图片上传请求事件；同时记录在该事件前是否提前收到 [A]、错误事件、关闭事件或其他 [E] 事件。
8. 收到上传请求后，用附件西红丝.jpg 按当前 BRTC 图片协议发送所有分片和结束帧。
9. 发送与 buildFoodRecognitionPrompt('final') 一致的 [T] 文本，等待 [A]:[M] 和最终 [A]。
10. 最终文本经 parseRecognizedFoods 清洗后必须包含“番茄”或“西红柿”。
11. 连续运行至少 2 次，确认 listener、timer、singleton state 和重复事件不会污染下一次请求。

在这个测试跑通前，不能把微信相机、Storage URL 或 UI 当成根因。

三、逐阶段定位，禁止跳步

阶段 A：Default Agent 创建

- 确认 ws-sign 的 generateAIAgentCall 返回成功，并获得新的 Agent id/token。
- 记录 traceId、agentProfile、上游 HTTP 状态、创建耗时和非敏感配置键。
- 确认创建的是项目当前约定的 Default Agent；不得因为 agentProfile='vision' 切换回旧 VISION_CFG。
- 如果 BAIDU_RTC_AGENT_CONFIG 存在，只能确认其存在以及非敏感键名，不能输出值；检查它是否意外覆盖了 Default Agent 的多模态能力。

阶段 B：WebSocket 会话建立

- 确认 onOpen、MEDIA READY、License MUST/RES 的顺序。
- 确认连接没有在 trigger 发送前关闭。
- 对 License FAILED、MEDIA READY 超时、socket close/error 分别给出可分类错误。

阶段 C：图片上传请求事件

- 当前客户端只匹配以 [E]:[UPLOAD_IMAGE] 开头的字符串。记录 Default Agent 实际返回的原始协议前缀，检查是否存在空格、换行、BOM、JSON 包装、大小写、参数后缀或新版事件格式差异。
- 对照当前百度 BRTC Default Agent 官方图片交互协议，确认触发文本和事件名称；不能凭旧项目文档猜测。
- 如果 Agent 已返回正确上传事件但客户端没有触发 listener，修复 dispatch/onMessage 的事件归一化和匹配逻辑，并增加协议单元测试。
- 如果 Agent 返回普通 [A] 而不是图片上传事件，检查 trigger 文本是否按 Default Agent 当前协议发出图片请求，并用原始测试证明修正后的 trigger 能触发上传事件。

阶段 D：图片分片

- 对照 Default Agent 当前协议核对首片头、续片头、16KB 分片单位、base64 边界和结束帧。
- 当前实现首片为 \x18[T]=binary;[N]=food.jpg\n + bytes，续片以 \x10 开头，结束帧为 \x14/FA==；必须用官方协议或已成功的 BRTC 交互证据验证，不能只验证代码自洽。
- 记录分片数量、原图字节数、每片发送成功/失败和结束帧确认，但不得记录分片内容。
- 检查 Taro SocketTask 发送字符串后的顺序、背压和单帧大小；必要时串行等待每片 success callback，不能在未确认发送完成时发送 final prompt。

阶段 E：最终回答

- 图片结束帧成功后再发送 final prompt。
- 记录是否收到 [A]:[M]、最终 [A]、错误事件或重复 UPLOAD_IMAGE。
- 重复上传请求只能按协议处理一次；不能导致 listener 泄漏或第二次上传。
- 若有 interim 无 final，保留现有 interim 降级逻辑，同时报告真实阶段。

四、允许的修复范围

只允许根据原始协议证据修改：

- src/services/aiWebSocket.ts
- src/utils/aiPromptHelpers.ts（仅当 Default Agent 当前协议要求调整 trigger/final 文本）
- src/pages/home/index.tsx（错误分类、识别与 Storage 结果解耦）
- src/pages/chat/index.tsx（仅当共用的 BRTC 图片问答存在同一协议问题）
- supabase/functions/ws-sign/index.ts（仅修复统一 Default Agent 创建、脱敏日志或错误分类，不创建 profile 专属模型）
- scripts/testVisionE2e.mjs（新增）
- 相关协议/回归测试

不得修改测试来迁就错误实现。每一处生产代码修改都必须对应一条失败证据和一条新增测试。

五、首页并发链路行为

首页仍可并发执行：

- BRTC Default Agent 图片识别；
- upload-food-image Storage 持久化。

但两条结果必须独立处理：

- BRTC 识别成功、Storage 失败：仍应填入食材名，image_url 为空，并提示图片保存失败而不是识别失败。
- Storage 成功、BRTC 失败：保留已上传 URL 供清理或重试，但不能把上传成功冒充识别成功。
- 两者成功：填入食材名并保存 image_url。
- 测试产生的 Storage 对象必须删除。

六、部署与验收

1. 运行：TypeScript、pnpm lint、现有三个检查脚本、新增 vision E2E 和微信小程序构建。
2. 只部署本次实际修改的 ws-sign；客户端修改通过新的体验版验证。若 ws-sign 未修改，不得无意义重复部署。
3. 使用附件西红丝.jpg 验证：
   - Node/服务端原始 BRTC E2E 识别为番茄或西红柿；
   - 连续执行 2 次均成功；
   - upload-food-image 仍成功并清理测试对象；
   - 微信开发者工具或真机从首页选择该图片后自动填入番茄或西红柿；
   - 输入有效重量后能够添加食材，image_url 正确保留；
   - 控制台无 token、完整 URL、base64 或 secret 泄露。
4. 如果云端环境无法控制微信开发者工具或真机，Node BRTC E2E 必须先完全通过，并把真机操作列为唯一剩余人工验收；不能把 Storage HTTP 200 当作替代。

七、完成报告

必须报告：

1. 根因位于 Agent 创建、会话握手、UPLOAD_IMAGE 事件、客户端事件匹配、图片分片还是最终回答。
2. Default Agent 的完整脱敏事件时序和各阶段耗时。
3. 修改文件及每处修改对应的失败证据。
4. testVisionE2e 连续两次结果，明确附件图片是否识别为番茄或西红柿。
5. Storage 上传与测试对象清理结果。
6. TypeScript、lint、现有回归、新增协议测试、构建结果。
7. 体验版/真机验证结果或唯一剩余人工步骤。
8. Secrets 只能报告变量名及 present/missing，不显示值。

不得以“最可能是 Default Agent 配置”“已增加日志”“上传接口正常”作为完成。必须继续排查当前 BRTC Default Agent 链路，直到测试图片真实识别成功，或给出带原始协议证据且需要百度侧处理的明确阻断项。
```

