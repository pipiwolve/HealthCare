# 云端 Agent 指令：应用本次增量补丁

## 目标与可信基线

将本次本地新增的微信登录与账户、一次性订阅通知、菜谱分享、聊天音频/UI 和统计页改动，同步回云端代码仓库。

可信前置状态是：云端已完整完成旧回填包 `docs/cloud-agent-backfill/patches/0001-0006`。本包只包含该状态之后的增量，不得再次应用旧补丁，也不得从其他本地目录整树覆盖。

本轮上传正好 5 个文件：本指令和下列 4 个 patch。严格按编号执行。

## 强制边界

- 不提交、显示或复制 `.env`、`.env.*`、Supabase Secret 值、service-role key、微信 AppSecret、百度 AK/SK、linked-project 信息或 `supabase/.temp/**`。
- 不纳入 `supabase/schema.sql`、`dist/**`、`node_modules/**`、`.codegraph/**` 或任何 `docs/cloud-agent-*/**` 打包产物。
- 本轮只改代码并执行本地静态检查；不得执行生产数据库迁移、修改 Secrets、部署 Edge Functions、创建调度器或发布小程序。
- 补丁包含 PNG/JPEG 的 Git binary patch，必须用 Git 应用，不得复制终端中显示的二进制片段。
- 不要恢复旧的图片识别接口或降级链路；保留当前统一走百度智能云 BRTC Default Agent 的设计。

## 应用顺序

先记录当前提交和工作树状态。若工作树有云端 Agent 自己的未提交修改，先报告并确认不会覆盖。

依次执行：

```bash
git apply --check 0001-incremental-WeChat-auth-profile-and-schema.patch
git apply --binary 0001-incremental-WeChat-auth-profile-and-schema.patch

git apply --check 0002-incremental-one-time-subscribe-notifications.patch
git apply --binary 0002-incremental-one-time-subscribe-notifications.patch

git apply --check 0003-incremental-recipe-share-and-canvas-poster.patch
git apply --binary 0003-incremental-recipe-share-and-canvas-poster.patch

git apply --check 0004-incremental-chat-audio-UI-stats-and-checks.patch
git apply --binary 0004-incremental-chat-audio-UI-stats-and-checks.patch
```

如果某个 `--check` 失败，立即停止后续补丁。先输出失败文件、hunk 和该文件当前差异；只有在确认云端已有等价修改时才做逐文件语义合并。不得使用整文件覆盖、`git reset --hard`、`git checkout --` 或跳过失败继续执行。

## 补丁范围

### 0001：微信认证、账户、头像与数据库基础

22 个文件：应用路由、Supabase 客户端、RouteGuard/AuthContext、登录页、个人页、账户设置、首登资料页、微信认证服务、登录重定向、默认男女头像、共享 Edge Function 工具、`wechat_miniapp_login`、`upload-avatar`、Supabase 函数配置、Secret 名称清单和增量迁移。

迁移文件 `supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql` 本轮只加入仓库，不执行。

### 0002：一次性订阅通知

6 个文件：提醒设置页、通知服务、通知 payload 映射、schedule/dispatch Edge Functions 和 payload 回归测试。

### 0003：菜谱分享与海报

10 个文件：菜谱详情、公开分享页、分享服务、海报与分享文案工具、`recipe-share` Edge Function、测试脚本、海报背景说明和 1080x1440 JPEG 底板。

### 0004：聊天音频、UI、统计与综合检查

6 个文件：聊天页、`aiWebSocket`、流式音频检查脚本、微信功能综合检查、家庭成员统计切换和部署清单。

聊天音频应保留两种能力：流式回复过程中按 PCM 队列顺序播放，以及回复结束后通过“朗读”按钮重新播放已收集音频。

## 完整检查

依次执行并记录每条命令的退出码与失败摘要：

```bash
pnpm exec tsc -p tsconfig.check.json --noEmit
bash scripts/runLint.sh
pnpm build:weapp
node scripts/checkAiPromptHelpers.mjs
node scripts/checkChatStreaming.mjs
node scripts/checkRtcHistoryHelpers.mjs
node scripts/checkWechatFeatures.mjs
pnpm exec tsx scripts/testRecipeShareContent.mts
pnpm exec tsx scripts/testNotificationPayload.mts
```

若 `scripts/runLint.sh` 只因执行位丢失而不能直接运行，仍使用上面的 `bash` 调用，不要为此修改脚本。

再执行安全与范围检查：

```bash
git diff --check
git status --short
git diff --name-status
```

确认不存在真实 Secret 内容、`.env`、`supabase/.temp`、`supabase/schema.sql`、构建产物和补丁文档进入待提交范围。

## 完成报告格式

报告以下内容后暂停，等待单独的部署授权：

1. 四个 patch 是否按顺序成功应用，以及每个 patch 的实际文件清单。
2. 是否发生冲突；如发生，逐文件说明原因和合并方法。
3. 九条检查命令的结果。
4. `git diff --name-status` 与预期 44 个产品/测试/部署文档文件是否一致。
5. 明确声明未执行数据库迁移、未部署 Edge Functions、未修改 Secrets、未传输任何真实环境变量值。

## SHA-256

```text
1af479d14b0a639423eb1e4e180dd40d441ad6790b78e81abb3ee3e6daf5878a  0001-incremental-WeChat-auth-profile-and-schema.patch
c6ca2ef4437d3017e6c54409ac2bd58caff98107d45abf46dbff628996c9cdb4  0002-incremental-one-time-subscribe-notifications.patch
d1e63148279aef8c747d53f9de30cc3f2334f75dab89c9fc6fd536db5fc3b6fd  0003-incremental-recipe-share-and-canvas-poster.patch
f0c05932f80145de97f67d55a71ee17fb86bb82f68a6e0254158cfed1dd6c54e  0004-incremental-chat-audio-UI-stats-and-checks.patch
```
