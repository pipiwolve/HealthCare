# 第二步：数据库迁移、验证脚本与最终配置

## 本次上传的 4 个文件

1. `STEP2_INSTRUCTION.md`：本指令。
2. `patches/0004-backfill-fresh-project-Supabase-schema-import.patch`
3. `patches/0005-backfill-regression-and-RTC-integration-checks.patch`
4. `patches/0006-backfill-ignore-local-credentials-and-CodeGraph-inde.patch`

## 发给云端 Agent 的指令

```text
这是两步回填任务的第二步。开始前先确认上一轮 0001、0002、0003 已全部完成；如第一步仍有失败或未解决冲突，立即停止并报告，不能在残缺代码上继续。

本次只处理随消息上传的 0004、0005、0006 三个 patch，严格按编号顺序完整实施。

执行要求：
1. 0004 只负责把 supabase/migrations/00000_complete_supabase_import.sql 完整加入代码仓库。
2. 不要未经确认直接在生产 Supabase 执行该 SQL。它会替换 RLS 策略、触发器和 Storage bucket 设置，并回填数据；执行前必须备份 schema/策略并核对现有自定义配置。
3. 0005 新增四个验证脚本，所有文件必须完整创建。
4. 0006 只修改 .gitignore，加入 .env、.env.* 和 .codegraph/。
5. 不要修改本次三个 patch 以及第一步既定范围之外的文件。
6. 不要提交任何真实 secret、service-role key、微信 AppSecret、百度 SK、.env 内容或 supabase/.temp linked-project 信息。

完成代码回填后运行：
- pnpm exec tsc -p tsconfig.check.json --noEmit
- pnpm lint
- node scripts/checkAiPromptHelpers.mjs
- node scripts/checkChatStreaming.mjs
- node scripts/checkRtcHistoryHelpers.mjs

scripts/testRtcHistoryE2e.mjs 只允许在具备测试环境 Supabase/BRTC 凭据时运行；不得把生产 service-role key 放到客户端环境或日志中。

随后核对部署配置，但只写变量名，不在回复中输出变量值：
- 客户端：TARO_APP_SUPABASE_URL、TARO_APP_SUPABASE_ANON_KEY、TARO_APP_APP_ID、TARO_APP_SHOW_PRIVACY_SCOPE_MODAL。
- Edge Functions：APP_SUPABASE_URL/标准 SUPABASE_URL、APP_SUPABASE_ANON_KEY/标准 SUPABASE_ANON_KEY、APP_SUPABASE_SERVICE_ROLE_KEY/标准 SUPABASE_SERVICE_ROLE_KEY、百度 BRTC AK/SK/APPID/LICENSE_KEY、微信登录 APP_ID/APP_SECRET。
- 微信 request 合法域名：TARO_APP_SUPABASE_URL 对应的生产 HTTPS 代理域名。
- 微信 connectSocket 合法域名：wss://rtc-aiotgw.exp.bcelive.com。

只有在数据库备份和策略核对完成后，才可以请求用户确认是否执行 00000_complete_supabase_import.sql。不要自行在生产库执行。

完成后回复以下内容：
- “第二步回填完成”或明确失败原因；
- 0004、0005、0006 各自实际新增/修改的文件清单；
- 全部检查命令的结果；
- Edge Functions 和环境变量的配置状态，只报告已配置/缺失，不输出值；
- 数据库 SQL 当前状态必须是“仅已加入仓库，等待确认”或说明用户已明确授权执行；
- 最终确认没有修改排除项、没有泄露密钥。
```

## 本步骤允许的文件范围

### 0004：数据库导入脚本，共 1 个文件

```text
supabase/migrations/00000_complete_supabase_import.sql   [新增]
```

### 0005：验证脚本，共 4 个文件

```text
scripts/checkAiPromptHelpers.mjs                         [新增]
scripts/checkChatStreaming.mjs                           [新增]
scripts/checkRtcHistoryHelpers.mjs                       [新增]
scripts/testRtcHistoryE2e.mjs                            [新增]
```

### 0006：仓库保护规则，共 1 个文件

```text
.gitignore
```

第二步合计只能涉及以上 6 个文件。两步全部完成后，整体回填范围应为 37 个文件。

