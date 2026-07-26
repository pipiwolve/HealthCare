# 当前环境变量与 BRTC / Default Agent / License 调用关系盘点

> 盘点日期：2026-07-23  
> 依据：当前仓库实际代码读取点；不包含未在代码中读取的历史变量。

## 1. 先说结论

1. 当前 `ws-sign` 同时承担三件事：校验 Supabase 登录态、调用百度接口创建一次 default agent、把 WebSocket URL 与 License 参数返回给小程序。
2. **拉起 default agent 本身只需要百度 AK/SK、BRTC AppID 和可选的 Agent 配置，不需要 License Device ID，也不需要 License Key。**
3. `BAIDU_BRTC_LICENSE_KEY` 和 `BAIDU_BRTC_LICENSE_DEVICE_ID` 是在 WebSocket 建立后，BRTC 网关要求 License 鉴权时才使用。
4. 当前 `BAIDU_BRTC_LICENSE_DEVICE_ID` 是测试期全局固定值。正式生产时，Device ID 必须按绑定的物理厨房秤动态查询，不能继续作为全局环境变量。
5. `licenseKey` 可以继续作为后端 Secret；如果未来一个系统服务多个客户或多个 License 池，则应改成数据库中的 License Pool 配置，并只保存 Secret 引用或加密值。
6. 当前 Supabase Secret 清单 `supabase/secrets/required.json` 与实际代码已经不完全一致，不能继续作为唯一部署依据。

## 2. 当前实际调用顺序

```text
用户完成登录
  -> 小程序获得 Supabase Session / Access Token
  -> AI 页面调用 supabase.functions.invoke('ws-sign')
  -> ws-sign 使用 Supabase URL + Anon Key 验证当前用户
  -> ws-sign 使用百度 AK/SK + BRTC AppID 调用 generateAIAgentCall
  -> 百度返回 ai_agent_instance_id + token
  -> ws-sign 拼出 BRTC WebSocket URL
  -> ws-sign 同时返回 licenseKey + 固定 licenseDeviceId + Supabase userId
  -> 小程序连接 BRTC WebSocket
  -> BRTC 返回 [E]:[LIC]:[MUST]
  -> 小程序发送 [E]:[LIC]:[ACTIVE]:{devId,uId,licKey}
  -> BRTC 返回 PASS 或 FAILED
```

当前三类 ID 的来源：

```text
appId  = BAIDU_BRTC_APPID
userId = 当前 Supabase 登录用户 UUID
uId    = userId；如果为空则退化为 devId

devId  = BAIDU_BRTC_LICENSE_DEVICE_ID
         -> 如果后端没返回，则读取本地 brtc_license_device_id
         -> 如果仍为空，则生成 miniapp-${Date.now()}
```

其中最后一个时间戳兜底会产生新的激活标识，是正式计费前必须删除的 P0 风险。

## 3. 小程序构建与 Supabase 客户端

读取位置：

- `src/client/supabase.ts`
- `config/index.ts`
- `config/dev.ts`

| 环境变量 | 当前要求 | 当前用途 | 是否敏感 |
|---|---|---|---|
| `TARO_APP_SUPABASE_URL` | 必需 | Supabase Auth、REST、Storage、Edge Functions 的基础地址 | 否 |
| `TARO_APP_SUPABASE_ANON_KEY` | 功能上必需 | 创建前端 Supabase Client；代码虽有 `TOKEN` 兜底，但生产不能使用兜底 | 否，属于公开客户端 Key，但依赖 RLS 保护 |
| `TARO_APP_APP_ID` | 必需 | 微信小程序 AppID；同时用于 Supabase Session 本地存储键 `${appId}-auth-token` | 否 |
| `TARO_APP_SHOW_PRIVACY_SCOPE_MODAL` | 可选，默认 `false` | 编译期控制隐私授权弹窗 | 否 |
| `TARO_ENV` | 构建系统提供 | 区分 weapp/h5，选择 Supabase polyfill、Canvas 和 Tailwind 行为 | 否 |
| `NODE_ENV` | 构建系统提供 | 区分开发和生产构建 | 否 |
| `LINT_MODE` | 开发/CI 可选 | 切换 lint 构建配置 | 否 |
| `INJECT_SENTRY_DSN` | 开发监控可选 | Sentry DSN | 一般不按服务端 Secret 管理 |
| `MIAODA_ENV` | 开发监控可选 | 监控环境名 | 否 |
| `MIAODA_CDN_HOST` | 可选 | 开发监控脚本 CDN，默认 `resource-static.cdn.bcebos.com` | 否 |

注意：所有 `TARO_APP_*` 都会进入小程序构建产物，不得放入百度 SK、微信 AppSecret、Supabase Service Role Key 等服务端秘密。

## 4. `ws-sign`：Default Agent + WebSocket + License

读取位置：`supabase/functions/ws-sign/index.ts`

### 4.1 创建 default agent 必需变量

| 环境变量 | 当前要求 | 用途 |
|---|---|---|
| `BAIDU_BCE_AK` 或 `BAIDU_BRTC_AK` | 必需，二选一 | 对 `generateAIAgentCall` 请求进行 BCE HMAC 签名 |
| `BAIDU_BCE_SK` 或 `BAIDU_BRTC_SK` | 必需，二选一 | 与 AK 配套生成 BCE 签名；必须保存在服务端 |
| `BAIDU_BRTC_APPID` | 生产必需 | 创建 Agent 请求的 `app_id`；也写入 WebSocket URL 的 `a` 参数。代码当前有硬编码兜底，但生产不应依赖兜底 |

建议固定使用同一套命名，不要 AK 用 `BAIDU_BCE_AK`、SK 却用 `BAIDU_BRTC_SK`。当前项目可以统一为：

```text
BAIDU_BRTC_AK
BAIDU_BRTC_SK
BAIDU_BRTC_APPID
```

### 4.2 Default Agent 可选配置

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `BAIDU_RTC_AGENT_ROLE_NAME` | `智能健康顾问` | `sceneRoleCfg.name` |
| `BAIDU_RTC_AGENT_PROMPT` | 代码内健康顾问 Prompt | `sceneRoleCfg.prompt` |
| `BAIDU_RTC_AGENT_MODEL` | `DEFAULT` | `sceneRoleCfg.model` |
| `BAIDU_RTC_AGENT_ASR_VAD_MS` | `300` | ASR VAD 参数 |
| `BAIDU_RTC_AGENT_ASR_VAD_WAIT_MS` | `800` | ASR VAD 等待时间 |
| `BAIDU_RTC_AGENT_TTS_END_DELAY_MS` | `120` | TTS 结束延时 |
| `BAIDU_RTC_AGENT_CONFIG` | 空 JSON 覆盖 | 完整 Agent 配置覆盖；代码通过最后展开覆盖默认配置 |

`BAIDU_RTC_AGENT_CONFIG` 权限最大，可以覆盖前面构造出的字段，包括 `user_id`。生产环境应限制配置内容并做 Schema 校验，避免错误 JSON 或覆盖身份字段。

当前 `agentProfile` 不是环境变量，而是前端每次调用 `ws-sign` 时传入：

```text
chat
vision
voice-realtime
voice-ptt
```

它主要影响 `asr_long_audio_mode`，每次调用都会新建一个 default agent 实例。

### 4.3 License 鉴权变量

| 环境变量 | 当前要求 | 当前用途 | 是否用于创建 Agent |
|---|---|---|---:|
| `BAIDU_BRTC_LICENSE_KEY` | 正式 License 场景必需 | 返回给小程序，作为 License ACTIVE 消息中的 `licKey` | 否 |
| `BAIDU_BRTC_LICENSE_DEVICE_ID` | 当前测试必需；正式生产应移除 | 返回给所有小程序，作为 License ACTIVE 消息中的 `devId` | 否 |

当前客户端最终发送：

```json
{
  "devId": "BAIDU_BRTC_LICENSE_DEVICE_ID",
  "uId": "当前 Supabase 用户 UUID",
  "licKey": "BAIDU_BRTC_LICENSE_KEY"
}
```

因此：

- AK/SK：创建 Agent 和访问百度管理 API的服务端身份。
- AppID：Agent、WebSocket 和 License 所属的百度应用。
- License Key：证明当前应用拥有 License 授权。
- Device ID：告诉百度“当前是哪一台被授权设备”，用于设备激活去重和计数。
- User ID：当前使用者身份；现在来自 Supabase 登录用户，不是环境变量。

### 4.4 `ws-sign` 为验证登录态需要的变量

| 首选变量 | Supabase 平台变量兜底 | 用途 |
|---|---|---|
| `APP_SUPABASE_URL` | `SUPABASE_URL` | 请求 `/auth/v1/user` 验证 Authorization Token |
| `APP_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY` | 调用 Supabase Auth 用户验证接口 |

`ws-sign` 当前没有使用 Service Role Key，只验证当前登录用户。

## 5. `brtc-history`

读取位置：`supabase/functions/brtc-history/index.ts`

| 环境变量 | 用途 |
|---|---|
| `BAIDU_BCE_AK` 或 `BAIDU_BRTC_AK` | 签名百度 BRTC 历史记录 API |
| `BAIDU_BCE_SK` 或 `BAIDU_BRTC_SK` | 签名百度 BRTC 历史记录 API |
| `BAIDU_BRTC_APPID` | 指定查询哪个百度应用的对话历史 |
| `APP_SUPABASE_URL` 或 `SUPABASE_URL` | 验证当前登录用户 |
| `APP_SUPABASE_ANON_KEY` 或 `SUPABASE_ANON_KEY` | 验证当前登录用户 |

该模块当前不读取 License Key 或 License Device ID。

## 6. 微信登录与账号绑定

直接和间接读取位置：

- `supabase/functions/wechat_miniapp_login/index.ts`
- `supabase/functions/_shared/wechat.ts`
- `supabase/functions/_shared/common.ts`

| 环境变量 | 当前要求 | 用途 |
|---|---|---|
| `WECHAT_MINIPROGRAM_LOGIN_APP_ID` | 必需 | 调用微信 `code2Session`、获取 access token |
| `WECHAT_MINIPROGRAM_LOGIN_APP_SECRET` | 必需 | 微信服务端 AppSecret，绝不能进入小程序 |
| `WECHAT_LOGIN_TICKET_SECRET` | 必需 | 对登录/绑定临时 Ticket 做 HMAC 签名和校验 |
| `APP_SUPABASE_URL` 或 `SUPABASE_URL` | 必需 | Supabase 项目地址；也用于密码验证 Auth API |
| `APP_SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY` | 必需 | 管理 Auth 用户、微信身份表、Profile 等后台数据 |
| `APP_SUPABASE_ANON_KEY` 或 `SUPABASE_ANON_KEY` | 当前解绑密码校验需要 | 调用 `/auth/v1/token?grant_type=password` 校验密码 |

这里的微信 AppID 与 `TARO_APP_APP_ID` 应当指向同一个微信小程序，但分别存在于：

- `TARO_APP_APP_ID`：小程序构建侧，可公开。
- `WECHAT_MINIPROGRAM_LOGIN_APP_ID`：Edge Function 服务端配置。

登录成功后得到的 Supabase `user.id`，会在后续调用 `ws-sign` 时写入 default agent 的 `user_id`，并作为 License ACTIVE 的 `uId`。

## 7. 微信订阅消息

### `wechat-notification-schedule`

| 环境变量 | 用途 |
|---|---|
| `APP_SUPABASE_URL` / `SUPABASE_URL` | 数据库与登录校验 |
| `APP_SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 写入提醒设置和调度记录 |
| `WECHAT_SUBSCRIBE_TEMPLATES_JSON` | 配置早餐、午餐、晚餐、饮水模板 ID、页面和字段映射 |

### `wechat-notification-dispatch`

除上面的变量外，还需要：

| 环境变量 | 用途 |
|---|---|
| `WECHAT_MINIPROGRAM_LOGIN_APP_ID` | 获取微信 access token |
| `WECHAT_MINIPROGRAM_LOGIN_APP_SECRET` | 获取微信 access token |
| `WECHAT_NOTIFICATION_DISPATCH_SECRET` | 校验内部调度请求头，防止公开调用批量发消息 |

## 8. 上传、分享和普通后台函数

### `recipe-share`、`upload-avatar`

通过 `_shared/common.ts` 间接需要：

```text
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
```

用于验证用户和执行数据库/Storage 管理操作。

### `upload-food-image`

直接需要：

```text
APP_SUPABASE_URL 或 SUPABASE_URL
APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY
```

用于把图片上传到 `chat-images` Storage Bucket。

## 9. 测试脚本变量

| 环境变量 | 用途 |
|---|---|
| `RTC_HISTORY_TEST_GAP_SECONDS` | `scripts/testRtcHistoryE2e.mjs` 控制历史记录测试分组时间间隔；仅测试使用 |

## 10. 当前生产环境建议的最小变量集合

### 小程序构建环境

```text
TARO_APP_SUPABASE_URL
TARO_APP_SUPABASE_ANON_KEY
TARO_APP_APP_ID
TARO_APP_SHOW_PRIVACY_SCOPE_MODAL       # 可选
```

### Supabase / Edge Functions 基础配置

如果使用项目自定义代理地址，配置：

```text
APP_SUPABASE_URL
APP_SUPABASE_ANON_KEY
APP_SUPABASE_SERVICE_ROLE_KEY
```

如果完全使用 Supabase 平台自动注入变量，代码也支持：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### 百度 BRTC / Default Agent

```text
BAIDU_BRTC_AK
BAIDU_BRTC_SK
BAIDU_BRTC_APPID
BAIDU_BRTC_LICENSE_KEY
BAIDU_BRTC_LICENSE_DEVICE_ID             # 仅当前测试期
```

Agent 个性化变量按需配置：

```text
BAIDU_RTC_AGENT_ROLE_NAME
BAIDU_RTC_AGENT_PROMPT
BAIDU_RTC_AGENT_MODEL
BAIDU_RTC_AGENT_ASR_VAD_MS
BAIDU_RTC_AGENT_ASR_VAD_WAIT_MS
BAIDU_RTC_AGENT_TTS_END_DELAY_MS
BAIDU_RTC_AGENT_CONFIG
```

### 微信登录

```text
WECHAT_MINIPROGRAM_LOGIN_APP_ID
WECHAT_MINIPROGRAM_LOGIN_APP_SECRET
WECHAT_LOGIN_TICKET_SECRET
```

### 微信订阅消息（启用时）

```text
WECHAT_SUBSCRIBE_TEMPLATES_JSON
WECHAT_NOTIFICATION_DISPATCH_SECRET
```

## 11. 当前 Secret 清单与代码不一致

`supabase/secrets/required.json` 当前列出但实际运行代码没有读取：

```text
BAIDU_QIANFAN_API_KEY
BAIDU_AK
BAIDU_SK
BAIDU_ASR_APP_KEY
BAIDU_ASR_APP_SECRET
```

可能是历史实现遗留，不能据此判断当前模块仍依赖这些变量。

反过来，代码实际读取但该清单没有完整纳入的变量包括：

```text
BAIDU_BRTC_LICENSE_DEVICE_ID
BAIDU_RTC_AGENT_*
APP_SUPABASE_*
```

建议后续重写该清单，至少增加：模块、必需/可选、Secret/公开、默认值、部署环境和轮换方式。

## 12. 正式设备激活后需要改变的变量边界

正式生产时建议调整为：

```text
环境变量：
  BAIDU_BRTC_AK
  BAIDU_BRTC_SK
  默认 BAIDU_BRTC_APPID
  默认或单 License Pool 的 BAIDU_BRTC_LICENSE_KEY

数据库/运行时动态数据：
  hardware_uid
  canonical_license_device_id
  user_id
  binding_id
  activation_status
  license_pool_id
```

即：

```text
BAIDU_BRTC_LICENSE_DEVICE_ID
```

应从“全局环境变量”迁移为：

```text
当前登录用户
  -> 当前有效设备绑定
  -> hardware_uid
  -> 服务端生成 canonical devId
  -> ws-sign 动态返回
```

如果不同客户购买不同的百度 License Key/AppID，则 `licenseKey` 和 `appId` 也应从单一环境变量迁移到 `license_pools` 配置，由设备所属客户/订单动态选择。
