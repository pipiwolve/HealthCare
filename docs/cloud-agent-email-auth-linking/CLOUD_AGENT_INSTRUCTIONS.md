# 云端 Agent 执行指令：邮箱认证、微信互通与个人资料修正

> **2026-07-27 修订：** 封装版 Supabase 控制台没有 SMTP 配置入口，本文件中依赖 Supabase Confirm signup 邮件、Custom SMTP 和 `verifyOtp({type:'signup'})` 的要求不得直接用于生产。请先应用代码补丁，再严格按照同目录 `0002-external-email-provider-instructions.md` 将邮箱发信改为国内邮件推送平台 HTTPS API；微信互通、账号状态、昵称和数据管理要求继续有效。

请在目标云端仓库中应用本轮补丁，完成代码检查、受控部署和微信小程序验收。必须逐项执行并回传证据，不得只回复“已完成”或“已修复”。

## 一、交付物与基线

- 补丁：`docs/cloud-agent-email-auth-linking/0001-email-auth-wechat-linking.patch`
- SHA-256：`3ef1265594e061686a254d28bc8300ea3b20423bc9343453b34935580fc7def3`
- 本地基线：`2681936a240faace5887cfae0b78dd759ae213fc`
- 补丁范围：9 个文件，新增 377 行，删除 88 行。
- 本补丁不包含数据库迁移。

补丁涉及：

```text
README.md
src/contexts/AuthContext.tsx
src/pages/account-settings/index.tsx
src/pages/login/index.tsx
src/pages/personal-info/index.tsx
src/pages/privacy/index.tsx
src/services/wechatAuth.ts
src/utils/authValidation.ts
supabase/functions/wechat_miniapp_login/index.ts
```

目标仓库可能已包含部分增量。先核对现场，不得用旧版整文件覆盖，不得回退目标仓库中无关的 BRTC、BLE、图片、提醒或聊天改动。

## 二、最终业务模型

公开注册入口只允许邮箱注册。历史用户名账号继续保留底层登录兼容，但新用户界面不得出现用户名注册或用户名登录入口。

邮箱和微信不是两个业务账户体系，而是同一个 Supabase 用户的两种认证入口：

```text
邮箱注册或登录 -> Supabase user A -> 绑定当前微信 openid
微信首次进入   -> 登录或注册邮箱 -> Supabase user A -> 绑定该微信 openid

绑定完成后：
邮箱登录 -> user A
微信登录 -> user A
```

两个已经独立存在的历史 `user_id` 不得自动合并。历史 `@wechat.login` 独立账号只保留兼容识别，不允许无确认地覆盖或迁移健康档案、家庭成员、称重记录、设备或聊天数据。

## 三、必须达到的功能结果

### 邮箱注册

1. 注册界面只显示邮箱、密码、确认密码。
2. 第一步发送邮箱验证码，第二步使用 `verifyOtp({type: 'signup'})` 验证后才完成注册。
3. 当前客户端固定接收 8 位数字验证码，输入框、校验和邮件实际内容必须一致。
4. 验证码重发倒计时为 60 秒；倒计时结束后的按钮必须保持白底、绿色文字和可见边框。
5. 新密码只校验 6-72 位，不限制字符类型；纯数字 6 位密码必须能够注册。
6. Supabase 若关闭邮箱确认并在 `signUp` 时直接返回 session，客户端必须退出该 session 并提示认证配置错误，不能绕过验证码。
7. `@miaoda.com` 和 `@wechat.login` 不得用于新邮箱注册。

### 登录兼容

1. 新版 UI 只提示邮箱登录。
2. 历史用户名账号仍可由 `signInWithAccount` 在底层映射到 `username@miaoda.com`，不得批量删除历史账号。
3. 已有账号登录不强制套用新密码规则，避免历史密码失效。

### 微信绑定互通

1. 邮箱用户登录后可在“账号与微信”中绑定当前微信。
2. 未绑定微信首次进入时，可登录已有邮箱账户后绑定，也可先完成邮箱注册和验证码验证再绑定。
3. 邮箱验证可能超过旧 ticket 有效期，因此绑定前必须通过 `prepareWechatBinding()` 重新获取当前微信 ticket。
4. `prepare-bind` 和 `bind` 都必须拒绝将另一个微信覆盖到已经绑定微信的账户。
5. 某微信已绑定用户 A 时，用户 B 绑定同一微信必须返回冲突。
6. 已绑定微信快捷登录继续生成 magic-link token，并登录原来的同一 `user.id`。
7. 新流程不得调用直接创建 `@wechat.login` 用户的注册接口。

### 账号与微信页面

1. 新邮箱用户显示“邮箱账户”、实际邮箱地址和“已配置”。
2. 微信未绑定时显示“未绑定 / 未连接”和“绑定当前微信”。
3. 页面状态由云函数的微信绑定状态和当前 Supabase session 邮箱共同组成，不能因为旧云函数缺少 `loginType` 字段就误判成旧微信账号。
4. 新用户界面不得出现“用户名登录”“用户名或邮箱”或“绑定已有用户名”等文案。
5. 绑定后说明应明确：邮箱和微信登录同一账户；两个独立账户不会自动合并数据。

### 解绑

1. 真实邮箱账户和历史 `@miaoda.com` 账户均属于可验证密码账户。
2. `@wechat.login` 独立账号不允许直接解绑，避免用户失去唯一登录入口。
3. 解绑前必须通过 Supabase password grant 验证当前用户 ID 和密码。
4. 先清空 `profiles.openid`，再删除 `wechat_identities`，避免旧兼容逻辑恢复绑定。

### 个人资料与数据管理

1. 健康档案允许编辑 1-20 个字符的昵称。
2. 主成员昵称保存后同步更新 `profiles.nickname`，并刷新个人中心和家庭成员状态。
3. “清空当前成员健康档案”和“清除 AI 对话”均使用白底、绿色文字和绿色边框，不显示红色按钮。
4. 第二个入口只显示“清除 AI 对话”，但继续清理远端 AI 上下文和本地对话记录。

## 四、安全边界

- 禁止执行 `git reset --hard` 或用整文件回退解决冲突。
- 禁止输出 Supabase anon key、service-role key、SMTP 授权码、微信 AppSecret、验证码、登录 ticket、OpenID、手机号或用户密码。
- 禁止运行任何数据库迁移、全量 schema 或用户数据合并脚本；本补丁不需要数据库变更。
- 禁止删除或自动迁移历史微信独立账号。
- 部署前必须确认目标 project ref。当前项目预期为 `zhgdvfwemwcmnehoarwp`；若目标环境不一致，停止部署并报告，不得猜测。
- 只允许部署本补丁修改的 `wechat_miniapp_login`，不得顺带部署其他 Edge Function。

## 五、应用补丁

先记录现场：

```bash
rtk git status --short
rtk git rev-parse HEAD
rtk git log -5 --oneline
rtk proxy shasum -a 256 docs/cloud-agent-email-auth-linking/0001-email-auth-wechat-linking.patch
```

校验并应用：

```bash
rtk proxy git apply --check docs/cloud-agent-email-auth-linking/0001-email-auth-wechat-linking.patch
rtk proxy git apply docs/cloud-agent-email-auth-linking/0001-email-auth-wechat-linking.patch
```

如果目标仓库已包含部分改动，先尝试：

```bash
rtk proxy git apply --3way docs/cloud-agent-email-auth-linking/0001-email-auth-wechat-linking.patch
```

发生冲突时逐个 hunk 合并。保留目标仓库中与本轮无关且已验证的功能，同时满足第三节的全部行为。不得通过覆盖整个登录页、认证上下文或 Edge Function 来规避冲突。

## 六、Supabase 配置预检

在不输出任何 Secret 值的前提下确认：

1. Email Provider 已启用。
2. Confirm email 已启用。
3. Confirm signup 模板正文使用 `{{ .Token }}`，实际邮件验证码为 8 位数字。
4. Custom SMTP 已保存，Sender name 和 Sender email 为产品配置，不再显示 Supabase 默认发件身份。
5. OTP 有效期和发送频率限制已启用。
6. 下列 Edge Function Secret 名称存在：

```text
WECHAT_MINIPROGRAM_LOGIN_APP_ID
WECHAT_MINIPROGRAM_LOGIN_APP_SECRET
WECHAT_LOGIN_TICKET_SECRET
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
```

若邮件实际验证码不是 8 位，停止发布并先统一 Supabase OTP 设置与 `EMAIL_OTP_LENGTH`，不得仅放宽客户端长度规避配置不一致。

## 七、代码检查

在仓库根目录执行：

```bash
rtk proxy ./scripts/runLint.sh
rtk pnpm build:weapp
rtk git diff --check
```

再进行定向检查：

```bash
rtk proxy rg -n "EMAIL_OTP_LENGTH|verifyEmailSignUp|prepareWechatBinding" src
rtk proxy rg -n "hasPasswordLogin|loginType|loginIdentifier" src supabase/functions/wechat_miniapp_login
rtk proxy rg -n "用户名登录|用户名或邮箱|绑定已有用户名" src
```

最后一条命令应无面向新用户的匹配。`normalizeUsername`、`@miaoda.com` 和 `loginType: 'username'` 可以作为历史兼容实现保留。

## 八、受控部署

确认 CLI 登录项目与小程序构建环境都指向 `zhgdvfwemwcmnehoarwp` 后，只部署：

```bash
rtk proxy supabase functions deploy wechat_miniapp_login \
  --project-ref zhgdvfwemwcmnehoarwp \
  --no-verify-jwt
```

`verify_jwt=false` 是为了允许未登录用户调用 `start`。`prepare-bind`、`bind`、`status` 和 `unbind` 仍必须在函数内部调用 `getAuthUserId` 校验 JWT。

部署后只读确认函数状态、版本和更新时间，不输出 Secret：

```bash
rtk proxy supabase functions list --project-ref zhgdvfwemwcmnehoarwp
```

## 九、验收矩阵

至少使用一个专用测试邮箱和两个测试微信身份完成：

1. 邮箱注册：收到 8 位验证码，少于 8 位不能提交，正确验证码注册成功。
2. 重发按钮：60 秒内倒计时可见，结束后“重新发送”白底绿字清晰可见。
3. 密码规则：少于 6 位或超过 72 位被拒绝，纯数字 6 位密码可以注册。
4. 邮箱登录：账号与微信页显示“邮箱账户 / 邮箱地址 / 已配置”。
5. 邮箱先登录再绑定微信：绑定后微信登录与邮箱登录得到同一 `user.id`。
6. 微信先进入再绑定已有邮箱：绑定后两种方式得到同一 `user.id`。
7. 微信先进入再注册邮箱：验证码完成后绑定成功，等待超过旧 ticket 时间也能通过刷新 ticket 完成绑定。
8. 冲突保护：同一微信不能绑定两个用户，同一用户不能覆盖绑定另一个微信。
9. 解绑：错误密码失败，正确密码成功，解绑后邮箱仍可登录。
10. 昵称：修改主成员昵称后个人中心和家庭成员列表同步更新。
11. 数据管理：两个入口均为白底绿字；“清除 AI 对话”文案正确且清理动作成功。

不要在报告中记录邮箱验证码、完整邮箱、OpenID 或用户 ID；可使用脱敏值和非敏感 request id。

## 十、回传格式

```markdown
# 邮箱认证与微信互通执行报告

## 基线与补丁
- 原始 HEAD：
- 补丁 SHA-256：
- 应用方式：direct / 3way / manual
- 冲突文件及处理：
- 最终修改文件：

## Supabase 预检
- project ref 匹配：YES / NO
- Email Provider：PASS / FAIL / BLOCKED
- Confirm email：PASS / FAIL / BLOCKED
- 8 位 Token 模板：PASS / FAIL / BLOCKED
- Custom SMTP：PASS / FAIL / BLOCKED
- 必需 Secret 名称：PASS / FAIL / BLOCKED

## 静态检查
- lint：PASS / FAIL
- build:weapp：PASS / FAIL
- diff check：PASS / FAIL

## 部署
- 数据库迁移：SKIPPED
- wechat_miniapp_login 原版本：
- wechat_miniapp_login 新版本：
- 部署时间：

## 验收
- 邮箱验证码注册：PASS / FAIL / BLOCKED
- 8 位输入与重发样式：PASS / FAIL / BLOCKED
- 密码规则：PASS / FAIL / BLOCKED
- 邮箱账户已配置状态：PASS / FAIL / BLOCKED
- 邮箱登录后绑定微信：PASS / FAIL / BLOCKED
- 微信进入后绑定已有邮箱：PASS / FAIL / BLOCKED
- 微信进入后注册邮箱并绑定：PASS / FAIL / BLOCKED
- 绑定冲突保护：PASS / FAIL / BLOCKED
- 密码验证解绑：PASS / FAIL / BLOCKED
- 昵称同步：PASS / FAIL / BLOCKED
- 数据管理样式与清理：PASS / FAIL / BLOCKED

## 证据与剩余问题
- 截图或录屏：
- 非敏感 request id：
- 未执行项及原因：
```

任何未实际执行的项目必须标记为 `BLOCKED`，不得写成通过。
