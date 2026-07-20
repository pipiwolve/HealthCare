# 发给云端 Agent 的完整执行指令

请在目标云端仓库中完成本轮真机问题补丁的合并、构建、受控部署和体验版验证。必须逐项执行并返回证据，不得只回复“已修复”。

## 一、任务目标

处理以下问题：

1. 拍照识图后立即显示图片，添加食材后继续在食材列表和历史记录中显示。
2. AI 问答 placeholder 垂直居中；键盘展开时输入栏不被覆盖；键盘关闭时输入控件贴近底部原生 TabBar，不重复叠加 Home Indicator 安全区。
3. 语音输入模式删除右侧机器人按钮。
4. 家庭成员支持微信自定义头像上传，并在成员列表、统计切换和个人中心显示。
5. 添加设备扫描列表只展示设备名精确为 `Bai` 的设备。
6. 只有设备名为 `Bai` 且 RSSI 大于 `-60dBm` 时，才弹出“发现推荐设备”。
7. 个人中心营养秤状态卡使用秤图标，设备管理菜单继续使用蓝牙图标。
8. 首页和个人中心显示数据库绑定时的自定义名称，不得被广播名 `Bai` 覆盖。
9. 确认提醒来源为微信小程序一次性订阅消息，并修正 Cron 调用目标。

## 二、必须先阅读

1. `docs/cloud-agent-device-test-fixes/COMPLETE_DIFF.md`
2. `docs/device-test-fix-and-cloud-verification.md`
3. `docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md`
4. `docs/wechat-feature-deployment.md`

## 三、合并边界

本地工作区原本存在大量未提交改动。禁止使用以下操作：

- `git reset --hard`
- `git checkout -- <file>`
- 用云端旧版整文件覆盖当前 `home/index.tsx`、`chat/index.tsx`、`stats/index.tsx`
- 回退百度 BRTC、AI 流式回答、微信登录、菜谱分享或既有 Supabase 配置

必须以当前文件为基础进行增量合并，重点核对：

```text
src/pages/home/index.tsx
src/pages/chat/index.tsx
src/utils/bleService.ts
src/pages/device-add/index.tsx
src/utils/avatarUtils.ts
src/pages/family-edit/index.tsx
src/pages/family/index.tsx
src/pages/stats/index.tsx
src/pages/profile/index.tsx
scripts/checkDeviceTestFixes.mjs
docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md
docs/device-test-fix-and-cloud-verification.md
```

头像和提醒还依赖：

```text
src/services/wechatAuth.ts
supabase/functions/upload-avatar/
supabase/functions/wechat-notification-schedule/
supabase/functions/wechat-notification-dispatch/
supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql
```

## 四、代码验收条件

合并后必须满足：

### 蓝牙

- `SUPPORTED_BLE_DEVICE_NAME === 'Bai'`。
- `STRONG_BLE_SIGNAL_RSSI === -60`。
- `startScan` 同时检查 `localName` 和 `name`，非 `Bai` 不调用页面 `onFound`。
- 添加设备页再次做防御性过滤。
- 推荐弹窗使用 `isStrongSupportedBLEDevice`，不得只取附近 RSSI 最大设备。
- 首页和设备管理继续按绑定 `deviceId` 监听；不得为了过滤列表而破坏已绑定设备的广播接收。

### 问答输入栏

- Textarea 内容高度初始为 24px，外层保持至少 44px 点击高度。
- `adjustPosition={false}`。
- 使用 `onKeyboardHeightChange` 设置固定输入栏的 `bottom`。
- 键盘关闭时 `bottom: 0`。
- 输入栏 padding 不再包含 `env(safe-area-inset-bottom)`，原生 TabBar 已负责底部安全区。
- 语音输入模式不包含 `i-mdi-robot`。

### 拍照识图

- 选图后立即设置 `localPreviewPath`。
- 上传成功使用远程 URL，上传失败当前会话使用本地路径兜底。
- `handleAddIngredient` 把图片 URL 写入食材对象。
- 食材列表和历史记录继续渲染 `image_url`。

### 头像

- 成员编辑页使用微信 `openType="chooseAvatar"`。
- 通过 `uploadWechatAvatar` 调用 `upload-avatar`。
- 数据库 `family_members.avatar_url` 成功更新。
- 所有成员展示入口优先使用 `avatar_url`，缺失时回退默认性别头像。

### 设备别名和图标

- 首页不得注册会覆盖数据库别名的 `onDeviceNameUpdate`。
- `connectedDevice` 使用数据库绑定记录。
- 个人中心名称可从 `devices[0].device_name` 兜底。
- 营养秤状态卡图标为 `i-mdi-scale`。

## 五、本地/云端构建检查

在仓库根目录执行并记录退出码：

```bash
rtk tsc -p tsconfig.check.json --noEmit
rtk node scripts/checkDeviceTestFixes.mjs
rtk node scripts/checkWechatFeatures.mjs
rtk pnpm exec tsx scripts/testNotificationPayload.mts
rtk bash scripts/checkNavigation.sh
rtk bash scripts/checkIconPath.sh
rtk bash scripts/checkAuthProvider.sh
rtk pnpm build:weapp
rtk git diff --check
```

任一失败必须先修复再继续。不得把构建 warning 写成 failure，也不得忽略真实 error。

## 六、受控云端部署

只有目标环境尚未部署对应依赖时才执行：

1. 只读确认目标 Supabase project ref 与小程序环境一致，不显示 Secret 值。
2. 备份生产 schema。
3. 执行重复 OpenID 审计，结果非零立即停止。
4. 在获得生产变更授权后，只执行 `00005_wechat_auth_notifications_recipe_shares.sql`，不得重放全量 schema。
5. 部署或更新 `upload-avatar`、`wechat-notification-schedule`、`wechat-notification-dispatch`。
6. 不得重新部署或回退 `ws-sign`、`brtc-history`、`upload-food-image`，除非它们有独立授权和验证范围。
7. 确认以下 Secret 名称存在，不输出值：

```text
WECHAT_MINIPROGRAM_LOGIN_APP_ID
WECHAT_MINIPROGRAM_LOGIN_APP_SECRET
WECHAT_SUBSCRIBE_TEMPLATES_JSON
WECHAT_NOTIFICATION_DISPATCH_SECRET
```

8. Cron 每分钟调用的目标必须是 `wechat-notification-dispatch`，请求头携带 `x-dispatch-secret`。`wechat-notification-schedule` 只供已登录客户端创建预约，禁止作为 Cron 目标。

## 七、上传体验版

1. 使用生产小程序环境变量重新构建 `weapp`。
2. 在微信开发者工具中确认 AppID、合法域名和当前目标项目一致。
3. 上传新的体验版，版本说明写明：

```text
真机问题修复：拍照预览、问答输入栏、成员头像、Bai 蓝牙过滤、设备别名、提醒链路
```

4. 记录体验版版本号、构建提交/工作区标识和上传时间。
5. 不得继续使用截图中仍展示“未知或不支持的设备”的旧体验版进行结论验证。

## 八、真机测试矩阵

### 1. 蓝牙发现

- 在有手机、耳机、手表等其他蓝牙设备的环境扫描。
- 列表中只能出现名称精确为 `Bai` 的设备。
- 非 `Bai` 即使 RSSI 很强也不得展示、不得弹窗。
- `Bai` 的 RSSI 小于或等于 `-60dBm` 时可以手动显示，但不得弹推荐。
- `Bai` 的 RSSI 大于 `-60dBm` 时才允许弹推荐。
- 推荐内容必须显示 `Bai`，不能显示“未知或不支持的设备”。

### 2. 绑定与称重

- 绑定 `Bai` 并自定义命名为“百度的健康秤”。
- 返回首页后名称仍为“百度的健康秤”，不能变回 `Bai`。
- 设备管理在线探测正常。
- 首页持续接收重量和稳定状态，不得因名称过滤断流。

### 3. 问答输入栏

- iOS 和 Android 分别测试。
- 键盘未打开时，输入控件底部与原生 TabBar 之间仅保留正常 8px 内边距，无大块安全区留白。
- 中文、英文、数字键盘展开时输入栏完全位于键盘上方。
- 收起键盘后输入栏回到底部，不悬空。
- placeholder 垂直居中。
- 语音模式无右侧机器人按钮。

### 4. 拍照识图

- 拍照或从相册选择后立即出现预览。
- 识别完成后食材名称正确。
- 添加食材后列表缩略图继续显示。
- 完成营养分析后历史记录图片可访问。
- 模拟上传失败时允许本次会话临时显示，但要明确不能把本地临时路径当作跨设备永久 URL。

### 5. 成员头像

- 新增和编辑成员均可选择头像。
- 上传完成后退出再进入，头像仍存在。
- 家庭成员列表、统计页当前成员、切换弹窗、个人中心显示一致。
- 上传失败时不得显示“已保存”假状态。

### 6. 图标

- 个人中心营养秤状态卡显示秤图标。
- 设备管理菜单显示蓝牙图标。

### 7. 定时提醒

- 明确消息来源是微信小程序一次性订阅消息，接收入口为微信“服务通知”，不是公众号。
- 设置当前时间后 2 分钟的提醒并接受授权。
- `notification_jobs` 从 `pending` 变为 `sent`。
- `wechat_msg_id` 非空，提醒开关发送后自动关闭。
- 未发送时依据 `last_error` 报告模板、OpenID、授权或字段错误，不得仅写“没收到”。

## 九、回传报告格式

请按以下格式返回：

```markdown
# 本轮修复验证报告

## 合并
- 补丁文件：
- 冲突及处理：
- 未合并项：

## 构建
- TypeScript：PASS/FAIL
- 专项检查：PASS/FAIL
- 微信功能检查：PASS/FAIL
- weapp build：PASS/FAIL

## 部署
- Supabase project ref 是否匹配：YES/NO
- 数据库迁移：DONE/SKIPPED/BLOCKED
- upload-avatar deployment id：
- notification-schedule deployment id：
- notification-dispatch deployment id：
- Cron 目标：

## 体验版
- 版本号：
- 上传时间：
- 测试设备与微信版本：

## 真机矩阵
- 拍照预览与列表：PASS/FAIL/BLOCKED
- 输入栏与键盘：PASS/FAIL/BLOCKED
- 语音栏机器人删除：PASS/FAIL/BLOCKED
- 成员头像：PASS/FAIL/BLOCKED
- Bai 列表过滤：PASS/FAIL/BLOCKED
- Bai 强信号推荐：PASS/FAIL/BLOCKED
- 绑定别名保持：PASS/FAIL/BLOCKED
- 秤图标：PASS/FAIL/BLOCKED
- 一次性订阅提醒：PASS/FAIL/BLOCKED

## 证据
- 截图/录屏：
- 非敏感日志 request id：
- notification_jobs 状态：

## 剩余问题
- 逐条列出，不得把未测试项写成通过。
```

执行过程中不得输出 AppSecret、service-role key、dispatch secret、手机号、OpenID 或图片 Base64。
