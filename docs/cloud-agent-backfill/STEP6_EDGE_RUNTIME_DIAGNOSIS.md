# 第六步：体验版 Edge Functions 运行链路诊断

## 本次建议上传的文件

1. `README.md`
2. `STEP6_EDGE_RUNTIME_DIAGNOSIS.md`
3. `西红丝.jpg`（用于登录和 ws-sign 恢复后的上传验证）

## 对现有日志的确定结论

- 用户提供的 `ws-sign` 和 `upload_food_image` 日志内容完全相同。
- 两段日志的 `function_id` 都是 `wechat_miniapp_login`，不是 `ws-sign` 或 `upload-food-image`。
- 两段日志的 `request_id`、`execution_id`、`event_id` 和时间戳完全相同，因此只是同一条 Shutdown 事件被重复贴到两个标题下。
- 事件时间为 2026-07-15 01:08:31 +0800。
- CPU 仅使用 64ms、内存未超限，停止原因是 `WallClockTime`，不是 CPU 或内存限制。
- Shutdown 可能只是 worker 生命周期结束，也可能是外部网络请求长期不返回；必须关联同一 request/execution 前面的 Request、Boot 和应用日志才能判断。
- 当前日志项目是 `supabase322217304987320320`；本地 CLI 和本地客户端变量指向 `zhgdvfwemwcmnehoarwp`。这不能直接证明体验版配置错误，但必须核对体验版、代理、Secrets 和部署目标是否属于同一项目。

## 发给云端 Agent 的指令

```text
现在诊断微信小程序体验版中 AI 问答和拍照识图同时不可用的问题。不要根据一条 Shutdown 日志再次盲目部署。

已知用户提供的两段日志其实是同一条 wechat_miniapp_login Shutdown：function_id、request_id、execution_id、event_id、时间戳完全相同，并不属于 ws-sign 或 upload-food-image。WallClockTime 本身也不是函数启动失败的证明。

目标：从体验版实际使用的 Supabase 入口开始，依次跑通项目映射、微信登录 session、ws-sign、BRTC 文字问答、upload-food-image，最后继续执行 BRTC 图片识别验证。所有测试必须通过体验版使用的同一生产代理入口。

一、首先验证五处项目身份完全一致

只输出 hostname/project ref，不输出 URL query、Anon Key、Service Role Key 或 token。

1. 从体验版实际编译产物或构建变量中解析 TARO_APP_SUPABASE_URL 的 hostname。
2. 从体验版实际使用的 TARO_APP_SUPABASE_ANON_KEY JWT payload 中只解析 ref；不得输出 key。
3. 查询生产代理当前实际转发的 Supabase project ref。
4. 查询 4 个 Edge Functions 实际部署的 project ref。
5. 查询本次运行日志中的 project_ref。

以上五处必须指向同一目标项目。如果不一致，立即停止功能修复，先纠正部署目标或构建变量，再重新构建体验版。不得把本地 zhgdvfwemwcmnehoarwp 的 URL/key 值复制到云端，也不得把云端 key 输出到报告。

特别核对 Edge Function 内部变量配对：

- SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY 必须来自同一个目标项目。
- 如果存在 APP_SUPABASE_URL、APP_SUPABASE_ANON_KEY、APP_SUPABASE_SERVICE_ROLE_KEY，它们目前会优先覆盖平台标准变量；必须确认三者也属于同一目标项目。
- 若 APP_* 是旧项目、外部代理回环地址或不完整迁移值，它会覆盖正确的标准 SUPABASE_*，导致登录 token 在 A 项目生成、客户端却在 B 项目 verifyOtp，或 ws-sign 用错误项目校验用户。
- Edge Function 内部访问本项目 Auth/Storage 时，优先使用平台可靠的内部/标准项目变量；只有经验证确实需要时才使用 APP_* 代理变量。任何调整都必须有 project ref 对齐证据。

二、重新获取正确日志，不得混贴

分别对以下函数生成一次独立请求，并为每次请求记录 function_id、HTTP status、request_id、execution_id、部署版本和时间：

- wechat_miniapp_login
- ws-sign
- upload-food-image
- brtc-history

对每个函数分别收集：

1. Request/Response 或 gateway 日志；
2. Boot/启动日志；
3. 应用 console 日志；
4. Shutdown 日志；
5. 同一 request_id/execution_id 的完整时间线。

Shutdown 出现在成功响应之后可视为正常 worker 回收；只有请求尚未响应就因 WallClockTime 结束，才算超时故障。

三、增加统一的脱敏 trace，不泄露凭据

为四个函数增加一致的结构化日志和响应 traceId：

- request_started：traceId、function、method、deployment version；
- config_checked：只列必需变量 present/missing 以及目标 project ref；
- upstream_started/upstream_finished：上游名称、status、elapsedMs；
- request_finished：status、elapsedMs、errorCode；
- request_failed：errorCode、脱敏 message、elapsedMs。

禁止记录微信 code、openid、email、Authorization、apikey、magic-link token、Service Role Key、百度 AK/SK、WebSocket URL/token、图片 base64。

四、先跑通 wechat_miniapp_login

当前函数对 https://api.weixin.qq.com/sns/jscode2session 的 fetch 没有超时，也没有分阶段日志，符合低 CPU/低内存但 WallClockTime 的可能表现。

按顺序验证：

1. OPTIONS 应快速返回 204。
2. 空 body 应在 1 秒内返回 400 缺少 code，证明函数能启动。
3. 检查 WECHAT_MINIPROGRAM_LOGIN_APP_ID 和 WECHAT_MINIPROGRAM_LOGIN_APP_SECRET 仅报告 present/missing。
4. 在体验版中调用 wx.login，并立即把一次性 code 发送给函数；code 不得记录、复用或出现在报告中。
5. 给 jscode2session 增加 AbortController 超时，建议 8 秒；区分 HTTP 非 2xx、JSON 解析、微信 errcode 和网络超时。
6. 验证 openid 非空后再创建/复用用户。
7. 分别记录 createUser、generateLink 的耗时和错误类别；必要时增加总请求上限，但不得吞掉真实错误。
8. 函数返回 token 后，客户端必须在同一 Supabase 项目执行 verifyOtp 并成功得到 session。
9. 随后调用 /auth/v1/user，确认 session 能解析为同一用户；报告只写成功/失败，不输出用户信息。

如果 token 生成成功但 verifyOtp 失败，优先检查函数内部 SUPABASE_URL/Service Role 所属项目与客户端 URL/Anon Key 是否不一致。

五、用同一 session 跑通 ws-sign 和 BRTC 文字问答

1. 使用刚建立的用户 session 通过生产代理调用 ws-sign。
2. 无 session 请求应为 401；有效 session 请求应为 200。
3. 检查 ws-sign 内部 Auth 校验使用的 SUPABASE_URL/ANON_KEY 与 session 所属项目一致。
4. 检查百度 BRTC 必需 Secrets 只报告 present/missing。
5. 获取 Default Agent WebSocket 后完成 MEDIA READY/License 握手，发送一条最小文字问题并收到最终 [A]。
6. 不输出完整 WebSocket URL、Agent token 或回答中的用户数据。

只有这一项成功，才能说明 AI 问答恢复。

六、用同一 session 跑通 upload-food-image

当前函数内部通过 APP_SUPABASE_URL/SUPABASE_URL 调用 Storage，也没有 fetch 超时。

1. OPTIONS 应快速成功。
2. 缺少 image 应快速返回 400。
3. 使用同一隔离 session 和附件西红丝.jpg 调用一次。
4. 函数必须验证调用用户身份后才能使用 Service Role 上传，不能允许任意匿名请求滥用服务端权限。
5. 给 Storage fetch 增加合理超时并区分 Auth、解码、Storage HTTP、网络超时错误。
6. 上传目标项目和 bucket 必须与体验版同一 Supabase 项目一致。
7. 成功后验证 URL 可读，并删除测试对象。

只有这一项成功，才能说明图片持久化链路恢复；它仍不代表 BRTC 图片识别成功。

七、继续跑通 BRTC 图片识别

登录、ws-sign 和 upload-food-image 都恢复后，继续执行 STEP5_VISION_TROUBLESHOOTING.md 的 BRTC Default Agent 原始协议测试：

- 使用同一隔离 session；
- 使用附件西红丝.jpg；
- 必须收到图片上传请求、发送分片、收到最终 [A]；
- 最终识别结果应为番茄或西红柿；
- 不允许恢复旧 VISION_CFG 或增加 HTTP 识图兜底。

八、允许修改的范围

- src/client/supabase.ts（仅安全的 hostname/ref/trace 诊断，不能记录 key）
- src/contexts/AuthContext.tsx（登录错误分类和 trace）
- supabase/functions/wechat_miniapp_login/index.ts
- supabase/functions/ws-sign/index.ts
- supabase/functions/upload-food-image/index.ts
- supabase/functions/brtc-history/index.ts（仅统一 trace/项目校验，若本身无故障不要重写）
- scripts/testEdgeFunctionsE2e.mjs（新增）
- scripts/testVisionE2e.mjs（按 STEP5 新增）
- 相关回归测试

禁止修改数据库、执行迁移、提交 .env、写入/输出 Secrets、修改微信后台域名或把生产用户数据用于测试。

九、验证矩阵

必须通过：

1. 体验版项目 host/ref、代理后端 ref、部署 ref、日志 ref 完全一致。
2. 微信 wx.login -> wechat_miniapp_login -> verifyOtp -> /auth/v1/user 成功。
3. 同一 session 调用 ws-sign 成功，并完成一次 BRTC 文字问答。
4. 同一 session 调用 upload-food-image 成功，测试对象已清理。
5. 同一 session 使用西红丝.jpg 完成 BRTC 图片识别，结果为番茄/西红柿。
6. TypeScript、pnpm lint、现有回归、Edge E2E、Vision E2E、微信构建通过。
7. 体验版或真机复测两个用户功能；无法控制真机时明确列出唯一人工步骤。

十、完成报告

1. 五处项目身份对齐结果，只显示 hostname/ref。
2. 四个函数各自真实 request_id/execution_id/HTTP status/耗时，不再混用日志。
3. WallClockTime 是正常回收还是未响应超时，并给出关联证据。
4. 登录链路每阶段结果和最终 session 状态。
5. ws-sign/BRTC 文字问答结果。
6. upload-food-image 与测试对象清理结果。
7. BRTC 图片识别结果。
8. 修改文件、部署版本和测试结果。
9. Secrets 只报告 present/missing，不显示值。

不得以“函数已部署”“出现 Shutdown”“Storage URL 可访问”作为整体完成标准。必须证明体验版使用的同一项目、同一 session 能依次跑通登录、ws-sign、BRTC 文字问答、图片上传和 BRTC 图片识别。
```

