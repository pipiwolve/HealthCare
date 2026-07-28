# 当前窗口修改：云端质检、补齐与发布验证指令

## 1. 任务结论与目标

本轮不是只修复聊天输入框，而是核对并补齐当前聊天窗口中形成的全部修改。云端 Agent 必须先审计现状，再增量合并缺失代码，完成构建、受控部署、体验版上传和真机验收，并回传逐项证据。

根据当前已提供的云端材料：

- 最新云端 `src/pages/chat/index.tsx` 已出现键盘补丁的关键代码，包括 `NATIVE_TAB_BAR_HEIGHT = 50`、`keyboardHeight - 50 - safeAreaBottom`、`[chat-keyboard-layout]` 日志和不透明白色输入栏。代码层面可判定为“已合入”，但尚不能判定真机布局已经通过。
- 云端体验版截图仍显示旧版账号设置页：只有“微信账号”单卡片，并保留旧的“不支持合并/解绑”说明。账号、绑定、解绑和旧账号迁移提示的完整补丁没有进入该体验版，或云端尚未用新代码重新构建上传。
- 键盘补丁只修改 `src/pages/chat/index.tsx`，不包含账号、主题、首页拍照或云端函数修改。

最终目标：

1. 保留云端已完成的聊天键盘修复及更新的 RTC/语音/图片能力。
2. 补齐账号登录、微信绑定与解绑、旧账号迁移提示、主题样式和首页拍照入口修改。
3. 只部署发生变化的 `wechat_miniapp_login` Edge Function，不执行数据库迁移。
4. 重新构建并上传微信体验版，在 iOS 真机验证输入框、账号流程、UI 和首页拍照识图。

## 2. 输入文件与完整性

两个补丁都必须放在目标仓库的下列路径：

```text
docs/cloud-agent-current-full/0001-current-full.patch
docs/cloud-agent-keyboard-fix/0001-chat-keyboard-position-and-background.patch
```

预期 SHA-256：

```text
5ab0d621a95daec83e7e1a61d387312441dbc6b552f98f80c3bc3c763a35eb75  docs/cloud-agent-current-full/0001-current-full.patch
bef2dee5a39ab724ab4e6c7708b3f52eedfa6240b03b4b2955e87f2b297566a6  docs/cloud-agent-keyboard-fix/0001-chat-keyboard-position-and-background.patch
```

完整补丁基线为 `51d36e25`，业务范围是：

```text
scripts/checkDeviceTestFixes.mjs
scripts/checkWechatFeatures.mjs
src/contexts/AuthContext.tsx
src/pages/account-settings/index.tsx
src/pages/home/index.tsx
src/pages/login/index.tsx
src/services/wechatAuth.ts
supabase/functions/wechat_miniapp_login/index.ts
tailwind.config.js
```

键盘补丁只涉及：

```text
src/pages/chat/index.tsx
```

## 3. 安全边界

- 不得使用 `git reset --hard`、`git checkout -- <file>` 或整文件回退。
- 不得用本地较旧的整个 `src/pages/chat/index.tsx` 覆盖云端文件。
- 必须保留云端已有的 RTC、语音、图片、BLE、提醒、头像和菜谱分享能力。
- 不自动合并、迁移或删除两个不同 `user_id` 下的健康档案、设备、家庭成员、称重记录或聊天记录。
- 不输出 AppSecret、service-role key、anon key、OpenID、手机号、密码、登录票据或图片 Base64。
- 本轮没有数据库迁移；不得重放 schema 或历史迁移。
- 外部部署和体验版上传仅在当前目标环境已有授权的前提下执行。

## 4. 现场记录与补丁分类

先记录现场，不要先改代码：

```bash
rtk git status --short
rtk git rev-parse --short HEAD
rtk git log -5 --oneline
rtk shasum -a 256 docs/cloud-agent-current-full/0001-current-full.patch docs/cloud-agent-keyboard-fix/0001-chat-keyboard-position-and-background.patch
```

分别检查两个补丁。对每个补丁先检查是否已经应用，再检查是否可以直接应用：

```bash
rtk git apply --reverse --check docs/cloud-agent-keyboard-fix/0001-chat-keyboard-position-and-background.patch
rtk git apply --check docs/cloud-agent-keyboard-fix/0001-chat-keyboard-position-and-background.patch

rtk git apply --reverse --check docs/cloud-agent-current-full/0001-current-full.patch
rtk git apply --check docs/cloud-agent-current-full/0001-current-full.patch
```

判定规则：

| reverse check | apply check | 判定 | 动作 |
|---|---|---|---|
| 通过 | 失败 | 已完整应用 | 不重复应用，继续语义核对和测试 |
| 失败 | 通过 | 尚未应用 | 应用补丁 |
| 失败 | 失败 | 部分应用或代码已分叉 | 按补丁逐文件、逐功能增量合并 |
| 通过 | 通过 | 异常状态 | 停止应用，检查补丁是否为空或路径是否错误 |

补丁检查依赖上下文。若云端文件在补丁之外还有新代码，两个检查都失败并不等于功能缺失，必须继续做下面的语义核对。

预期判定：

- 键盘补丁：云端代码已经包含关键逻辑，应当“验证为主”。即使补丁上下文检查失败，也不要整文件覆盖。
- 完整账号补丁：从账号设置截图判断为“缺失或部分应用”，需要应用或手工增量合并。

## 5. 增量合并策略

完整补丁可直接应用时执行：

```bash
rtk git apply docs/cloud-agent-current-full/0001-current-full.patch
```

不能直接应用时先尝试三方合并：

```bash
rtk git apply --3way docs/cloud-agent-current-full/0001-current-full.patch
```

三方合并仍冲突时，使用补丁作为行为规范，逐文件手工合并。不得通过恢复整个文件解决冲突。

键盘补丁只在语义核对发现关键逻辑缺失时手工合并对应小段；禁止将补丁中的旧版完整聊天页覆盖到云端。必须保留当前云端 `src/pages/chat/index.tsx` 的全部非布局改动。

## 6. 必须达到的代码行为

### 6.1 账号体系

- 普通用户名账号是主账号；用户名统一转小写，只允许 3-32 位字母、数字或下划线。
- 新微信首次点击快捷登录，未绑定时不得直接创建独立微信账号。
- 未绑定微信只能选择“绑定已有账号”或“还没有账号，先注册”。
- 选择已有账号时，先用用户名和密码登录，成功后把当前微信绑定到该 `user_id`。
- 选择注册时，先完成用户名、密码和确认密码注册，成功后再绑定微信。
- `chooseAvatar` 和自定义昵称输入保留在微信未绑定流程中；头像和昵称不是鉴别账号唯一性的字段。
- 微信身份唯一标识使用 `wechat_identities` 中的 `(provider, openid)`；同一账号绑定约束使用 `(provider, user_id)`。
- `prepare-bind` 和 `bind` 都要检查：当前微信是否已属于其他账号、当前账号是否已绑定另一个微信。
- 两个已有账号冲突时只返回明确冲突，不自动合并数据。
- 新客户端的 `register` 微信动作必须拒绝直接创建微信独立账号；无 `action` 的旧客户端兼容逻辑可以保留。

### 6.2 账号设置与解绑

- 账号设置页应同时展示“用户名登录”和“微信登录”两个模块，不是旧版单一“微信账号”卡片。
- 未绑定时，点击绑定先显示业务确认，再调用 `Taro.login` 获取当前微信临时 code；微信登录本身通常不会弹出传统用户资料授权框。
- 解绑必须先存在用户名密码登录方式，并验证当前密码和当前 `user_id`。
- 解绑时先清空 `profiles.openid`，再删除 `wechat_identities`，防止旧兼容逻辑恢复绑定。
- 旧版纯微信账号显示“需要迁移”状态，不允许在客户端自助创建用户名凭证、绑定另一个账号或自动合并。

### 6.3 主题和按钮

- `tailwind.config.js` 的 `theme.extend` 只能有一个 `colors` 对象，`warning` 合并到该对象中。
- 构建产物必须包含 `.bg-primary`、`.text-primary`、`.bg-destructive`。
- 登录、添加账号、绑定和确认按钮不能再显示为白底白字。
- 个人中心图标应为绿色图标配浅绿色方形底，菜单箭头使用弱化色，危险操作使用红色语义。

### 6.4 首页拍照识图

- 首页“添加食材”保留文字输入和相机按钮，不显示麦克风按钮。
- 首页不得再包含 `getRecorderManager()` 或 `voice-ptt` ASR 链路。
- 相机按钮继续调用 `handlePhotoRecognize`，选图后立即显示 `localPreviewPath`。
- 视觉识别使用 `agentProfile: 'vision'`，结果回填食材名称。
- 上传成功保存远程 URL；上传失败仅在当前会话回退本地预览路径。
- AI 问答页的文字、图片和语音能力不得受影响。

### 6.5 聊天键盘和输入栏

云端聊天页至少应保留以下语义：

```text
NATIVE_TAB_BAR_HEIGHT = 50
safeAreaBottom = screenHeight - safeArea.bottom
iOS inputBarBottom = max(0, keyboardHeight - NATIVE_TAB_BAR_HEIGHT - safeAreaBottom)
messageBottomPadding = inputBarHeight + 16
[chat-keyboard-layout] 诊断日志
输入栏和输入框显式使用 #FFFFFF 不透明背景
键盘弹起时输入栏有顶部边框或阴影
```

不要仅凭代码常量判定通过。必须确认：

- iOS 键盘弹起后，输入栏下沿贴住键盘上沿，没有多出一个 Tab Bar 高度的空白。
- 键盘收起后，输入栏回到底部 Tab Bar 上方。
- 输入栏背景不透明，消息内容不会透出。
- 多行输入、语音模式切换、发图和 RTC 相关交互无回归。

如果真机仍有固定约 50px 的间隙，先记录日志中的 `keyboardHeight`、`safeAreaBottom`、`windowHeight`、`screenHeight` 和 `inputBarBottom`，再判断微信基础库是否已经从 `keyboardHeight` 中排除了 Tab Bar。不得继续盲目叠加常量。

## 7. 静态检查和构建

在仓库根目录执行并记录每项退出码：

```bash
rtk test node scripts/checkWechatFeatures.mjs
rtk test node scripts/checkDeviceTestFixes.mjs
rtk tsc --noEmit -p tsconfig.check.json
rtk proxy npx biome lint --diagnostic-level=error
rtk proxy npx oxlint -c .oxlintrc.json
rtk proxy bash scripts/checkNavigation.sh
rtk proxy bash scripts/checkIconPath.sh
rtk proxy bash scripts/checkAuthProvider.sh
rtk pnpm run build:weapp
rtk git diff --check
```

构建后检查主题类和首页入口：

```bash
rtk grep -n 'bg-primary' dist/app-origin.wxss
rtk grep -n 'text-primary' dist/app-origin.wxss
rtk grep -n 'bg-destructive' dist/app-origin.wxss
rtk grep -n 'i-mdi-microphone\|getRecorderManager\|voice-ptt' src/pages/home/index.tsx
```

最后一条首页检查预期无匹配。Browserslist 数据、Sass legacy API 或 package module type warning 不等于真实构建失败。

## 8. Edge Function 受控部署

本轮不需要数据库迁移。

1. 只读确认 Supabase project ref、当前环境和小程序 AppID 对应同一个目标环境。
2. 确认以下 Secret 名称存在，但不得输出值：

```text
WECHAT_MINIPROGRAM_LOGIN_APP_ID
WECHAT_MINIPROGRAM_LOGIN_APP_SECRET
WECHAT_LOGIN_TICKET_SECRET
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
```

3. 只部署有代码变化的 `wechat_miniapp_login`，不要部署其他未修改函数。
4. `start` 必须允许未登录客户端调用；`prepare-bind`、`bind`、`status`、`unbind` 仍由函数内部校验 JWT。
5. 记录 deployment id 和非敏感日志摘要。

## 9. 体验版与真机验收矩阵

使用目标小程序生产配置重新执行 `build:weapp`，确认微信开发者工具 AppID 与 Edge Function 使用的 AppID 一致，合法 request 域名包含实际 Supabase 或代理入口，然后上传新的体验版。

建议版本说明：

```text
账号绑定、首页拍照、主题样式与聊天键盘质检修复
```

| 模块 | 验收场景 | 预期结果 |
|---|---|---|
| 账号设置 | 打开账号设置 | 同时显示用户名登录与微信登录模块 |
| 微信新用户 | 微信首次快捷登录 | 不直接创建独立账号，出现绑定已有账号/先注册选择 |
| 已有账号绑定 | 输入正确账号密码 | 登录后绑定同一微信，进入同一 `user_id` |
| 注册后绑定 | 完成用户名、密码、确认密码 | 注册成功后绑定微信 |
| 绑定冲突 | 微信已属于账号 A，账号 B 尝试绑定 | 明确冲突，不合并、不迁移数据 |
| 更换微信 | 账号已绑定微信 A，再绑定微信 B | 提示先解绑 |
| 解绑 | 错误密码 | 不解绑 |
| 解绑 | 正确密码 | 微信解绑，用户名账号仍可登录原 `user_id` |
| 解绑后登录 | 原微信再次快捷登录 | 显示未绑定选择，不被 `profiles.openid` 自动恢复 |
| 旧版纯微信账号 | 打开账号设置 | 显示迁移提示，不提供自助合并入口 |
| 首页 | 添加食材 | 只有相机按钮，没有麦克风入口 |
| 拍照识图 | 拍照/相册 | 立即预览、识别回填、保存后缩略图可用 |
| 主题 | 登录/绑定/添加账号按钮 | 背景和文字可见，不是纯白空白条 |
| 个人中心 | 图标和箭头 | 绿色图标、浅绿色底、弱化箭头 |
| 聊天键盘 | iOS 聚焦输入框 | 输入栏贴住键盘，无 Tab Bar 高度间隙 |
| 输入背景 | 键盘弹起 | 输入栏不透明，消息不透出 |
| 聊天回归 | 文字/多行/语音/图片/RTC | 均可正常使用 |

必须记录体验版版本号、上传时间、构建提交、测试机型、iOS 版本、微信版本和基础库版本。键盘项目必须附键盘弹起与收起截图，以及脱敏后的 `[chat-keyboard-layout]` 数值。

## 10. 云端 Agent 回传格式

```markdown
# 当前窗口修改质检与补齐报告

## 基线与补丁判定
- 原始 HEAD：
- 工作区初始状态：
- keyboard patch：already-applied / missing / partial
- full patch：already-applied / missing / partial
- 应用方式：direct / 3way / manual / verify-only
- 冲突文件与处理：
- 最终改动文件：

## 功能语义核对
- 两种登录方式与账号设置双模块：PASS/FAIL
- 新微信不得直接创建账号：PASS/FAIL
- 绑定冲突与双唯一约束：PASS/FAIL
- 密码保护解绑：PASS/FAIL
- 旧微信账号迁移提示：PASS/FAIL
- 首页只保留相机识图：PASS/FAIL
- 主题按钮与图标：PASS/FAIL
- 键盘布局关键代码：PASS/FAIL
- RTC/语音/图片逻辑保留：PASS/FAIL

## 自动检查
- WeChat feature check：PASS/FAIL
- Device feature check：PASS/FAIL
- TypeScript：PASS/FAIL
- Biome：PASS/FAIL
- Oxlint：PASS/FAIL
- Navigation/Icon/AuthProvider：PASS/FAIL
- weapp build：PASS/FAIL
- diff check：PASS/FAIL

## 部署
- Supabase project ref 匹配：YES/NO
- 数据库迁移：SKIPPED（本轮无迁移）
- wechat_miniapp_login deployment id：

## 体验版
- 版本号：
- 上传时间：
- 构建提交：
- 测试设备/系统/微信/基础库：

## 真机验收
- 账号设置双模块：PASS/FAIL/BLOCKED
- 已有账号绑定：PASS/FAIL/BLOCKED
- 先注册后绑定：PASS/FAIL/BLOCKED
- 微信绑定冲突：PASS/FAIL/BLOCKED
- 密码验证解绑：PASS/FAIL/BLOCKED
- 旧账号迁移提示：PASS/FAIL/BLOCKED
- 首页无麦克风且拍照识图正常：PASS/FAIL/BLOCKED
- 主题按钮和图标：PASS/FAIL/BLOCKED
- iOS 输入栏贴住键盘：PASS/FAIL/BLOCKED
- 输入栏背景不透明：PASS/FAIL/BLOCKED
- 聊天/RTC 无回归：PASS/FAIL/BLOCKED

## 证据与剩余问题
- 截图/录屏：
- [chat-keyboard-layout] 脱敏数值：
- 非敏感 request/deployment id：
- 未执行或失败项及原因：
```

不得只回复“已修复”。没有执行真机测试、部署或上传的项目必须标为 `BLOCKED`，不能标为 `PASS`。
