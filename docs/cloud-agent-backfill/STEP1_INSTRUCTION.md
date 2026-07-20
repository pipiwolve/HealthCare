# 第一步：核心产品代码与 Supabase Edge Functions

## 本次上传的 5 个文件

1. `README.md`：完整背景和配置说明，只用于理解任务。
2. `STEP1_INSTRUCTION.md`：本指令。
3. `patches/0001-backfill-core-client-RTC-and-data-helpers.patch`
4. `patches/0002-backfill-pages-chat-rendering-and-nutrition-flows.patch`
5. `patches/0003-backfill-Supabase-proxy-edge-functions-and-secrets-m.patch`

## 发给云端 Agent 的指令

```text
这是两步回填任务的第一步。本次只处理随本消息上传的 0001、0002、0003 三个 patch，必须严格按编号顺序完整实施。

可信基线是 2026-06-25 11:10 下载的 app-c6x1q6fsddz5 云端版本；其云端 Git HEAD 为 89269e9d。README.md 仅提供背景和配置说明，不是需要应用的 patch。

执行要求：
1. 先实施 0001，再实施 0002，最后实施 0003。
2. 每个 patch 都是完整 unified diff。所有新增、修改、删除必须执行，不能只根据摘要重写，也不能遗漏删除项。
3. 明确删除 src/utils/brtcConfig.ts 和 supabase/functions/tts-minimax/index.ts。
4. 不要修改本次三个 patch 范围之外的业务文件。
5. 不要回填本地 package.json 构建命令、pnpm-lock.yaml、project.config.json、project.private.config.json、.env*、supabase/.temp、dist、node_modules 或本地报告。
6. 本步骤只回填 Edge Function 源码和 secrets manifest；不要执行数据库 SQL，不要创建 0004 中的迁移，不要提前执行第二步。

完成代码修改后运行：
- pnpm exec tsc -p tsconfig.check.json --noEmit
- pnpm lint

如某个 hunk 与当前云端文件不完全匹配，必须基于同一文件的语义人工合并，并逐项说明冲突位置和最终处理；不得跳过整个文件。

完成后回复以下内容：
- “第一步回填完成”或明确失败原因；
- 0001、0002、0003 各自实际修改/新增/删除的文件清单；
- TypeScript 和 lint 的结果；
- 是否存在超出 patch 的改动，正常答案应为“否”；
- 暂停并等待第二步文件，不要自行继续数据库迁移或部署配置。
```

## 本步骤允许的文件范围

### 0001：核心客户端与工具，共 16 个文件

```text
config/index.ts
src/app.config.ts
src/app.scss
src/client/supabase.ts
src/db/api.ts
src/db/types.ts
src/services/aiWebSocket.ts
src/store/appStore.tsx
src/utils/aiPromptHelpers.ts
src/utils/allergenUtils.ts
src/utils/bleService.ts
src/utils/brtcConfig.ts                         [删除]
src/utils/markdownText.ts                       [新增]
src/utils/nutrition.ts                          [新增]
src/utils/rtcHistory.ts                         [新增]
src/utils/wechatPrivacy.ts                      [新增]
```

### 0002：页面与渲染，共 8 个文件

```text
src/components/MarkdownRenderer.tsx
src/pages/chat/index.tsx
src/pages/family-edit/index.tsx
src/pages/home/index.tsx
src/pages/privacy/index.tsx
src/pages/recipe/index.tsx
src/pages/reminder-settings/index.tsx
src/pages/stats/index.tsx
```

### 0003：Supabase Edge Functions，共 7 个文件

```text
supabase/config.toml
supabase/functions/brtc-history/index.ts        [新增]
supabase/functions/tts-minimax/index.ts          [删除]
supabase/functions/upload-food-image/index.ts
supabase/functions/wechat_miniapp_login/index.ts
supabase/functions/ws-sign/index.ts
supabase/secrets/required.json
```

第一步合计只能涉及以上 31 个文件。

