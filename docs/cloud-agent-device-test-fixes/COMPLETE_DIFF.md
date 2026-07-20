# 真机问题修复完整 Diff 文档

生成日期：2026-07-20

## 1. 文档边界

本文档只描述本轮真机问题修复，不等同于仓库相对 `HEAD` 的原始 `git diff`。工作区在本轮开始前已经包含 AI 流式问答、微信登录、菜谱分享、通知函数等大量未提交改动；直接导出 `git diff HEAD` 会把这些既有改动一并带入，不能作为本轮补丁边界。

本轮修改文件：

| 文件 | 本轮修改 |
| --- | --- |
| `src/pages/home/index.tsx` | 拍照即时预览、食材图片兜底、绑定设备别名优先、同步共享设备状态 |
| `src/pages/chat/index.tsx` | 输入提示垂直居中、键盘高度适配、移除重复安全区留白 |
| `src/utils/bleService.ts` | 统一 `Bai` 设备过滤、强信号阈值、监听匹配规则 |
| `src/pages/device-add/index.tsx` | 防御性过滤、只推荐强信号 `Bai` |
| `src/utils/avatarUtils.ts` | 自定义头像优先的统一 helper |
| `src/pages/family-edit/index.tsx` | 微信 `chooseAvatar` 和头像上传 |
| `src/pages/family/index.tsx` | 成员列表显示自定义头像 |
| `src/pages/stats/index.tsx` | 当前成员及切换弹窗显示自定义头像 |
| `src/pages/profile/index.tsx` | 自定义头像、秤图标、自定义设备名兜底 |
| `scripts/checkDeviceTestFixes.mjs` | 本轮静态回归检查 |
| `docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md` | 修正通知 Cron 调用目标 |
| `docs/device-test-fix-and-cloud-verification.md` | 修复矩阵、云端部署和真机验收说明 |

相关但不是本轮新建的必要依赖：

- `src/services/wechatAuth.ts`
- `supabase/functions/upload-avatar/`
- `supabase/functions/wechat-notification-schedule/`
- `supabase/functions/wechat-notification-dispatch/`
- `supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql`

## 2. 首页拍照识图与设备名称

### `src/pages/home/index.tsx`

```diff
 const {
   activeMember, familyMembers, refreshMembers,
-  bleStatus, setBLEStatus, batteryLevel, setBatteryLevel,
+  bleStatus, setBLEStatus, setConnectedDevice, batteryLevel, setBatteryLevel,
 }

 const devices = await getDevices(user.id)
+setConnectedDevice(devices[0] || null)
```

首页现在把数据库绑定记录写入全局 `connectedDevice`。设备管理和个人中心读取同一条绑定记录，不再只维护首页局部名称。

```diff
 bleService.setCallbacks({
   onWeightUpdate,
   onConnectionChange,
-  onDeviceNameUpdate: name => setConnectedDeviceName(name),
 })
```

删除首页两处广播名称覆盖逻辑。显示名称始终优先使用数据库中的用户自定义 `device_name`，不会从“百度的健康秤”退回广播名 `Bai`。

```diff
 const res = await Taro.chooseMedia(...)
 if (!res.tempFiles?.[0]) return
+const localPreviewPath = res.tempFiles[0].tempFilePath
+setCurrentIngredientImageUrl(localPreviewPath)

 if (foods.length > 0) {
   setFoodName(foods[0])
-  setCurrentIngredientImageUrl(uploadedImageUrl)
+  setCurrentIngredientImageUrl(uploadedImageUrl || localPreviewPath)
 }
```

选图成功立即使用微信临时路径显示图片；上传成功后替换为远程 URL，上传失败时当前会话仍能显示本地图片。

```diff
+{currentIngredientImageUrl && (
+  <div className="...">
+    <Image src={currentIngredientImageUrl} mode="aspectFill" />
+    <p>{foodName || '正在识别食材'}</p>
+    <p>图片已就绪</p>
+  </div>
+)}
```

点击“添加食材”后，`image_url` 随食材进入全局列表；食材列表和历史记录原有的 `<Image>` 渲染逻辑继续复用该字段。

## 3. AI 问答输入区

### `src/pages/chat/index.tsx`

```diff
-const [inputHeight, setInputHeight] = useState(44)
+const [inputHeight, setInputHeight] = useState(24)
+const [keyboardHeight, setKeyboardHeight] = useState(0)
```

单行文本内容高度为 24px，44px 的点击高度由外层 `10px + 24px + 10px` 提供，避免 placeholder 在 Textarea 自身内边距中下沉。

```diff
 <div
   style={{
-    padding: '8px 12px calc(8px + env(safe-area-inset-bottom, 0px))',
-    bottom: '0',
+    padding: '8px 12px',
+    bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0',
   }}
 >
```

原生微信 TabBar 已经包含 Home Indicator 安全区，输入栏再次叠加 `safe-area-inset-bottom` 会产生截图中的大块空白。本轮移除重复安全区；键盘打开时则按微信返回的真实键盘高度上移。

```diff
 <Textarea
-  adjustPosition
-  cursorSpacing={12}
-  style={{height: `${inputHeight}px`, padding: '10px 0'}}
+  adjustPosition={false}
+  cursorSpacing={16}
+  style={{height: `${inputHeight}px`, padding: 0}}
+  onKeyboardHeightChange={e => setKeyboardHeight(Number(e.detail.height || 0))}
+  onBlur={() => setKeyboardHeight(0)}
 />
```

语音输入模式只保留键盘切换按钮和“按住说话”区域，不再渲染右侧机器人操作按钮。

## 4. 蓝牙过滤与推荐

### `src/utils/bleService.ts`

```diff
+export const SUPPORTED_BLE_DEVICE_NAME = 'Bai'
+export const STRONG_BLE_SIGNAL_RSSI = -60
+
+export function isSupportedBLEDeviceName(name: string): boolean {
+  return name.trim() === SUPPORTED_BLE_DEVICE_NAME
+}
+
+export function isStrongSupportedBLEDevice(device: BLEDevice): boolean {
+  return isSupportedBLEDeviceName(device.name)
+    && device.RSSI > STRONG_BLE_SIGNAL_RSSI
+}
```

过滤规则集中在 BLE 服务，不由页面自行猜测。

```diff
 for (const d of devices) {
   if (!d.deviceId || found.has(d.deviceId)) continue
-  const name = d.name || d.localName || '未知设备'
+  const name = [d.localName, d.name]
+    .map(value => String(value || '').trim())
+    .find(isSupportedBLEDeviceName) || ''
+  if (!isSupportedBLEDeviceName(name)) continue
   onFound({deviceId: d.deviceId, name, RSSI: d.RSSI || -100})
 }
```

添加设备扫描列表只收到名称精确为 `Bai` 的广播。`localName` 和 `name` 都会检查；周边手机、耳机、空名称广播和“未知或不支持的设备”不会进入页面状态。

```diff
-const nameMatch = d.name === 'Bai' || d.localName === 'Bai'
+const nameMatch = [d.localName, d.name]
+  .some(value => isSupportedBLEDeviceName(String(value || '')))
 if (d.deviceId !== targetId && !nameMatch) continue
```

首页自动重连和设备管理在线探测复用 `startListening`。它们不展示附近设备列表，而是按已绑定 `deviceId` 监听，并用 `Bai` 作为跨平台广播 ID 变化时的兼容匹配。

### `src/pages/device-add/index.tsx`

```diff
 await bleService.startScan(device => {
+  if (!isSupportedBLEDeviceName(device.name)) return
   setFoundDevices(...)
 })

-const best = [...devices].sort((a, b) => b.RSSI - a.RSSI)[0]
-if (best.RSSI > -85) showModal(...)
+const best = devices
+  .filter(isStrongSupportedBLEDevice)
+  .sort((a, b) => b.RSSI - a.RSSI)[0]
+if (!best) return
+showModal(...)
```

推荐弹窗必须同时满足：

1. 设备名精确为 `Bai`。
2. RSSI 大于 `-60dBm`，与页面“信号强”的显示口径一致。

弱信号 `Bai` 可以在列表中手动选择，但不会自动弹出推荐；非 `Bai` 设备既不展示也不推荐。

## 5. 成员自定义头像

### `src/utils/avatarUtils.ts`

```diff
+export function getMemberAvatar(member): string {
+  return member?.avatar_url || getAvatarByGender(member?.gender)
+}
```

统一规则：优先数据库自定义头像，没有自定义值时回退男女默认头像。

### `src/pages/family-edit/index.tsx`

```diff
+const [avatarPreviewPath, setAvatarPreviewPath] = useState('')
+const [uploadingAvatar, setUploadingAvatar] = useState(false)
+
+const handleChooseAvatar = async event => {
+  const localPath = event.detail.avatarUrl
+  setAvatarPreviewPath(localPath)
+  const avatarUrl = await uploadWechatAvatar(localPath)
+  setForm(prev => ({...prev, avatar_url: avatarUrl}))
+}
```

```diff
-<div className="avatar">
-  <Image src={getAvatarByGender(form.gender)} />
-</div>
+<button openType="chooseAvatar" onChooseAvatar={handleChooseAvatar}>
+  <Image src={avatarPreviewPath || form.avatar_url || getAvatarByGender(form.gender)} />
+</button>
```

新增成员保存时使用 `form.avatar_url || null`；编辑成员则通过原有 `updateFamilyMember` 更新数据库字段。

### 展示入口

以下页面由默认账号图标或默认性别头像改为 `getMemberAvatar(...)`：

- `src/pages/family/index.tsx`：家庭成员列表。
- `src/pages/stats/index.tsx`：当前查看成员和切换成员弹窗。
- `src/pages/profile/index.tsx`：个人中心顶部当前成员头像。

## 6. 个人中心图标和名称

### `src/pages/profile/index.tsx`

```diff
-<div className="i-mdi-bluetooth ..." />
+<div className="i-mdi-scale ..." />
```

顶部营养秤状态卡使用秤图标；下方设备管理菜单继续保留蓝牙图标，消除重复。

```diff
-connectedDevice?.device_name || '营养秤'
+connectedDevice?.device_name || devices[0]?.device_name || '营养秤'
```

全局状态尚未初始化时，个人中心用数据库设备列表作为自定义名称兜底。

## 7. 定时提醒交付修正

### `docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md`

```diff
-配置每分钟调用 `wechat-notification-schedule` 的调度器
+配置每分钟调用 `wechat-notification-dispatch` 的调度器
+`wechat-notification-schedule` 只由已登录小程序客户端创建预约任务，不能作为定时器目标
```

消息来源为微信小程序一次性订阅消息，最终调用微信 `message/subscribe/send`，用户从微信“服务通知”接收；不是公众号模板消息。

## 8. 回归检查

### `scripts/checkDeviceTestFixes.mjs`

新增静态契约检查，覆盖：

- 拍照本地预览与远程 URL 兜底。
- 自定义设备名称不被广播名覆盖。
- 问答输入栏按键盘高度移动。
- 语音输入栏无机器人按钮。
- 成员头像上传和各页面展示。
- 蓝牙只允许 `Bai`，推荐要求强信号。
- 营养秤图标使用 `i-mdi-scale`。
- 通知 Cron 指向 `wechat-notification-dispatch`。

## 9. 已完成验证

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

结果：全部通过。仓库总 lint 脚本直接执行时会因三个子脚本缺少可执行权限失败；通过 `bash` 分别执行后均通过，本轮没有修改用户文件权限。

## 10. 尚未在本地完成的外部验证

- 微信开发者工具上传体验版。
- iOS/Android 真机键盘高度和底部 TabBar 贴合验证。
- 真机 BLE 广播名、RSSI、绑定和持续称重验证。
- `upload-avatar` 云函数和 `avatars` bucket 的生产部署验证。
- 微信订阅模板、Cron、OpenID 和到点发送验证。

以上项目必须由具有目标小程序和 Supabase 生产权限的云端 Agent 执行，不得把“本地构建通过”写成“真机或云端已通过”。
