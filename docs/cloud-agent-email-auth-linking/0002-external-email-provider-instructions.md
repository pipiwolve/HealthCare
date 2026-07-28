# 云端 Agent 修订指令：改用国内邮件推送 API，不依赖 Supabase SMTP

## 重要前提

当前封装版 Supabase 控制台没有 SMTP 配置入口，国内环境也不允许未经审核地通过任意 SMTP 发信。因此，不能继续使用本目录 `0001-email-auth-wechat-linking.patch` 中“由 `supabase.auth.signUp()` 自动发送 Confirm signup 邮件”的实现作为最终生产方案。

本文件是对 0001 补丁中邮箱发信部分的修订。微信互通、账号状态、昵称和数据管理要求继续保留；邮箱发信和验证码注册必须按本文件重构。

## 一、推荐的运行时架构

默认优先评估腾讯云 SES（Simple Email Service）或 SendCloud 等已完成国内主体、域名和发件人审核的平台。最终选择必须以项目实际拥有的账号、已审核发件域名和 API 能力为准，不得在没有凭据和发件人审核状态的情况下假装部署成功。

“自定义 skill”只用于指导云端 Agent 编写和配置代码，不是小程序运行时。运行时必须是 Supabase Edge Function 通过 HTTPS 调用邮件平台 API，所有平台密钥只放在 Edge Function Secret 中。

```text
小程序
  -> request-email-otp Edge Function
  -> 国内邮件平台 HTTPS API
  -> 用户邮箱收到 8 位验证码

小程序提交邮箱 + 验证码 + 密码
  -> verify-email-otp Edge Function
  -> 校验一次性验证码
  -> Supabase Admin createUser(email, password, email_confirm=true)
  -> 客户端 signInWithPassword 建立 session
  -> 继续现有微信 bind 流程
```

登录已注册邮箱时仍使用 `signInWithPassword`，不需要每次发送验证码。忘记密码流程若后续接入，也必须复用同一邮件平台适配器，不能恢复 Supabase 默认 SMTP。

## 二、服务端接口要求

新增两个受保护的 Edge Function action，建议放在一个 `email_auth` 函数中；如果云端仓库已有统一认证函数，也可以放入该函数，但必须保持接口语义一致。

### `request-email-otp`

请求：

```json
{"action":"request-email-otp","email":"user@example.com"}
```

要求：

1. 标准化邮箱并拒绝 `@miaoda.com`、`@wechat.login`。
2. 生成 8 位数字验证码；只保存哈希，不能保存明文验证码。
3. 验证码有效期建议 5 分钟；同一邮箱 60 秒内不能重复发送；每日和每小时都要有频率限制。
4. 验证码记录必须有随机 challenge id、email、hash、expires_at、attempts、consumed_at、created_at。
5. 通过邮件平台 HTTPS API 发送模板邮件，邮件正文必须包含验证码、有效期、产品名和非敏感安全提示。
6. 响应只返回 opaque challenge id 和过期时间，不能返回验证码、平台响应中的 token 或任何密钥。
7. 对已注册邮箱和未注册邮箱尽量返回统一的业务结果，避免邮箱枚举；真正的注册冲突在验证/创建时处理。

### `verify-email-otp`

请求：

```json
{
  "action":"verify-email-otp",
  "challengeId":"opaque-id",
  "email":"user@example.com",
  "code":"12345678",
  "password":"client-submitted-password"
}
```

要求：

1. 校验 challenge、邮箱、验证码、过期时间和尝试次数；验证码只能成功消费一次。
2. 服务器不得记录密码明文；只在 TLS 请求中接收后立即传给 `admin.auth.admin.createUser`，不得写入 OTP 表、日志、错误信息或响应。
3. 验证成功后使用 service role 创建用户：`email_confirm: true`。不要调用会触发 Supabase 内置发信的 `auth.signUp`。
4. 若邮箱已存在，返回明确但不泄露其他账户资料的冲突错误；不得创建重复用户。
5. 创建成功后只返回成功标记和非敏感用户信息。客户端随后调用 `signInWithPassword` 建立 session。
6. 创建失败时应尽可能保留 challenge 的一次性消费语义，防止无限重试；记录 request id，不记录验证码和密码。

## 三、数据存储与迁移

当前 0001 补丁声明“无数据库迁移”，但自定义 OTP 需要可靠的一次性状态存储。除非目标平台已经提供可验证的受保护 KV，否则新增最小迁移：

```text
private.email_otp_challenges
- id uuid primary key
- email text not null
- code_hash text not null
- expires_at timestamptz not null
- attempts smallint not null default 0
- consumed_at timestamptz null
- created_at timestamptz not null default now()
```

要求：

- 只允许 Edge Function service role 读写；客户端不能直接访问。
- 对 `(email, created_at)` 和未消费、未过期记录建立必要索引。
- 旧验证码在发送新验证码时失效，定时清理过期记录。
- 迁移必须是单独、最小、可回滚的 SQL；不得重放全量 schema。
- 如果云端 Agent 选择签名 challenge + 外部 KV，必须提交等价的重放防护和一次性消费证明，不能只靠客户端保存验证码。

## 四、邮件平台适配器

新增服务端适配器，例如：

```text
supabase/functions/_shared/emailProvider.ts
```

适配器只暴露类似接口：

```ts
sendEmailOtp({to, code, expiresInMinutes}): Promise<void>
```

要求：

1. 通过 HTTPS API 调用腾讯云 SES、SendCloud 或经审核的同类平台。
2. 平台差异、签名、模板 ID、地域和错误映射封装在适配器内，不散落在认证流程中。
3. 只从环境变量读取平台 Secret；禁止把 Secret 写入源码、客户端 `.env`、补丁、截图或回传报告。
4. 对供应商超时、限流、4xx、5xx 做统一错误转换；向客户端返回通用“验证码发送失败，请稍后重试”。
5. 发件域名、Sender、模板和 SPF/DKIM/备案状态必须由项目负责人在供应商控制台完成审核，云端 Agent 只能检查，不得伪造审核状态。

建议 Secret 名称：

```text
EMAIL_PROVIDER=tencent_ses | sendcloud
EMAIL_PROVIDER_REGION
EMAIL_PROVIDER_ACCESS_KEY
EMAIL_PROVIDER_SECRET_KEY
EMAIL_PROVIDER_SENDER
EMAIL_PROVIDER_TEMPLATE_ID
EMAIL_OTP_SECRET
```

实际供应商需要哪些变量，以适配器实现为准；报告只回传变量名是否存在，不回传值。

## 五、客户端改造要求

将 0001 中依赖 Supabase 内置发信的客户端方法替换为：

1. `startEmailSignUp(email)` 调用 `request-email-otp`，保存 challenge id，启动 60 秒倒计时。
2. `verifyEmailSignUp(email, code, password)` 调用 `verify-email-otp`；成功后调用 `signInWithPassword(email, password)`。
3. 成功建立 session 后继续调用现有 `prepareWechatBinding` / `bindWechatSignIn`，邮箱和微信仍绑定同一 `user.id`。
4. 验证失败、过期、次数超限、已注册冲突和邮件平台失败都显示可理解的中文错误，不泄露服务端细节。
5. 保持 8 位输入限制、密码 6-72 位规则、重发按钮样式和“邮箱账户 / 已配置”页面逻辑；不得额外要求密码包含英文字母。
6. 删除对 `verifyOtp({type:'signup'})` 和 `signUp` 自动发 Confirm signup 邮件的依赖；登录已有账户仍可使用 `signInWithPassword`。

## 六、部署边界

在没有确认邮件平台、发件域名、模板和 Secret 已审核配置前：

- 可以应用代码和数据库迁移到测试环境并运行静态检查。
- 不得向真实用户发送测试邮件。
- 不得在生产环境启用一个未审核的发件人。
- 不得部署一个会把验证码写入日志或响应正文的函数。

部署前确认 Supabase project ref 与小程序配置一致。只部署本轮新增/修改的 `email_auth`（或等价认证函数）以及更新后的 `wechat_miniapp_login`；不部署无关 Edge Function，不修改微信绑定关系，不迁移历史用户数据。

## 七、必须回传的证据

```markdown
# 外部邮件 OTP 改造报告

## 方案
- 邮件平台：腾讯云 SES / SendCloud / 其他（说明）
- 发件域名审核：PASS / FAIL / BLOCKED
- 模板审核：PASS / FAIL / BLOCKED
- 适配器文件：
- OTP 数据存储：迁移 / 已审核 KV / 其他

## 安全检查
- 明文验证码不入库：PASS / FAIL
- 明文验证码不入日志和响应：PASS / FAIL
- 密码不入库和日志：PASS / FAIL
- Secret 仅在 Edge Function：PASS / FAIL
- 60 秒限流、过期和一次性消费：PASS / FAIL
- 邮箱枚举防护：PASS / FAIL

## 构建与部署
- migration dry-run：PASS / FAIL / BLOCKED
- lint：PASS / FAIL
- build:weapp：PASS / FAIL
- email_auth deployment：
- wechat_miniapp_login deployment：

## 真机验收
- 收到 8 位验证码：PASS / FAIL / BLOCKED
- 验证成功后创建并登录邮箱用户：PASS / FAIL / BLOCKED
- 错误/过期/重复验证码：PASS / FAIL / BLOCKED
- 60 秒重发限制：PASS / FAIL / BLOCKED
- 邮箱登录后绑定微信：PASS / FAIL / BLOCKED
- 微信进入后绑定邮箱：PASS / FAIL / BLOCKED

## 阻断项
- 未完成项目及原因：
```

任何未真实验证的项目必须标记为 `BLOCKED`，不得写成 `PASS`。
