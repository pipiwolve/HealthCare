# 真机问题修复与云端二次验证方案

## 结论

本轮问题同时包含两类情况：一类是本地已有未提交实现但体验版未包含，另一类是本地仍存在真实缺口。本补丁已经补齐本地缺口；云端 Agent 仍需合并当前工作区增量、部署相关 Edge Functions，并重新上传体验版验证。

定时提醒的来源不是公众号。当前实现使用微信小程序一次性订阅消息，最终调用微信 `message/subscribe/send` 接口，用户在微信“服务通知”中接收。每次用户授权只对应下一次发送，发送后需要再次预约。

## 问题与修复状态

| 编号 | 真机问题 | 修复前本地状态 | 本次处理 | 云端动作 |
| --- | --- | --- | --- | --- |
| 1 | 拍照图片未同步到食材列表 | 已有远程 `image_url` 字段和列表渲染，但无即时本地预览，上传失败时图片为空 | 选图后立即用临时路径预览；识别完成后优先切换远程 URL，上传失败则本机临时兜底 | 合并首页补丁；确认 `upload-food-image` 仍在线 |
| 2 | 问答占位文字偏低、键盘遮挡输入栏 | 输入框高度/内边距组合仍可能偏低；固定底栏未使用实际键盘高度 | 单行输入改为 24px 内容区并由外层居中；关闭自动顶起，按 `onKeyboardHeightChange` 精确上移底栏 | 重新构建体验版，iOS/Android 真机分别验证 |
| 3 | 语音输入右侧仍有机器人按钮 | 本地当前语音底栏已经没有机器人按钮，体验版未包含该改动 | 增加静态回归检查，确保语音底栏不再渲染机器人 | 合并当前聊天页而不是旧体验版代码 |
| 4 | 成员头像不能自定义/切换页不显示 | 数据库有 `avatar_url`，但成员编辑页只有默认性别头像，展示页也忽略该字段 | 接通微信 `chooseAvatar`、`upload-avatar`，成员管理、统计切换、个人中心优先显示自定义头像 | 部署 `upload-avatar`；执行迁移以创建 `avatars` bucket |
| 5 | 蓝牙扫描展示大量未知设备 | 扫描层把周边广播全部展示，推荐弹窗只判断 RSSI | 发现列表仅保留设备名精确为 `Bai` 的广播；仅当 `Bai` 且 RSSI 大于 -60dBm 时弹出推荐 | 真机确认目标秤广播名和 RSSI 满足条件 |
| 6 | 定时提醒未跑通 | 客户端、任务表、调度函数和发送函数已存在，但云端指令曾把定时器目标写错 | 修正为每分钟调用 `wechat-notification-dispatch`；明确消息来源和状态检查 | 配模板、Secret、Cron，并做一次加速到点测试 |
| 7 | 营养秤与设备管理图标重复 | 设备状态卡和设备管理菜单都使用蓝牙图标 | 设备状态卡改为秤图标，设备管理保留蓝牙图标 | 重新构建体验版 |
| 8 | 首页显示广播名而非绑定自定义名 | 首页先读取数据库别名，随后又被 BLE 广播名回调覆盖；共享 `connectedDevice` 未赋值 | 数据库绑定记录写入共享状态，首页不再用广播名覆盖别名 | 解绑后重新绑定并命名，返回首页验证 |

## 本地检查

在仓库根目录执行：

```bash
rtk tsc -p tsconfig.check.json --noEmit
rtk node scripts/checkDeviceTestFixes.mjs
rtk node scripts/checkWechatFeatures.mjs
rtk pnpm exec tsx scripts/testNotificationPayload.mts
rtk pnpm build:weapp
```

## 云端 Agent 部署边界

1. 合并本次前端补丁和现有未提交微信功能补丁，不回退百度 BRTC、AI 流式问答或既有 Supabase 配置。
2. 头像功能部署 `upload-avatar`，并确认 `avatars` bucket 为公开读、限制 2MB、仅允许 JPEG/PNG/WebP。
3. 提醒功能部署 `wechat-notification-schedule` 与 `wechat-notification-dispatch`。前者仅由登录用户保存预约；后者才是 Cron 每分钟调用的目标。
4. 配置 `WECHAT_SUBSCRIBE_TEMPLATES_JSON`、小程序 App ID/App Secret、`WECHAT_NOTIFICATION_DISPATCH_SECRET`。不得输出 Secret 值。
5. 不重新部署或回退 `ws-sign`、`brtc-history`、`upload-food-image`，除非对应函数的代码也在本次发布范围内且经过独立验证。

## 真机验收

1. 拍照后无需点击“添加食材”即可看到预览；输入重量并添加后，列表圆形缩略图继续显示；完成分析后历史记录仍显示远程图。
2. 点击问答输入框，提示文字垂直居中；键盘完全展开、切换中英文、收起键盘时输入栏均不被遮挡或悬空。
3. 切换语音输入，只显示键盘切换按钮和“按住说话”，右侧无机器人按钮。
4. 在家庭成员编辑页选择头像并保存；统计页切换成员、家庭成员列表、个人中心均显示同一自定义头像。
5. 蓝牙扫描列表只出现设备名为 `Bai` 的营养秤；只有 `Bai` 且 RSSI 大于 -60dBm 时弹出推荐，其他设备和较弱信号均不弹窗；绑定后首页和设备管理仍能接收重量广播。
6. 将一个提醒时间设为当前时间后 2 分钟，接受订阅授权。数据库应先出现 `pending` 任务；到点后 Cron 调用 `wechat-notification-dispatch`，任务变为 `sent`，`wechat_msg_id` 非空，开关自动关闭，并在微信“服务通知”收到消息。
7. 个人中心设备状态使用秤图标，设备管理菜单仍使用蓝牙图标。
8. 将设备命名为“百度的健康秤”，返回首页和个人中心后都显示该名称；不得回退为广播名 `Bai`。

提醒失败时按 `notification_jobs.last_error` 定位：`template configuration missing` 表示模板配置不一致，`wechat identity missing` 表示用户没有小程序 OpenID，`wechat:43101` 表示用户未接受该次订阅，`wechat:47003` 表示模板字段和值不符合审核模板。
