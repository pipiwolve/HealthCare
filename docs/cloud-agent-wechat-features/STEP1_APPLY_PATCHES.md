# 第一步：应用微信功能补丁

可信前置基线：云端已经完整应用旧回填包 `0001-0006`。

严格按以下顺序应用：

1. `0001-wechat-auth-and-core-schema.patch`
2. `0002-one-time-subscribe-notifications.patch`
3. `0003-recipe-share-and-canvas-poster.patch`
4. `0004-regression-checks-and-deployment-docs.patch`
5. `0005-template-fields-and-poster-background.patch`
6. `0006-auth-chat-voice-ui.patch`
7. `0007-poster-layout-and-stats-member-switch.patch`
8. `0008-local-gender-avatar-assets.patch`

要求：

- 不修改补丁范围外的 RTC、聊天、营养解析或 Markdown 渲染逻辑。
- `00005_wechat_auth_notifications_recipe_shares.sql` 只提交到仓库，本步骤不得执行生产迁移。
- 不写入真实 AppSecret、service-role key、手机号、模板 ID 或调度密钥。
- 若某个 hunk 不匹配，先报告目标文件差异并做语义合并，不得整文件覆盖。
- `0005` 包含压缩后的 `1080×1440` JPEG 菜谱底板，以及餐食、饮水模板的实际字段映射。
- `0006` 增加微信首登头像昵称底部弹层，修复 RTC TTS 尾帧和 PCM 播放队列，改为微信式输入栏，移除聊天识图入口，并为海报铺设不透明白底。
- `0007` 扩大菜谱海报正文区域并支持步骤多行排版，同时为统计页增加家庭成员切换和按成员重新查询。
- `0008` 增加裁切后的本地男女圆形头像 PNG，并移除默认头像对远程 CDN 的依赖。

应用完成后运行：

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

若 `runLint.sh` 因归档丢失执行位失败，应通过 `bash` 分别执行其中三个 shell 检查，不要改写脚本内容。

完成后报告每个 patch 的实际文件清单、检查结果和冲突处理，然后暂停等待部署授权。

## SHA-256

```text
26ecbb4009ab20c4a3bfc56c0ba86948c0b527080492ee04b4a62ad422d927bb  0001-wechat-auth-and-core-schema.patch
1334a8bdf971a0e1389ba644fa680ec0709a42eedaf25ffea45376ddfcff6277  0002-one-time-subscribe-notifications.patch
8471bb5db02581b38a24d6a1c315967e31c7f9910780be91677889d7b0d7cb6b  0003-recipe-share-and-canvas-poster.patch
dcea7587abada5c85b744c9ddd2cc9e14f0d095fca0b1e35519228c653943b46  0004-regression-checks-and-deployment-docs.patch
dda90af87715328c835beae0b0ef10e66b760991dadcd0c8e4b405a6d912c7e3  0005-template-fields-and-poster-background.patch
3521245f9ec40ea61fb78da8d2c52d987d32b89a99350497b0a38fe75bf3e155  0006-auth-chat-voice-ui.patch
e686dbfbf02a59ac0f0870865f076d7dd260833587ca1480723b8f505c249a91  0007-poster-layout-and-stats-member-switch.patch
903bf26f4deb704eb0fe54728ec4b5214912546ad64a4315d10de59ea6f9a09c  0008-local-gender-avatar-assets.patch
```
