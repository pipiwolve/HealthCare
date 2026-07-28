# 云端 Agent 完整执行指令

请在目标云端仓库中应用本轮完整补丁，完成构建、受控部署和微信体验版验证。必须逐项执行并回传证据，不得只回复“已修复”。

## 一、交付物与基线

- 完整补丁：`docs/cloud-agent-current-full/0001-current-full.patch`
- 本地补丁基线：`51d36e25 feat: add WeChat workflows and device test fixes`
- 补丁范围：当前基线之后全部未提交代码改动，包括登录绑定、主题颜色、首页拍照入口和专项检查。

目标仓库可能已经包含部分改动。必须先检查当前分支和工作区，不得假设云端与本地基线完全一致。

## 二、任务目标

1. 修复 Tailwind 主题颜色被重复 `extend.colors` 覆盖的问题，使 `bg-primary`、`text-primary`、`bg-destructive` 等类在微信小程序产物中正常生成。
2. 首页“添加食材”只保留文字输入和相机按钮；删除首页短语音按钮、RecorderManager 和 `voice-ptt` ASR 链路。AI 问答页语音能力不受影响。
3. 微信首次登录不得直接创建独立微信账号。未绑定微信只能选择：
   - 登录已有用户名账号后绑定；
   - 先完成普通用户名注册，再绑定微信。
4. 普通注册增加确认密码；存在待绑定微信票据时，注册成功后再执行绑定。
5. 设置页区分用户名登录与微信登录；绑定前显示业务确认弹窗。
6. 微信解绑必须已有用户名密码登录方式，并校验当前密码。
7. 不自动合并两个已有 `user_id` 下的健康档案、设备、家庭成员、称重记录或聊天数据。
8. 旧版纯微信独立账号不得在设置页直接创建用户名凭证或绑定另一个已有账号，必须明确标记为需要迁移。

## 三、禁止操作

- 禁止 `git reset --hard`。
- 禁止 `git checkout -- <file>`。
- 禁止用云端旧文件整文件覆盖补丁中的登录页、账号设置页、首页或 Edge Function。
- 禁止自动迁移或删除旧版微信账号数据。
- 禁止输出 AppSecret、service-role key、anon key、登录票据、手机号、OpenID、图片 Base64 或用户密码。
- 未获得生产授权时，不执行数据库、Edge Function 或体验版外部变更。

## 四、应用补丁

先记录现场：

```bash
rtk git status --short
rtk git rev-parse --short HEAD
rtk git log -5 --oneline
```

检查补丁：

```bash
rtk git apply --check docs/cloud-agent-current-full/0001-current-full.patch
```

若目标仓库与基线一致，直接应用：

```bash
rtk git apply docs/cloud-agent-current-full/0001-current-full.patch
```

若云端已有部分增量，使用三方合并并逐文件解决冲突：

```bash
rtk git apply --3way docs/cloud-agent-current-full/0001-current-full.patch
```

冲突处理原则：保留云端已验证的 BRTC、BLE、提醒、头像、菜谱分享和聊天能力，只合入本补丁明确修改的行为。不得通过回退整个文件解决冲突。

## 五、必须核对的文件

```text
tailwind.config.js
src/pages/home/index.tsx
src/pages/login/index.tsx
src/pages/account-settings/index.tsx
src/contexts/AuthContext.tsx
src/services/wechatAuth.ts
supabase/functions/wechat_miniapp_login/index.ts
scripts/checkWechatFeatures.mjs
scripts/checkDeviceTestFixes.mjs
```

## 六、代码验收条件

### 主题与 UI

- `tailwind.config.js` 的 `theme.extend` 只能有一个 `colors` 对象。
- `warning` 必须合并进同一个颜色对象，不能再次声明 `colors`。
- 构建后的 `dist/app-origin.wxss` 必须包含 `.bg-primary`、`.text-primary` 和 `.bg-destructive`。
- 个人中心菜单图标应显示绿色图标和浅绿色方形底，不得退化为纯黑图标。
- 菜单箭头使用弱化颜色，退出登录按钮使用红色语义样式。
- 登录、绑定和确认按钮不得出现白底白字的空白条。

### 首页拍照识图

- 首页不得包含 `i-mdi-microphone`、`getRecorderManager()` 或 `voice-ptt`。
- 食材名称输入框右侧只保留相机按钮。
- 相机按钮继续调用 `handlePhotoRecognize`。
- 选择图片后立即保存 `localPreviewPath` 并显示预览。
- 视觉识别仅使用 `agentProfile: 'vision'`，识别结果写入食材名称。
- 上传成功使用远程 URL；上传失败仅在当前会话使用本地预览路径。
- 添加食材后继续保存并展示 `image_url`。
- AI 问答页的文字、图片和语音功能不得被删除。

### 登录与绑定

- 用户名统一转小写，规则为 3-32 位字母、数字或下划线。
- 微信 `start` 返回已绑定身份时直接登录；未绑定时只返回短期 `registrationTicket`。
- 当前客户端不得调用直接微信注册方法。
- 未绑定微信弹窗保留 `chooseAvatar` 和昵称输入，并提供“绑定已有账号”“还没有账号，先注册”。
- 选择注册后，先执行普通 `signUpWithUsername`，成功后才执行 `bindWechatSignIn`。
- 已有账号绑定必须先用用户名密码登录，随后绑定同一个微信票据。
- `prepare-bind` 和 `bind` 都必须检查微信是否属于其他 `user_id`。
- 数据库继续通过 `(provider, openid)` 和 `(provider, user_id)` 双唯一约束兜底。
- `register` 分阶段接口必须拒绝直接创建账号，并提示先注册或登录。
- 旧版无 `action` 客户端兼容逻辑可以保留，但不得向新客户端返回 `session_key`。

### 解绑

- 只有 Supabase 邮箱属于用户名登录域时才允许解绑微信。
- 解绑前必须通过 Supabase 密码接口验证当前用户 ID。
- 先清空旧版 `profiles.openid`，再删除 `wechat_identities`，避免旧兼容逻辑重新生成绑定。
- 纯微信旧账号必须拒绝解绑，并提示先完成迁移。

## 七、本地构建和静态检查

在仓库根目录执行并记录退出码：

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

构建后额外检查主题类：

```bash
rtk grep -n 'bg-primary' dist/app-origin.wxss
rtk grep -n 'text-primary' dist/app-origin.wxss
rtk grep -n 'bg-destructive' dist/app-origin.wxss
```

任一真实 error 必须先修复。Browserslist 数据过期、Sass legacy API、package module type 等 warning 不得误报为代码 failure。

## 八、Supabase 受控部署

本补丁不新增数据库迁移，不得重放全量 schema，也不得重复执行历史迁移。

只有获得目标环境部署授权后才执行：

1. 只读确认小程序环境变量、Supabase project ref 和 CLI 链接目标一致，不显示 Secret 值。
2. 部署更新后的 `wechat_miniapp_login`。
3. 不部署未发生代码变化的其他 Edge Function。
4. 确认下列 Secret 名称存在，不输出值：

```text
WECHAT_MINIPROGRAM_LOGIN_APP_ID
WECHAT_MINIPROGRAM_LOGIN_APP_SECRET
WECHAT_LOGIN_TICKET_SECRET
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
```

5. 确认 `wechat_miniapp_login` 仍允许未登录客户端调用 `start`，而 `prepare-bind`、`bind`、`status`、`unbind` 在函数内部校验用户 JWT。

## 九、体验版上传

1. 使用生产小程序环境变量重新执行 `build:weapp`。
2. 确认微信开发者工具 AppID 与 Edge Function 使用的小程序 AppID 一致。
3. 确认合法 request 域名包含实际 Supabase/代理入口。
4. 上传新体验版，版本说明建议：

```text
登录绑定、主题图标与首页拍照入口修复
```

5. 记录版本号、上传时间、构建提交和测试设备。

## 十、真机验收矩阵

### 首页

- 食材输入框只显示相机按钮，不显示麦克风按钮。
- 拍照和相册选择均可进入识图。
- 图片立即预览，识别完成后食材名称正确。
- 添加食材后列表缩略图存在，完成分析后历史图片可访问。
- AI 问答页语音输入仍可正常使用。

### UI

- 个人中心菜单图标与体验版设计一致：绿色图标、浅绿色底。
- 首页、个人中心、账号设置页的主题按钮均有可见背景和文字。
- 退出登录、解绑微信保持红色危险操作语义。
- 图标、文字、按钮无重叠或截断。

### 微信新用户

- 新微信点击一键登录后不得直接创建独立账号。
- 选择“绑定已有账号”，正确密码可绑定并登录。
- 错误密码不绑定。
- 选择“先注册账号”，完成用户名、密码、确认密码注册后绑定微信。
- 用户名冲突时不绑定，不创建重复账户。

### 微信老用户与冲突

- 已绑定微信继续静默登录同一个 `user_id`。
- 某微信已绑定账号 A 时，账号 B 绑定必须返回冲突。
- 某账号已绑定微信 A 时，绑定微信 B 必须提示先解绑。
- 旧版纯微信账号显示迁移提示，不提供直接创建用户名或自动合并入口。

### 解绑

- 用户名账号绑定微信后，输入错误密码不能解绑。
- 输入正确密码可以解绑，用户名密码仍能登录原 `user_id`。
- 解绑后的微信再次一键登录应显示未绑定选择，不得由旧 `profiles.openid` 自动恢复绑定。

## 十一、回传格式

```markdown
# 完整补丁执行报告

## 基线与合并
- 云端原始 HEAD：
- 补丁应用方式：direct/3way/manual
- 冲突文件及处理：
- 最终 diff 文件：

## 静态检查
- WeChat feature check：PASS/FAIL
- Device feature check：PASS/FAIL
- TypeScript：PASS/FAIL
- Biome：PASS/FAIL
- Oxlint：PASS/FAIL
- weapp build：PASS/FAIL
- diff check：PASS/FAIL

## 部署
- Supabase project ref 匹配：YES/NO
- 数据库迁移：SKIPPED（本补丁无迁移）
- wechat_miniapp_login deployment id：

## 体验版
- 版本号：
- 上传时间：
- 测试设备/系统/微信版本：

## 真机结果
- 首页无麦克风入口：PASS/FAIL/BLOCKED
- 拍照识图与图片持久化：PASS/FAIL/BLOCKED
- AI 问答语音未回归：PASS/FAIL/BLOCKED
- 主题按钮和图标：PASS/FAIL/BLOCKED
- 已有账号绑定：PASS/FAIL/BLOCKED
- 先注册后绑定：PASS/FAIL/BLOCKED
- 微信绑定冲突：PASS/FAIL/BLOCKED
- 密码验证解绑：PASS/FAIL/BLOCKED
- 旧版账号迁移提示：PASS/FAIL/BLOCKED

## 证据
- 截图/录屏：
- 非敏感 request id：
- Edge Function 非敏感日志摘要：

## 剩余问题
- 未执行或被阻塞的项目必须逐条列出，不得写成通过。
```
