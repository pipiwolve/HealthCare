# 厨房秤 Device ID 与 License 激活闭环研究

> 研究日期：2026-07-23  
> 范围：厨房秤 BLE 广播协议、微信小程序/Taro 设备标识、百度大模型实时互动 License、当前项目实现

## 1. 执行结论

1. **“一台物理秤只消耗一个 License”这个方向正确。** 百度侧按 `licenseKey + appId + deviceId` 唯一确认一次激活；首次激活消耗一次额度，后续连接使用同一组标识只做鉴权。
2. **不能直接把当前小程序扫描结果里的 `deviceId` 当作跨平台、长期稳定的 MAC。** Taro 只承诺它是“用于区分设备的 id”；iOS CoreBluetooth 使用系统分配 UUID；BLE 设备地址还可能是随机地址或隐私地址。
3. **当前《厨房秤广播协议0612》没有在 ManufacturerData 中携带设备唯一序列号。** 示例广播数据只有 Flags、6 字节厂商数据和名称 `Bai`。PDF 页面显示的 `08:B8:D0:20:D6:47` 不在 Raw data 内，是扫描器从链路层/扫描元数据展示的地址。
4. **交付前最稳妥的方案是让硬件在广播 ManufacturerData 中增加出厂烧录、永久不变的 `hardware_uid`，把它作为百度 `devId` 和自有激活表的唯一键。** 平台 `deviceId` 仅用于本机扫描/监听，不参与计费主键。
5. **当前代码尚未形成真实计费闭环，且存在 P0 风险：** 所有客户端从 `ws-sign` 获得同一个环境级 `licenseDeviceId`；License 失败被前端“降级放行”；数据库没有 License 资源池和激活流水；设备唯一约束只是 `(user_id, device_id)`。

## 2. 协议核对

PDF 示例：

```text
设备地址（扫描器单独显示）: 08:B8:D0:20:D6:47
Raw data: 02 01 04 07 FF B0 7C 00 00 CE 01 04 09 42 61 69
```

解析：

```text
02 01 04                    Flags
07 FF B0 7C 00 00 CE 01     ManufacturerData，6 字节 Value
04 09 42 61 69              Complete Local Name = "Bai"
```

当前 6 字节厂商数据：

| 偏移 | 字段 | 说明 |
|---|---|---|
| 0 | `0xB0` | 版本/识别码 |
| 1 | 流水号 | 递增，不是设备唯一号 |
| 2-4 | 重量 | Uint24 大端 |
| 5 | 属性 | 符号、单位、小数位、稳定状态 |

结论：当前广播业务负载中不存在 MAC、SN、芯片 UID 或其他可作为永久设备主键的字段。

## 3. 当前项目里已经存在的接口/文档

### 3.1 BLE 扫描与广播解析

- `src/utils/bleService.ts`
  - `Taro.onBluetoothDeviceFound` 获取 `deviceId`、`advertisData`。
  - `BLEDevice.deviceId` 被用于扫描去重、绑定和后续监听。
  - ManufacturerData 只解析 6 字节重量协议。
  - 代码已经写明需要用设备名 `Bai` 兼容“MAC 随机化/平台格式差异”，这反向证明当前 `deviceId` 并不被实现视为可靠硬件主键。

### 3.2 用户绑定设备

- `src/pages/device-add/index.tsx`
  - 保存时直接把 `selectedDevice.deviceId` 写入 `devices.device_id`。
  - 没有调用 License 激活服务，也没有额度检查。
- `src/db/api.ts`
  - `upsertDevice(..., onConflict: 'user_id,device_id')`。
- `supabase/migrations/00001_initial_health_schema.sql`
  - 唯一约束为 `UNIQUE(user_id, device_id)`，同一标识可以被不同用户重复绑定。

### 3.3 百度 License 握手

- `docs/websocket-api-migration-report.md`
  - 已记录 `[E]:[LIC]:[MUST]`、`[E]:[LIC]:[ACTIVE]`、`[E]:[LIC]:[RES]` 流程。
- `supabase/functions/ws-sign/index.ts`
  - 从环境变量读取一个全局 `BAIDU_BRTC_LICENSE_DEVICE_ID`，向所有客户端返回同一个 `licenseDeviceId`。
- `src/services/aiWebSocket.ts`
  - 用 `licenseDeviceId` 发送 `{ devId, uId, licKey }`。
  - 没有 devId 时用 `miniapp-${Date.now()}`，会制造大量不同激活标识。
  - 收到 `FAILED` 或发送失败时仍将 `licensePassed = true`，与百度官方“失败后终止对话”的语义冲突。

## 4. 为什么不建议直接用小程序 `deviceId`/MAC 计费

1. Taro 文档只定义 `deviceId` 为区分设备的 ID，没有承诺它是 MAC，也没有承诺跨手机/跨系统一致。
2. iOS CoreBluetooth 为发现的 Peer 分配 UUID，应用层通常拿不到蓝牙 MAC。
3. Android 原生层可以返回蓝牙地址，但地址类型可能是 Public、Random、Anonymous 或 Unknown；获取真正 Identity Address 的新 API还需要特权权限，不适用于普通微信小程序。
4. BLE 规范允许静态随机地址在断电后重新生成，也允许 Resolvable/Non-resolvable Private Address，因此“看起来像 MAC 的 48 位地址”不天然等于永久设备序列号。
5. 当前 PDF 中的 MAC 不在 ManufacturerData；即使某个安卓扫描工具显示它，也不能推导微信 iOS 和安卓都会返回同一值。

## 5. 推荐标识策略

### 5.1 主标识

硬件固件新增：

```text
hardware_uid: 8-16 bytes，出厂烧录、全局唯一、终身不变
```

建议广播载荷：

```text
version | sequence | hardware_uid | weight | attributes
```

当前 Legacy Advertising 数据只有约 16 字节，仍有空间扩展 8 字节 UID。升级协议版本后，旧 App 可继续按版本兼容解析。

推荐规范化百度 `devId`：

```text
scale:<产品型号>:<hardware_uid_hex>
```

不要使用：用户账号、手机 ID、小程序本地存储 ID、时间戳、设备名称、RSSI。

### 5.2 次级观测标识

保存但不计费：

- `platform_device_id`：当前手机/平台返回的 `deviceId`，用于本机监听。
- `observed_ble_address`：若安卓可见则保存为诊断信息，不作为唯一主键。
- `advertisement_fingerprint`：协议版本、型号等，用于风控。

## 6. 推荐数据模型

### `license_pools`

- `id`
- `customer_id/order_id`
- `baidu_license_id`
- `baidu_license_key_secret_ref`
- `baidu_app_id`
- `purchased_count`
- `reserved_count`
- `activated_count`
- `valid_from/valid_until`

### `hardware_devices`

- `id`
- `hardware_uid`，全局唯一
- `product_model`
- `batch_no`
- `status`
- `first_seen_at/last_seen_at`

### `device_activations`

- `id`
- `hardware_device_id`，全局唯一或按 License/App 唯一
- `license_pool_id`
- `vendor_device_id`
- `vendor_user_id`，建议使用稳定的激活记录 ID，而不是可变化的登录账号
- `status`: `reserved/activating/active/failed/forbidden/expired`
- `activated_at/expires_at`
- `vendor_activation_uuid`
- `last_error`

### `device_bindings`

- `id`
- `hardware_device_id`
- `user_id`
- `status`
- `bound_at/unbound_at`
- 同一设备默认只允许一个有效账号绑定

### `activation_events`

记录申请、额度预占、百度 PASS/FAILED、解绑、禁用、后台对账等不可变流水。

## 7. 推荐接口闭环

### 首次绑定

```text
App 扫描 -> 解析 hardware_uid
POST /device-activations/claim
  body: hardware_uid + platform_device_id + advertisement
Backend:
  1. 校验登录用户和设备合法性
  2. 查找已有激活，保证幂等
  3. 新设备时原子锁定额度并创建 reserved 记录
  4. 建立账号绑定
  5. 返回服务端签发的 binding_id/activation_token
```

### 建立 AI WebSocket

```text
POST /ws-sign { binding_id }
Backend:
  1. 从数据库读取有效绑定和激活状态
  2. 只返回服务端认定的 canonical vendor_device_id
  3. 不接受前端任意传入 devId 覆盖
Client:
  收到 [E]:[LIC]:[MUST]
  发送 [E]:[LIC]:[ACTIVE]:{devId,uId,licKey}
  PASS 才进入可用状态；FAILED 必须阻断
```

同一 `licenseKey + appId + deviceId` 后续每次连接只重新鉴权，不重复消耗激活次数。

### 后续问答/识图

- 不需要每条问题都重新“扣一次 License”。
- 每次创建 WebSocket 时用同一个 canonical `deviceId` 完成鉴权。
- 业务 HTTP 请求建议带服务端签发的 `binding_id` 或短期 token，不直接信任前端传来的 MAC/UID。

### 解绑

必须分离两个概念：

- **账号解绑**：解除用户与物理秤关系。
- **License 激活**：百度侧已经消耗的设备激活记录。

普通用户解绑不应自动把额度加回。当前百度公开文档只明确了激活查询/扩展接口，不能假定删除本地绑定即可退还激活次数。重新绑定同一硬件 UID 时应复用原激活记录。

## 8. 百度侧对账

百度提供“已激活设备操作 API”，可按 `licenseId + appId` 查询：

- 激活记录 UUID
- 脱敏 deviceId
- userId
- activationTime / expirationTime
- VALID / FORBIDDEN / INVALID 状态
- totalCount

建议每天定时拉取并与本地 `device_activations` 对账；交付验收时至少做一次全量核对。

## 9. 交付前 P0 清单

1. 硬件方确认地址类型和稳定性，并优先提供广播内永久 `hardware_uid`。
2. 删除全局固定 `BAIDU_BRTC_LICENSE_DEVICE_ID` 方案，改为每台物理秤的 canonical devId。
3. 删除 `miniapp-${Date.now()}` 激活兜底。
4. License FAILED/发送失败必须 fail closed，禁止继续 AI 对话。
5. 增加 License 资源池、激活记录、绑定记录和事件流水。
6. `ws-sign` 服务端按登录用户的有效绑定返回 devId，不接受前端自报。
7. 增加百度激活设备 API 对账任务。
8. 做跨平台稳定性测试和重复激活测试。

## 10. 最小验收测试

- 3 台秤 × 2 台 Android × 2 台 iPhone。
- 每台秤执行：冷启动、断电重启、微信重启、小程序删除重装、手机重启。
- 记录并比较：`deviceId`、ManufacturerData、扫描工具地址、`hardware_uid`。
- 同一 canonical devId 连续激活 10 次，百度 `totalCount` 只增加 1。
- 改变 devId 后再次激活，`totalCount` 增加 1。
- License 用尽或传入错误 key 时，客户端必须不可继续问答/识图。
- 解绑再绑定同一硬件 UID，不增加激活数。
- 两个账号抢占同一硬件 UID，后端只能保留一个有效绑定或走明确转移流程。

## 11. 核查依据

### 项目与协议

- `厨房秤广播协议0612 [只读].pdf`
- `src/utils/bleService.ts`
- `src/pages/device-add/index.tsx`
- `src/db/api.ts`
- `supabase/migrations/00001_initial_health_schema.sql`
- `supabase/functions/ws-sign/index.ts`
- `src/services/aiWebSocket.ts`
- `docs/websocket-api-migration-report.md`

### 官方文档

- 百度智能云《License 使用指南》：https://cloud.baidu.com/doc/RTC/s/2me89fl3l
- 百度智能云《已激活设备操作 API》：https://cloud.baidu.com/doc/RTC/s/omok15jol
- Taro `onBluetoothDeviceFound`：https://docs.taro.zone/docs/apis/device/bluetooth/onBluetoothDeviceFound
- Apple `CBPeripheral.identifier`：https://developer.apple.com/documentation/corebluetooth/cbperipheral/identifier
- Android `BluetoothDevice`：https://developer.android.com/reference/android/bluetooth/BluetoothDevice
- Bluetooth Core Specification：设备地址与隐私地址章节
