# Cloud Agent 回填包

## 五文件上传限制

若云端 Agent 每次最多接收 5 个文件，请分两轮执行：

- 第一轮上传本文件、`STEP1_INSTRUCTION.md`、`0001`、`0002`、`0003`，共 5 个文件。
- 收到“第一步回填完成”并确认检查结果后，第二轮上传 `STEP2_INSTRUCTION.md`、`0004`、`0005`、`0006`，共 4 个文件。

两轮不得并行，具体指令和允许修改的路径范围以对应的 `STEP*_INSTRUCTION.md` 为准。

两轮代码回填完成后，不应立刻执行生产数据库迁移。先上传 `STEP3_INSTRUCTION.md` 与 `0001-0003` 做标准树一致性审计、Secrets/域名状态检查和数据库只读差异评估；收到审计报告后，再分别决定是否授权 Edge Functions 部署与数据库变更。

当第三步结论为“可以进入受控部署阶段”时，先执行 `STEP4_INSTRUCTION.md`，只授权部署和烟测 4 个 Edge Functions。数据库继续保持只读；根据第四步补全的两个触发器和一条 policy 精确定义，再生成最小数据库修复指令，避免直接执行完整 619 行迁移。

若 Edge Functions 部署后文字问答正常、但首页拍照识图在等待 `[E]:[UPLOAD_IMAGE]` 时超时，执行 `STEP5_VISION_TROUBLESHOOTING.md`。该步骤保持文字、语音和图片统一走百度智能云 BRTC Default Agent，不恢复旧版客户端模型配置，也不增加 HTTP 识图兜底；它会逐阶段验证 Default Agent 创建、WebSocket 握手、图片事件、分片和最终回答，验收标准是使用 `西红丝.jpg` 实际识别出番茄/西红柿并跑通首页添加食材。

若体验版中的文字问答和拍照识图同时不可用，且日志只看到 `wechat_miniapp_login` 的 `Shutdown / WallClockTime`，先执行 `STEP6_EDGE_RUNTIME_DIAGNOSIS.md`。该步骤会核对体验版、代理、Secrets、函数部署和日志是否属于同一 Supabase 项目，并按登录 session、ws-sign/BRTC、Storage、BRTC 图片识别顺序恢复共同链路；单独的 Shutdown 事件不能作为函数迁移失败的结论。

若 BRTC 文字回复正常，但体验版既不能随文本流式播报，也不能通过“朗读”按钮播放完整音频，执行 `STEP7_RTC_AUDIO_PLAYBACK.md`。该步骤会先验证真实 BRTC 二进制帧格式和事件顺序，再分别检查 WebAudio 解锁/队列与 WAV/InnerAudioContext 播放，禁止通过恢复旧 TTS 服务绕开问题。

## 1. 结论与基线

本回填包的可信基线不是当前仓库的 `main`，而是 Downloads 中的原始云端归档：

`app-c6x1q6fsddz5_app_version-ck2iyq5poc1s.zip`

证据：

- ZIP 创建时间：2026-06-25 11:10:18 +0800。
- 当前目录创建时间：2026-06-25 11:10:55 +0800，只晚 37 秒。
- ZIP 内含云端仓库 `.git`，HEAD 为 `89269e9d`（2026-06-24 18:12:58，提交说明为“提交域名配置清单给秒哒平台”）。
- 当前 `main` 的所谓 `initial clean snapshot` 创建于 2026-06-29，晚于下载时间，且 Git 历史在当天被重写，不能作为原始云端基线。
- 除本次为消除 `TS2367` 增加的异步取消类型守卫外，原有产品代码的最后修改时间集中在 2026-07-01 至 2026-07-03；没有发现其后混入的其他业务代码。

补丁只比较 ZIP 中实际交付的业务文件与当前完成态。总计 37 个文件，新增 4455 行，删除 781 行。

## 2. 回填顺序

请让云端 Agent 严格按顺序读取并实施 `patches/` 中的文件。每个文件都是完整 unified diff，包含新增、修改和删除操作。

1. `0001-backfill-core-client-RTC-and-data-helpers.patch`
   核心客户端、RTC/WebSocket、数据库接口、全局状态、隐私弹窗、Markdown 文本和营养解析工具。16 个文件，`+1042/-135`。
2. `0002-backfill-pages-chat-rendering-and-nutrition-flows.patch`
   聊天、首页、历史记录、食谱、统计、家庭成员、提醒设置和 Markdown 渲染。8 个文件，`+1529/-526`。
3. `0003-backfill-Supabase-proxy-edge-functions-and-secrets-m.patch`
   Supabase Edge Functions、BRTC 签名、云端对话历史、上传/微信登录变量兼容、函数清单。7 个文件，`+521/-120`。
4. `0004-backfill-fresh-project-Supabase-schema-import.patch`
   完整数据库导入脚本。仅在新 Supabase 项目或经确认的残缺 schema 上执行，见第 4 节。1 个文件，`+619`。
5. `0005-backfill-regression-and-RTC-integration-checks.patch`
   纯函数、流式消息、RTC 历史和端到端检查脚本。4 个文件，`+741`。
6. `0006-backfill-ignore-local-credentials-and-CodeGraph-inde.patch`
   忽略 `.env*` 和本地 CodeGraph 索引，防止凭据/索引误提交。1 个文件，`+3`。

如果云端 Agent 不能直接应用 Git patch，应逐个文件按 `diff --git`、`---/+++` 和 hunk 内容修改；不得只参考 patch 的摘要。

## 3. 可直接发给云端 Agent 的指令

```text
以 2026-06-25 11:10 下载的 app-c6x1q6fsddz5 云端版本为基线。
严格按文件名顺序实施我提供的 0001 至 0006 patch；每个 patch 都是完整 unified diff。
新增、修改、删除必须全部执行，不得省略删除项，也不得用旧 main 分支自行推断。

先完成 0001、0002、0003，再做类型检查和脚本检查。
0004 是数据库导入脚本：先检查目标 Supabase schema 和策略，确认适用后再在 SQL Editor 执行。
0005 是验证脚本，必须保留并运行。
0006 只保护本地凭据和索引。

不要回填本地 package.json 构建命令、pnpm-lock.yaml 安装抖动、微信开发者工具私有配置、.env、supabase/.temp、dist、node_modules 或本地报告。
完成后按本文的 Supabase 与微信域名清单配置环境，并报告每个 patch 的实际文件清单和检查结果。
```

## 4. Supabase 回填与配置

### 4.1 Edge Functions

部署或更新：

- `ws-sign`：鉴权当前 Supabase 用户，服务端创建百度 RTC Agent，返回带 token 的 WebSocket URL。
- `brtc-history`：鉴权当前用户，服务端签名请求百度 RTC 对话历史并分组返回。
- `upload-food-image`：优先读取 `APP_SUPABASE_*`，兼容平台注入的标准 `SUPABASE_*`。
- `wechat_miniapp_login`：同样兼容 `APP_SUPABASE_*`，并通过微信 code 创建/复用 Supabase 用户。

删除：

- `tts-minimax`：客户端已迁移到 RTC 音频链路，不再使用该函数。

### 4.2 Edge Function 环境变量

必须设置或确认：

- `APP_SUPABASE_URL` 或平台内置 `SUPABASE_URL`
- `APP_SUPABASE_ANON_KEY` 或平台内置 `SUPABASE_ANON_KEY`
- `APP_SUPABASE_SERVICE_ROLE_KEY` 或平台内置 `SUPABASE_SERVICE_ROLE_KEY`
- `BAIDU_BCE_AK` 或 `BAIDU_BRTC_AK`
- `BAIDU_BCE_SK` 或 `BAIDU_BRTC_SK`
- `BAIDU_BRTC_APPID`
- `BAIDU_BRTC_LICENSE_KEY`
- `WECHAT_MINIPROGRAM_LOGIN_APP_ID`
- `WECHAT_MINIPROGRAM_LOGIN_APP_SECRET`

可选覆盖项：

- `BAIDU_BRTC_LICENSE_DEVICE_ID`
- `BAIDU_RTC_AGENT_CONFIG`（JSON）
- `BAIDU_RTC_AGENT_PROMPT`
- `BAIDU_RTC_AGENT_ROLE_NAME`
- `BAIDU_RTC_AGENT_MODEL`
- `BAIDU_RTC_AGENT_ASR_VAD_MS`
- `BAIDU_RTC_AGENT_ASR_VAD_WAIT_MS`
- `BAIDU_RTC_AGENT_TTS_END_DELAY_MS`

不要把 service-role key、微信 AppSecret、百度 SK 或其他服务端密钥写进客户端 `.env`、源码或 patch。

### 4.3 客户端构建变量

- `TARO_APP_SUPABASE_URL`
- `TARO_APP_SUPABASE_ANON_KEY`
- `TARO_APP_APP_ID`
- `TARO_APP_SHOW_PRIVACY_SCOPE_MODAL`，默认 `false`

如果最终仍由云 Agent 代理 Supabase，`TARO_APP_SUPABASE_URL` 必须指向代理后的 HTTPS 基址，并保持 `/auth/v1`、`/rest/v1`、`/storage/v1`、`/functions/v1` 路径及请求头透传。不能把本地 `.env` 的值直接提交回仓库。

### 4.4 数据库迁移

`0004` 新增 `supabase/migrations/00000_complete_supabase_import.sql`。它会：

- 创建/补齐业务表、枚举、索引和约束；
- 启用 RLS，并删除后重建相关策略；
- 重建用户初始化和 `updated_at` 触发器；
- 回填已有用户的 profile、主家庭成员和当前成员；
- 更新 `chat-images`、`generated-audio` bucket 属性和策略；
- 把部分表加入 Realtime publication。

虽然多数 DDL 使用 `if not exists`，它仍会替换策略、触发器和 bucket 设置。生产库执行前必须先导出 schema/策略备份并核对现有自定义策略；不要把它当成普通增量迁移盲目执行。

`supabase/config.toml` 的变化是移除 `[auth.phone] enable_confirmations = false`，保留邮箱免确认。云端实际 Auth 设置仍需在 Supabase Dashboard 核对。

## 5. 微信小程序合法域名

客户端需要配置：

- `request` 合法域名：`TARO_APP_SUPABASE_URL` 对应的 HTTPS 代理域名。
- `connectSocket` 合法域名：`wss://rtc-aiotgw.exp.bcelive.com`。
- 若存储下载/上传被拆到独立域名，还需把代理实际返回的上传、下载域名分别加入微信后台。

以下地址只由 Edge Function 服务端访问，不应要求加入小程序合法域名：

- `https://rtc-aiagent.baidubce.com`
- `https://api.weixin.qq.com`

不要关闭 `project.config.json` 中的 `urlCheck` 来绕过校验；应配置真实生产域名。

## 6. 已识别并排除的本地污染

下列差异不在回填 patch 中：

- `package.json`：把云平台刻意禁用的构建脚本改成了本地 Taro 命令，只适用于本机。
- `pnpm-lock.yaml`：没有对应依赖声明变化，属于本地安装后的解析变化。
- `project.config.json`：本地 AppID、基础库版本、压缩和开发者工具设置。
- `project.private.config.json`：本地项目名和微信开发者工具个人偏好。
- `.env`、`.env.development`、`.env.production`、`.env.test`：本地变量，可能含客户端凭据或环境标识。
- `supabase/.temp/*`：本地 Supabase CLI 版本和已链接 project ref。
- `node_modules/`、`dist/`、`.swc/`、`.codegraph/`：依赖、构建或索引产物。
- `README.md` 以及 `docs/*report*.md`：说明/审计材料，不影响产品运行。

另外，原始云端提交 `89269e9d` 中 `runLint.sh`、`checkNavigation.sh`、`checkIconPath.sh`、`checkAuthProvider.sh` 均为 `100755`；ZIP 解压后执行位丢失成 `100644`。这属于归档元数据变化，云端原仓库不应受影响。若从 ZIP 在本地验证，应先恢复这 4 个文件的执行位；不要通过改写脚本内容规避权限错误。

这些排除项仍在本地工作区中，本回填包没有删除或修改它们。

## 7. 完整性校验

补丁 SHA-256：

```text
281bb4369b61ff0ee6961c956963052d4a601fb0a952e2cd9c98b0c950378dd8  0001-backfill-core-client-RTC-and-data-helpers.patch
a7e5d284062248bb7975a1cf7bd8920d07408e6a612f44eca76665f5fd823367  0002-backfill-pages-chat-rendering-and-nutrition-flows.patch
af607775e90ece908b69483d208dea96b1831fc7b9bbc71b67c456716ebc0d43  0003-backfill-Supabase-proxy-edge-functions-and-secrets-m.patch
72e6d818516eeb5861f339039d69327f967fa7d3ddfc7cec1470a14f66f9603a  0004-backfill-fresh-project-Supabase-schema-import.patch
5788fed8aac5e7c781086f7997f98db8a33bc201daae9bc1fd36fbea6462ddf1  0005-backfill-regression-and-RTC-integration-checks.patch
79b9627d42c07431396118473d9bf53c242cbb1b4e830d0e601e05b72bd6fdb8  0006-backfill-ignore-local-credentials-and-CodeGraph-inde.patch
```

云端回填后至少运行：

```bash
pnpm exec tsc -p tsconfig.check.json --noEmit
pnpm lint
node scripts/checkAiPromptHelpers.mjs
node scripts/checkChatStreaming.mjs
node scripts/checkRtcHistoryHelpers.mjs
```

`scripts/testRtcHistoryE2e.mjs` 需要真实 Supabase/BRTC 环境变量和网络，只在测试环境运行，不要用生产 service-role key 作为客户端变量。
