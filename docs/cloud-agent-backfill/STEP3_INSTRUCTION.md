# 第三步：标准树一致性审计与部署前只读检查

## 本次建议上传的 5 个文件

1. `README.md`
2. `STEP3_INSTRUCTION.md`
3. `patches/0001-backfill-core-client-RTC-and-data-helpers.patch`
4. `patches/0002-backfill-pages-chat-rendering-and-nutrition-flows.patch`
5. `patches/0003-backfill-Supabase-proxy-edge-functions-and-secrets-m.patch`

重新上传 `0001-0003` 不是让 Agent 再应用一次，而是把它们作为最终代码的唯一标准进行逐文件审计。

## 发给云端 Agent 的指令

```text
前两步回填已报告完成。现在执行第三步：标准树一致性审计与部署前只读检查。

本步骤不是继续开发功能，也不是再次盲目应用 patch。附件 0001、0002、0003 是第一步 31 个文件的唯一标准。你在第二步报告中提到为通过测试又修改了 src/utils/aiPromptHelpers.ts 和 src/utils/rtcHistory.ts，这说明第一步可能没有逐字达到 patch 的最终状态，必须先审计，不能直接部署或执行数据库 SQL。

一、构造标准树并比对

1. 从云端原始基线提交 89269e9d 创建临时分支、临时 worktree 或其他隔离目录；不得重置、覆盖当前工作分支。
2. 在临时标准树中严格按顺序应用附件 0001、0002、0003。
3. 将临时标准树中的 31 个允许文件与当前工作分支逐文件、逐字节比较。
4. 输出全部差异文件及差异内容摘要。不能只运行测试来代替比对。
5. 若存在偏差，只允许把当前文件修正为临时标准树的内容，不得保留自行发明的兼容函数、别名、提示词或重构。

重点核对：

- src/utils/aiPromptHelpers.ts 的标准版本本来就包含中文弯引号文本：不要输出“这个啊”“看起来像”“图片中是”等前缀。
- src/utils/rtcHistory.ts 的标准版本导出 groupRtcDialogueRows；以 0001 的完整文件结果为准。若当前额外保留了 0001 中不存在的 groupRtcDialogues 或其他自行添加实现，应删除该偏差，除非你能证明它来自附件 patch。
- 不得修改测试脚本来迁就错误实现。
- 重新确认 src/utils/brtcConfig.ts 与 supabase/functions/tts-minimax/index.ts 已删除。

完成修正后再次逐字节比较，最终目标是 31 个文件与“89269e9d 应用 0001-0003 后”的标准树无差异。

二、运行完整检查

- pnpm exec tsc -p tsconfig.check.json --noEmit
- pnpm lint
- node scripts/checkAiPromptHelpers.mjs
- node scripts/checkChatStreaming.mjs
- node scripts/checkRtcHistoryHelpers.mjs

scripts/testRtcHistoryE2e.mjs 仍不得在缺少隔离测试凭据时运行。

三、环境与部署只读预检

本步骤只检查状态，不写入 secret，不部署 Edge Functions，不执行数据库 DDL/DML。

1. TARO_APP_SHOW_PRIVACY_SCOPE_MODAL 缺失不是构建阻断项，代码默认值为 false。不要把它写入受版本控制的 .env。请报告云端构建变量中是否显式配置；如未配置，记录“使用默认 false”。
2. 解析 TARO_APP_SUPABASE_URL 的实际生产 hostname，确认代理保持 /auth/v1、/rest/v1、/storage/v1、/functions/v1 路径与必要请求头透传。只报告 hostname，不输出 key。
3. 通过 Supabase Dashboard 或安全 CLI 只检查以下 secret 是否存在，只能报告 present/missing，禁止输出值：
   APP_SUPABASE_URL 或 SUPABASE_URL；
   APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY；
   APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY；
   BAIDU_BCE_AK 或 BAIDU_BRTC_AK；
   BAIDU_BCE_SK 或 BAIDU_BRTC_SK；
   BAIDU_BRTC_APPID；
   BAIDU_BRTC_LICENSE_KEY；
   WECHAT_MINIPROGRAM_LOGIN_APP_ID；
   WECHAT_MINIPROGRAM_LOGIN_APP_SECRET。
4. 只读检查 ws-sign、brtc-history、upload-food-image、wechat_miniapp_login 当前是否已部署，以及其版本/更新时间；不要在本步骤部署。
5. 确认微信后台 request 合法域名包含生产 Supabase 代理 HTTPS hostname，connectSocket 合法域名包含 wss://rtc-aiotgw.exp.bcelive.com。无法访问微信后台时明确写“无法验证”，不能把代码配置当成后台已配置的证据。

四、数据库迁移只读评估

不得执行 supabase/migrations/00000_complete_supabase_import.sql。

只读盘点目标 Supabase 当前的：
- public schema 表、列、类型、约束和索引；
- RLS 启用状态与 policies；
- triggers 和相关 functions；
- supabase_realtime publication；
- chat-images、generated-audio buckets 及 storage policies。

将盘点结果与 00000_complete_supabase_import.sql 比较，按以下类别报告：
- 已存在且一致；
- 缺失，可安全新增；
- 已存在但定义不同；
- 会被 migration 删除并重建；
- 会发生数据回填或 bucket 属性变化。

不要执行任何 create、alter、drop、insert、update、delete、grant 或 policy/trigger 变更。

五、完成报告格式

必须按以下结构回复：

1. 标准树一致性：31 个文件是否 0 差异；如曾有偏差，列出文件和修正内容。
2. 特别偏差核对：aiPromptHelpers.ts、rtcHistory.ts 当前是否与 0001 完全一致；是否存在额外 groupRtcDialogues。
3. 检查结果：逐条列出五个检查命令结果。
4. Secrets：只列变量名和 present/missing/无法验证，不得显示值。
5. Edge Functions：只列 deployed/not deployed/无法验证及版本时间，不执行部署。
6. 微信合法域名：verified/missing/无法验证。
7. 数据库差异评估：按上述五类列出。
8. 最终结论只能是“可以进入受控部署阶段”或“存在阻断项”，并列出阻断项。

本步骤结束后停止，等待用户对 Edge Functions 部署和数据库迁移分别授权。不得自行执行生产变更。
```

## 本步骤允许修改的范围

原则上不应产生代码修改。只有当当前第一步 31 个文件与标准树不一致时，才允许把偏差文件恢复到 `89269e9d + 0001-0003` 的标准结果。

禁止修改：

```text
supabase/migrations/00000_complete_supabase_import.sql
scripts/checkAiPromptHelpers.mjs
scripts/checkChatStreaming.mjs
scripts/checkRtcHistoryHelpers.mjs
scripts/testRtcHistoryE2e.mjs
.gitignore
.env*
supabase/.temp/*
```

禁止执行任何生产部署、Secrets 写入或数据库变更。

