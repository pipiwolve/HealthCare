# 厨房秤 License 鉴权改造前后对比与技术评估

> 文档状态：评估稿  
> 基线日期：2026-07-26  
> 协议基线：厨房秤广播协议 V1.1（2026-07-24）  
> 目标：将当前测试型固定 Device ID 方案改造为可按物理厨房秤准确激活、复用和对账的生产方案。

## 1. 结论摘要

本次改造不需要重写称重、AI 问答、拍照识图或百度 Default Agent 的主体架构。改造主要发生在设备身份与 License 鉴权边界，整体技术复杂度为中等，但属于计费与权限控制的高风险模块。

改造后的核心原则是：

1. 广播内 6 字节 MAC 是物理厨房秤的业务身份来源。
2. 手机系统返回的 BLE `deviceId` 只作为平台扫描标识，不再作为计费身份。
3. 百度 Device ID 由后台根据 MAC 生成，不是百度激活后返回的参数。
4. 一台秤第一次收到百度 `PASS` 时消耗一个 License 激活名额。
5. 同一台秤后续始终复用相同的 `licenseKey + appId + deviceId`，不重复消耗。
6. 用户解绑只解除账号关系，不删除物理设备档案和百度激活记录。
7. `FAILED`、超时、缺少 License 参数时必须阻断 AI 功能。

## 2. 评估依据

### 2.1 厨房秤广播协议 V1.1

新版 ManufacturerData 共 12 字节：

| 偏移 | 长度 | 含义 |
|---|---:|---|
| `0` | 1 Byte | 版本号 `0xB0` |
| `1` | 1 Byte | 流水号 |
| `2~4` | 3 Bytes | 重量，大端序 |
| `5` | 1 Byte | 单位、小数位、稳定状态等属性 |
| `6~11` | 6 Bytes | 设备 MAC，V1.1 新增 |

协议示例：

```text
02 01 04
0D FF B0 00 00 00 00 01 08 BB D0 20 D6 47
04 09 42 61 69
```

按当前文档解释：

```text
广播 MAC = 08:BB:D0:20:D6:47
规范化 MAC = 08bbd020d647
百度 Device ID = scale_08bbd020d647
```

正式开发前仍需厂家书面确认 MAC 字节顺序、唯一性、固定性，以及恢复出厂和固件升级后是否保持不变。

### 2.2 百度 License 规则

百度以以下组合唯一确认一次激活：

```text
licenseKey + appId + deviceId
```

首次出现新的组合并通过鉴权时消耗一个激活名额。每次重新建立互动连接仍需响应 `MUST` 并发送 `ACTIVE`，但相同组合属于已有激活的重复鉴权。

即时激活结果只有：

```text
[E]:[LIC]:[RES]:[PASS]
[E]:[LIC]:[RES]:[FAILED]
```

百度不会在 `PASS` 后生成并返回新的 Device ID。Device ID 必须由业务方在激活前确定。

相关字段需要明确区分：

| 字段 | 含义 | 使用位置 |
|---|---|---|
| `licenseId` | 百度 License 资源的管理标识 | 控制台、激活设备查询和对账 |
| `licenseKey` | 运行时激活凭证 | WebSocket `ACTIVE` 消息中的 `licKey` |
| `deviceId` | 业务方提供的稳定设备标识 | 与 License Key、AppID 共同构成激活唯一键 |
| `uId` | 客户侧可读的稳定标识 | 百度激活记录查询和业务对账 |

在“一批一码”模式下，一批设备共用同一个 `licenseId/licenseKey`，但每台厨房秤必须使用不同的 `deviceId`。`uId` 建议使用本地稳定的激活记录 ID 或与 `deviceId` 相同，不建议继续使用会随账号转移而变化的登录用户 ID。

## 3. 修改前与修改后总览

| 环节 | 修改前：当前系统 | 修改后：生产目标 | 影响 |
|---|---|---|---|
| 用户登录 | 只建立 Supabase 登录态 | 登录后查询有效设备绑定；无设备时提示绑定 | 小 |
| BLE 身份 | 使用手机返回的 `d.deviceId` | 使用广播 V1.1 内的 6 字节 MAC | 中 |
| 广播筛选 | 主要按名称 `Bai`、RSSI 筛选 | 名称、AD 类型、长度、版本、MAC 合法性、多包一致性 | 中 |
| 设备保存 | 直接写入 `devices.device_id` | 调用后台 `device-claim` 完成认领和冲突检查 | 中 |
| 设备唯一性 | 唯一约束是 `user_id + device_id` | MAC 全局唯一；一台秤只允许一个有效绑定 | 中 |
| 百度 Device ID | 全局固定环境变量 | 后台根据 MAC 生成并永久固定 | 中 |
| License Key | 全局环境变量直接返回 | 由服务端 License Pool 选择；单批次可继续用 Secret | 中 |
| License `uId` | 当前 Supabase 登录用户 ID | 稳定的设备激活记录标识，不随换绑变化 | 小 |
| `ws-sign` 入参 | 只有 Agent 配置 | 必须携带 `bindingId` | 中 |
| `ws-sign` 权限 | 只校验用户登录 | 校验用户、绑定、设备、激活状态、License 额度 | 中 |
| 首次激活 | 所有用户共用固定 Device ID | 每台新秤使用自己的 Device ID 激活 | 中 |
| 重复使用 | 无真实设备级复用记录 | 查询原激活记录并复用原三元组 | 中 |
| License 失败 | 当前存在失败后放行 | 失败、缺参、超时全部阻断 | 小但关键 |
| 用户解绑 | 直接删除 `devices` 行 | 绑定软解绑；保留设备和激活记录 | 中 |
| 设备转移 | 无明确流程 | 原用户解绑或管理员核验后转移 | 中 |
| 激活对账 | 无 | 百度激活设备 API 定时对账 | 中 |
| AI 问答/识图 | 已有业务逻辑 | 主体不改，仅在建连前增加鉴权门禁 | 小 |

## 4. 修改前：当前实际流程

### 4.1 登录

当前 `AuthProvider` 负责恢复 Supabase Session，`RouteGuard` 只判断用户是否登录。登录成功与设备绑定、License 激活之间没有强制前后关系。

```text
启动小程序
-> 恢复 Supabase Session
-> 登录用户可进入业务页面
-> 用户自行进入设备添加页面
```

### 4.2 BLE 扫描与设备保存

当前扫描结果只保存：

```ts
interface BLEDevice {
  deviceId: string
  name: string
  RSSI: number
}
```

其中 `deviceId` 来自手机系统。iOS 上可能表现为 UUID，Android 上可能表现为地址形式；当前代码没有解析 V1.1 新增的广播 MAC。

添加设备时直接写入：

```text
devices.user_id
devices.device_id = 手机平台 BLE deviceId
devices.device_name
```

数据库唯一约束为：

```text
UNIQUE(user_id, device_id)
```

这不能保证一台物理秤只被一个用户绑定，因为同一个 `device_id` 可以出现在不同用户记录中，跨手机时平台 ID 也可能变化。

### 4.3 Default Agent 与 `ws-sign`

当前 `ws-sign`：

1. 校验 Supabase 登录态。
2. 使用 AK、SK、AppID 创建 Default Agent。
3. 返回 WebSocket URL。
4. 返回环境变量中的固定 `licenseKey` 和固定 `licenseDeviceId`。

当前所有物理秤实际共用：

```text
BAIDU_BRTC_LICENSE_KEY
BAIDU_BRTC_LICENSE_DEVICE_ID
```

Default Agent 创建本身不依赖厨房秤身份；License 参数是在后续 WebSocket `MUST -> ACTIVE` 阶段使用。

### 4.4 License 握手

当前客户端收到 `MUST` 后发送：

```text
[E]:[LIC]:[ACTIVE]:{
  devId: 固定环境级 Device ID,
  uId: 当前 Supabase 用户 ID,
  licKey: 固定 License Key
}
```

当前还存在三项生产风险：

1. 没有 `licenseKey` 时直接放行。
2. 缺少 Device ID 时使用 `miniapp-${Date.now()}` 生成临时值。
3. 百度返回 `FAILED` 或发送激活消息失败时仍然标记为通过。

### 4.5 解绑

当前解绑直接删除 `devices` 数据行，没有区分：

```text
账号绑定关系
物理设备档案
百度 License 激活记录
```

目前尚未产生真实设备级 License 记录，因此暂未暴露重复计费问题；接入 MAC 后如果沿用硬删除，将导致重新绑定时丢失原激活关系。

## 5. 修改后：目标生产流程

### 5.1 登录与绑定触发

```text
用户登录
-> 查询当前用户是否存在 active binding
-> 有：正常进入业务页面
-> 无：提示添加厨房秤
```

账号注册本身不消耗 License。只有物理设备验证通过并收到百度 `PASS` 后，才计为一次正式激活。

### 5.2 BLE 扫描与协议过滤

扫描阶段解析完整广播，而不是只看设备名称：

```text
名称必须为 Bai
ManufacturerData AD Type 必须为 0xFF
Len 必须符合 V1.1，例如 0x0D
版本必须为 0xB0
MAC 必须存在且不是全 00、全 FF
连续多个广播包中的 MAC 必须一致
RSSI 达到绑定阈值
```

新的前端设备对象建议为：

```ts
interface BLEDevice {
  platformDeviceId: string
  hardwareMac: string
  protocolVersion: number
  name: string
  RSSI: number
  rawAdvertisement?: string
}
```

其中：

```text
platformDeviceId：仅供当前手机扫描诊断
hardwareMac：物理设备身份和后台绑定依据
```

设备在线探测和重量监听也应改为解析每个广播包中的 MAC，只接受与已绑定 `hardwareMac` 一致的包，不再使用“名称是 Bai 就视为目标设备”的兜底逻辑。

### 5.3 设备认领

新增后台接口：

```http
POST /device-claim
```

请求示例：

```json
{
  "hardwareMac": "08bbd020d647",
  "platformDeviceId": "E48D8926-A896-47AF-F166-736D97729762",
  "protocolVersion": "B0",
  "rawAdvertisement": "B0000000000108BBD020D647"
}
```

后台在事务内完成：

1. 校验用户登录态。
2. 校验 MAC 格式与协议版本。
3. 检查 MAC 是否在厂家出厂清单中。
4. 查询是否存在有效用户绑定。
5. 查询是否存在历史 License 激活记录。
6. 新设备时预占一个 License 额度并创建 `reserved` 激活记录。
7. 已激活设备只创建或恢复绑定，不再预占额度。
8. 返回后台生成的 `bindingId`。

### 5.4 首次 License 激活

推荐把“绑定成功”的业务定义为已经收到百度 `PASS`，避免本地显示已绑定但百度尚未激活。

```text
device-claim 返回 pending bindingId
-> App 调用 ws-sign(bindingId)
-> ws-sign 验证当前用户和绑定关系
-> 查询固定 License Pool、AppID、canonical Device ID
-> 创建 Default Agent
-> 返回 WebSocket URL 和服务端确定的激活参数
-> 百度发送 MUST
-> 客户端发送 ACTIVE
-> 百度返回 PASS
-> 本地 activation = active
-> 本地 binding = active
```

百度 Device ID 在激活前生成：

```text
08:BB:D0:20:D6:47
-> 08bbd020d647
-> scale_08bbd020d647
```

License `uId` 建议由后台生成并固定，例如：

```text
act_2f7f9d5c8e9a
```

它用于客户侧识别和百度激活记录对账，不等同于当前登录用户。设备转移给新用户时，账号绑定可以变化，但 `uId`、Device ID、License Pool 和 AppID 都保持不变。

激活成功后百度不会返回新的 Device ID。即时结果只有 `PASS` 或 `FAILED`。百度激活 UUID、到期时间和状态可以通过管理 API 后续查询并对账。

### 5.5 `ws-sign` 改造

请求从：

```json
{
  "agentProfile": "vision"
}
```

改为：

```json
{
  "bindingId": "binding-uuid",
  "agentProfile": "vision"
}
```

后台新增门禁：

```text
用户未登录 -> 401
binding 不属于当前用户 -> 403
设备尚未验证 -> 403 DEVICE_NOT_VERIFIED
设备被其他用户占用 -> 409 DEVICE_ALREADY_BOUND
License 额度不足 -> 402 LICENSE_EXHAUSTED
激活状态 forbidden/expired -> 403 LICENSE_INVALID
全部通过 -> 创建 Default Agent
```

`BAIDU_BRTC_LICENSE_DEVICE_ID` 在生产环境中删除。单一批次下 `BAIDU_BRTC_LICENSE_KEY` 可以暂时保留为服务端 Secret；多批次后应改为 License Pool 或密钥管理服务。

### 5.6 每次 AI 使用与重复鉴权

每一条文字、图片或音频消息不需要单独携带 License 三元组。每次新建 WebSocket 连接时执行一次鉴权：

```text
bindingId
-> 原 hardware device
-> 原 activation
-> 原 licenseKey + appId + deviceId
-> MUST / ACTIVE / PASS
```

完全相同的三元组属于重复鉴权，不新增本地额度预占，也不应新增百度激活次数。

### 5.7 用户解绑与设备转移

解绑从硬删除改为软解绑：

```text
device_binding.status = unbound
device_binding.unbound_at = 当前时间
```

解绑后必须继续保留：

```text
hardware_device
hardware_mac
canonical_device_id
device_activation
license_pool_id
百度激活状态和 UUID
```

新用户重新绑定同一台秤时：

```text
MAC 命中原 hardware_device
-> 发现原 activation = active
-> 创建新的 device_binding
-> 复用原三元组
-> 不预占、不扣减新的 License
```

如果原用户尚未解绑，返回“该秤已被绑定，请原账号先解绑”。生产系统还需要管理员核验转移流程，处理原账号丢失、手机号停用等情况。

## 6. 推荐数据模型

### 6.1 `license_pools`

```text
id
customer_id
baidu_license_id
baidu_app_id
license_key_secret_ref
purchased_count
reserved_count
activated_count
valid_from
valid_until
status
```

### 6.2 `hardware_devices`

```text
id
hardware_mac            UNIQUE
canonical_device_id     UNIQUE
product_model
batch_no
status
first_seen_at
last_seen_at
```

### 6.3 `device_activations`

```text
id
hardware_device_id
license_pool_id
canonical_device_id
vendor_user_id
vendor_activation_uuid
status
activated_at
expires_at
last_error
```

建议唯一约束：

```text
UNIQUE(license_pool_id, canonical_device_id)
```

### 6.4 `device_bindings`

```text
id
hardware_device_id
user_id
status
bound_at
unbound_at
```

建议使用部分唯一索引，保证一台设备同时只有一个有效绑定。

### 6.5 `activation_events`

记录不可变流水：

```text
CLAIM_REQUESTED
LICENSE_RESERVED
ACTIVE_SENT
BAIDU_PASS
BAIDU_FAILED
ACTIVATION_TIMEOUT
RECONCILED
USER_UNBOUND
DEVICE_TRANSFERRED
```

## 7. 状态机对比

### 7.1 修改前

```text
扫描到设备
-> 保存 devices 行
-> 视为绑定完成

WebSocket 连接
-> 固定 Device ID 激活
-> PASS 或 FAILED 均可能继续业务
```

### 7.2 修改后

```text
discovered
-> protocol_matched
-> identity_verified
-> binding_pending
-> license_reserved
-> activating
-> active
```

异常分支：

```text
协议非法 -> rejected
设备被占用 -> binding_conflict
额度不足 -> license_exhausted
百度 FAILED -> activation_failed
结果不确定 -> reconcile_required
资源过期 -> expired
设备禁用 -> forbidden
```

只有 `active` 状态可以调用 AI 能力。

## 8. 代码影响范围

| 文件或模块 | 当前职责 | 目标改造 | 复杂度 |
|---|---|---|---|
| `src/utils/bleService.ts` | 扫描、解析6字节重量数据 | 解析12字节 V1.1、输出 MAC、按 MAC 过滤广播 | 中 |
| `src/pages/device-add/index.tsx` | 保存平台 `deviceId` | 展示协议匹配设备、调用 `device-claim`、处理冲突 | 中 |
| `src/pages/device-manager/index.tsx` | 探测、硬删除解绑 | 显示 MAC/激活状态、调用软解绑接口 | 中 |
| `src/pages/home/index.tsx` | 加载设备并监听重量 | 使用 `hardwareMac` 定位广播 | 小到中 |
| `src/db/types.ts` | 单一 `Device` 类型 | 增加物理设备、绑定、激活类型 | 中 |
| `src/db/api.ts` | 客户端直接读写 `devices` | 改为调用受控后台接口，减少客户端直接写权限 | 中 |
| `supabase/functions/device-claim` | 当前不存在 | 设备认领、冲突检查、License 预占 | 中 |
| `supabase/functions/device-unbind` | 当前不存在 | 软解绑与转移控制 | 中 |
| `supabase/functions/ws-sign/index.ts` | 登录后直接创建 Agent | 增加 `bindingId` 门禁并动态解析激活参数 | 中 |
| `src/services/aiWebSocket.ts` | License 握手但允许失败降级 | 强制 PASS、删除随机 Device ID 兜底 | 小但关键 |
| Supabase migrations | 单一 `devices` 表 | 增加设备、绑定、激活、事件和约束 | 中 |
| 后台对账任务 | 当前不存在 | 查询百度激活设备并核对状态、数量 | 中 |

不需要重写的模块：

```text
称重数值计算
食材录入
拍照上传与识图业务
聊天消息组织
Default Agent 配置内容
百度文本、图片、音频消息格式
```

## 9. 兼容与迁移策略

### 9.1 V1.0 旧设备

V1.0 广播只有 6 字节测量数据，没有 MAC：

```text
重量功能可以继续兼容
设备绑定和 License 激活必须提示固件不支持
```

禁止继续使用手机平台 UUID 或随机值作为生产 Device ID。

### 9.2 当前测试绑定记录

现有 `devices.device_id` 可能是 iOS UUID 或 Android 平台标识，无法自动可靠转换为广播 MAC。建议测试环境在升级后清理旧绑定并重新扫描绑定，生产数据不得直接迁移为硬件身份。

### 9.3 Device ID 格式锁定

上线前必须一次性确定规范：

```text
输入 MAC：08:BB:D0:20:D6:47
存储 MAC：08bbd020d647
百度 Device ID：scale_08bbd020d647
```

上线后不能改成大写、带冒号或其他前缀，否则百度可能视为新的 Device ID。

## 10. 风险评估

| 风险 | 修改前 | 修改后控制 | 等级 |
|---|---|---|---|
| 多台秤共用固定 Device ID，激活少算 | 存在 | 每台秤使用广播 MAC 生成 Device ID | P0 |
| 同一秤因平台 UUID 变化而重复激活 | 存在 | 只使用广播 MAC | P0 |
| License FAILED 仍可使用 AI | 存在 | fail closed，必须 PASS | P0 |
| 解绑后丢失激活记录并重复扣费 | 接入后必然出现 | 软解绑，保留 activation | P0 |
| 两个账号同时抢一台秤 | 缺少全局约束 | 事务和唯一索引 | P0 |
| 非法 BLE 广播消耗 License | 名称筛选较弱 | 协议过滤、MAC 白名单、后台门禁 | P1 |
| MAC 被主动复制 | 无防护 | 推荐机身二维码/激活码；后续可增加签名 | P1 |
| 客户端伪造 PASS 上报 | 尚未处理 | 百度 API 对账，异常状态进入 reconcile | P1 |
| License Key 在客户端可见 | 当前直连协议固有限制 | 仅按需返回、不落日志；评估一机一码或服务代理 | P1 |
| 原账号丢失导致设备无法转移 | 无流程 | 管理员核验转移 | P1 |

## 11. 验收标准

### 11.1 协议与设备

1. 至少 10 台 V1.1 样机广播 MAC 均不同。
2. 同一台秤断电、重启、恢复出厂、升级后广播 MAC 不变。
3. Android 和 iPhone 解析出的广播 MAC 完全一致。
4. V1.0、错误长度、错误版本、全零 MAC 不允许激活。
5. 附近存在多台 `Bai` 时，只接收已绑定 MAC 的重量数据。

### 11.2 绑定与激活

1. 新 MAC 首次 `PASS` 后百度激活总数增加 1。
2. 同一设备连续建立 10 次 WebSocket，激活总数不再增加。
3. 两个用户同时认领同一 MAC，只能有一个成功。
4. License 用尽、Key 错误、`FAILED`、超时均不能进入 AI 功能。
5. 缺少 `bindingId` 或绑定不属于当前用户时，`ws-sign` 拒绝请求。

### 11.3 解绑与复用

1. 用户解绑后，物理设备和激活记录仍然存在。
2. 新用户绑定同一 MAC，复用原激活记录，不增加百度激活数。
3. 原用户未解绑时，新用户无法直接绑定。
4. 换手机、重装小程序后，同一 MAC 继续使用原 Device ID。

### 11.4 对账

1. 本地 `active` 数量与百度 `VALID` 激活记录可核对。
2. 保存百度激活 UUID、激活时间、到期时间和状态。
3. 对账差异能够进入人工处理或自动修复队列。

## 12. 分阶段实施建议

### 阶段一：身份基础

1. 完成 V1.1 MAC 解析和协议过滤。
2. 锁定 MAC 和百度 Device ID 规范。
3. 厂商提供样机与量产 MAC 清单。
4. 完成跨平台稳定性测试。

### 阶段二：绑定与数据模型

1. 新增硬件设备、绑定、激活和事件表。
2. 实现 `device-claim`、冲突检查和软解绑。
3. 把设备监听从平台 ID 改为广播 MAC。

### 阶段三：License 门禁

1. `ws-sign` 增加 `bindingId`。
2. 动态返回固定的 License 激活参数。
3. License 握手改为必须 `PASS`。
4. 删除固定和随机 Device ID 方案。

### 阶段四：对账与上线

1. 接入百度激活设备查询 API。
2. 完成并发认领、重复连接、解绑转移测试。
3. 清理测试绑定和测试 Device ID。
4. 分批灰度并监控激活数量。

## 13. 技术评估结论

本次不是 AI 架构重构，而是为现有系统补齐生产级设备身份和 License 生命周期。主要改动集中在 BLE、数据库、设备绑定接口、`ws-sign` 和 License 状态处理，复杂度可控。

不建议只完成“从广播解析 MAC，然后直接替换固定 Device ID”。如果缺少后台全局唯一约束、激活记录、软解绑和失败阻断，仍然会出现重复激活、抢绑定和计费无法对账的问题。

建议把以下内容作为上线门槛：

```text
广播 MAC 稳定
+ 设备后台认领
+ 一台秤一个固定 Device ID
+ ws-sign(bindingId) 门禁
+ PASS 才可用
+ 解绑保留激活
+ 百度激活记录对账
```

满足以上条件后，系统可以形成“一台物理厨房秤只消耗一个 License、账号可解绑转移、后续连接自动复用”的完整闭环。

## 14. 参考资料

- 厨房秤广播协议 V1.1，2026-07-24。
- [百度智能云 License 使用指南](https://cloud.baidu.com/doc/RTC/s/2me89fl3l)
- [百度智能云已激活设备操作 API](https://cloud.baidu.com/doc/RTC/s/omok15jol)
- `src/utils/bleService.ts`
- `src/pages/device-add/index.tsx`
- `src/pages/device-manager/index.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/RouteGuard.tsx`
- `src/services/aiWebSocket.ts`
- `supabase/functions/ws-sign/index.ts`
- `supabase/migrations/00001_initial_health_schema.sql`
