# 云端 Agent 执行指令：图像存储与历史时间逻辑

请将本目录中的两个补丁迁移到目标仓库，并按“代码先、数据库后、最后部署和验收”的顺序执行。不要只回复“已修复”，必须回传命令和检查结果。

## 1. 现场检查

```bash
rtk git status --short
rtk git rev-parse --short HEAD
rtk git log -5 --oneline
rtk supabase projects list
```

确认目标仓库不是在应用补丁时被其他人同时修改。不要使用 `git reset --hard` 或 `git checkout --`。

## 2. 应用代码补丁

先检查，再应用：

```bash
rtk git apply --check docs/cloud-agent-image-history-lifecycle/0001-code-and-tests.patch
rtk git apply --3way docs/cloud-agent-image-history-lifecycle/0001-code-and-tests.patch
```

如果发生冲突：

- 保留云端已经验证的 BLE、登录、聊天和其他业务能力；
- 只合入本补丁涉及的图片、BRTC 历史、时区和清除逻辑；
- `src/pages/home/index.tsx`、`src/db/api.ts`、`src/pages/chat/index.tsx` 含有相邻功能改动，不能用云端旧文件整文件覆盖；
- 记录所有冲突文件和最终处理方式。

代码阶段必须确认以下文件存在且逻辑完整：

```text
src/utils/foodImage.ts
src/utils/foodImageCompression.ts
src/services/foodImageStorage.ts
src/db/types.ts
src/db/api.ts
src/pages/home/index.tsx
src/pages/personal-info/index.tsx
src/pages/chat/index.tsx
src/utils/rtcHistory.ts
supabase/functions/upload-food-image/index.ts
supabase/functions/food-image-cleanup/index.ts
supabase/functions/brtc-history/index.ts
supabase/config.toml
```

## 3. 代码验收，不执行数据库变更

```bash
rtk test node scripts/checkFoodImageCompression.mjs
rtk test node scripts/checkRtcHistoryHelpers.mjs
rtk test node scripts/checkChatStreaming.mjs
rtk pnpm run build:weapp
rtk git diff --check
```

重点检查：

- 客户端压缩大图和缩略图时确实读取文件大小，并在超限时降低质量重试；
- 上传请求同时携带 `largeImage`、`thumbnailImage` 和尺寸元数据；
- Edge Function 从 JWT 获取 `user_id`，不信任客户端传入的用户 ID；
- 大图上限 300KB，缩略图上限 50KB，路径包含用户 ID 和图片 ID；
- 大图过期后历史列表使用缩略图，点击仍能调用 `Taro.previewImage`；
- BRTC 默认 30 天、30 分钟会话分段、最多 100 个会话；
- 删除操作使用经过认证的 BRTC `/contexts` DELETE；
- 日期分组使用 `Asia/Shanghai`，跨午夜会话按首条消息日期归属。

## 4. 数据库迁移阶段

先只读确认迁移历史和对象状态：

```bash
rtk supabase migration list
rtk supabase db diff --linked --schema public
rtk supabase inspect db table-stats --linked
```

远端迁移历史若与本地 `00000`～`00005` 不一致，禁止直接 `supabase db push`。先由项目负责人完成迁移历史校准，再执行：

```bash
rtk git apply --check docs/cloud-agent-image-history-lifecycle/0002-database-migration.patch
rtk git apply docs/cloud-agent-image-history-lifecycle/0002-database-migration.patch
rtk supabase db push --linked
```

迁移只允许新增并执行 `00006_food_image_lifecycle.sql`，不得重放旧迁移。迁移后确认：

- `public.food_images` 存在，包含大图/缩略图路径、大小、尺寸、`large_expires_at`、`large_deleted_at`；
- `public.food_image_records` 存在并关联 `weighing_records`；
- 称重记录触发器能从 `ingredients[].image_id` 建立关联；
- `get_food_images_for_cleanup(batch_size)` 只授予 `service_role` 执行权限；
- 两张表启用 RLS，客户端没有直接写入权限；
- `chat-images` bucket 已存在。

## 5. 函数和密钥部署

只有得到目标环境部署授权后执行：

```bash
rtk supabase functions deploy upload-food-image
rtk supabase functions deploy food-image-cleanup
rtk supabase functions deploy brtc-history
```

确认以下变量名称存在，但不要输出值：

```text
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
BAIDU_BCE_AK / BAIDU_BCE_SK / BAIDU_BRTC_APPID
FOOD_IMAGE_CLEANUP_SECRET
```

`food-image-cleanup` 在 Supabase 配置中使用 `verify_jwt = false`，但必须通过 `x-dispatch-secret` 校验清理密钥。不得为了方便把清理函数改成公开可调用。

## 6. 微信开发者工具验收

使用测试账号完成以下非破坏性验收：

1. 选择 `/Users/chenpengjian/Downloads/西红丝.jpg` 或同类图片，确认压缩成功、大图和缩略图上传成功。
2. 添加食材并完成一次称重记录，确认 `image_id` 写入 ingredients，并触发 `food_image_records` 关联。
3. 打开称重历史，确认列表优先加载缩略图，点击图片进入原生全屏预览。
4. 将测试数据的 `large_expires_at` 调整到过去后，确认列表回退缩略图，不影响历史记录。
5. 打开 AI 对话历史，确认按“今天/昨天/具体日期”分组，日期可折叠，会话仍按 30 分钟切分。
6. 只检查清除按钮的确认文案和请求范围；没有明确授权时不要确认真实删除。

## 7. 回传报告

```markdown
# 图像与历史迁移报告

## 补丁
- 云端原始 HEAD：
- 0001 应用方式：direct/3way/manual
- 0002 应用方式：direct/3way/manual
- 冲突文件及处理：

## 检查
- food image check：PASS/FAIL
- RTC history check：PASS/FAIL
- chat check：PASS/FAIL
- weapp build：PASS/FAIL
- diff check：PASS/FAIL

## 数据库
- 迁移历史校准方式：
- 00006 执行结果：
- food_images / food_image_records / trigger / cleanup RPC：

## 部署
- functions：
- secrets 名称确认：
- 微信体验版验收：
- 未完成项与风险：
```
