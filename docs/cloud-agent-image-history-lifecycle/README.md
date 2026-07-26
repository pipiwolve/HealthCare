# 图像存储与历史时间逻辑迁移包

本目录用于把本地已经验证过的食材图片存储、图片生命周期、BRTC 历史日期分组和相关清除逻辑迁移到云端仓库。

## 基线与文件

- 本地基线：`51d36e25 feat: add WeChat workflows and device test fixes`
- `0001-code-and-tests.patch`：客户端、Edge Function 配置、BRTC 历史逻辑和检查脚本；不执行数据库变更。
- `0002-database-migration.patch`：只新增 `supabase/migrations/00006_food_image_lifecycle.sql`。
- `CLOUD_AGENT_PROMPT.md`：给云端 Agent 的完整执行指令。
- `SEND_TO_CLOUD_AGENT.txt`：可以直接复制发送的短指令。

补丁校验值：

- `0001-code-and-tests.patch` SHA-256：`280c4b399bdc09d00ac461d6f913b774ca01d157669b8e4d0ed4c36bd034dd3e`
- `0002-database-migration.patch` SHA-256：`8d69388157fdb3627f82a3f3728e68c63da430728c2e3ec080e8489f770fd1da`

补丁是相对上述基线生成的增量。目标仓库如果已有部分功能，必须先检查工作区并使用三方合并，不能整文件覆盖云端已经验证的业务代码。

## 本次代码范围

### 食材图片

- 客户端在入库前生成两份 JPEG：
  - 大图：最长边不超过 `1280px`，不超过 `300KB`；
  - 缩略图：最长边不超过 `320px`，目标约 `40KB`，硬上限 `50KB`。
- 图片上传必须经过 `upload-food-image`，路径隔离为：
  - `{user_id}/{image_id}/large.jpg`
  - `{user_id}/{image_id}/thumb.jpg`
- 大图默认保留 30 天；缩略图通过称重记录关联长期保留。
- 称重历史优先懒加载缩略图，点击时使用原生全屏预览；大图到期后自动回退到缩略图；加载失败显示占位。
- `food-image-cleanup` 负责删除过期大图和未关联图片对象。

### BRTC 历史和时间

- BRTC 默认查询最近 30 天，保留单页最多 100 个会话。
- 会话内部仍按相邻消息超过 30 分钟切分。
- 前端外层按 `Asia/Shanghai` 自然日分组，默认展开最新日期。
- 跨午夜会话归属到第一条用户消息所在日期。
- 个人资料中的“清除 AI 记忆与旧版对话”会调用 BRTC `/contexts` 删除接口，并清理旧版本地对话。

## 推荐执行顺序

1. 在云端仓库记录当前 `HEAD`、分支、工作区和 Supabase project ref。
2. 只应用 `0001-code-and-tests.patch`，先完成代码合并、静态检查和小程序构建。
3. 检查 `chat-images` bucket、Edge Function 环境变量和旧的匿名上传策略，但此时不要执行数据库迁移。
4. 校准远端 Supabase 迁移历史后，再应用 `0002-database-migration.patch`，只执行 `00006_food_image_lifecycle.sql`。
5. 部署 `upload-food-image`、`food-image-cleanup` 和 `brtc-history`；为清理函数配置 `FOOD_IMAGE_CLEANUP_SECRET`。
6. 在微信开发者工具中验收图片压缩、历史缩略图、全屏预览、BRTC 日期分组和清除按钮。

## 明确禁止

- 不要直接执行普通 `supabase db push`，因为远端迁移历史可能与本地不一致。
- 不要在未确认目标 project ref 的情况下部署函数或执行 SQL。
- 不要输出任何 AppSecret、service-role key、anon key、清理密钥或用户数据。
- 不要点击真实删除确认框进行破坏性验收；删除逻辑只能使用测试账号和明确授权。

## 本地已通过的检查

- `scripts/checkFoodImageCompression.mjs`
- `scripts/checkRtcHistoryHelpers.mjs`
- `scripts/checkChatStreaming.mjs`
- `pnpm run build:weapp`
- `git diff --check`

全量 TypeScript 检查仍有仓库既有的 Taro 依赖类型错误和少量未使用变量错误，不能把这些环境问题误判为本补丁失败。
