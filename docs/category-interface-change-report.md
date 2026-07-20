# 品类后台接口变动与文档修订报告

生成日期：2026-07-02  
对比基线：Git 初始提交 `8fc1fba7 chore: initial clean snapshot`  
当前版本：当前工作区实际内容，包含当前分支 `codex/rtc-history-tts` 以及未提交修改  
参考文档：

- `/Users/chenpengjian/Downloads/品类接口 — 通用.pdf`
- `/Users/chenpengjian/Downloads/品类接口 — AI 营养秤.pdf`

## 一、结论摘要

当前小程序已经从“本地数据库保存完整聊天会话/消息”的第一版，转向“RTC 直连 + RTC 云端历史”的架构。品类后台接口文档需要重点调整聊天历史、`ws-sign`、音频/TTS、家庭成员/多人就餐、营养统计、图片上传返回结构等接口。

最重要的变动如下：

1. 历史消息不再以 `chat_sessions` / `chat_messages` 作为主读取链路，当前聊天抽屉通过新增 `brtc-history` Edge Function 读取百度 RTC 云端 `dialogues`，再在服务端做分组、过滤和字段归一。
2. `ws-sign` 的协议从“客户端上传 `cfg`，服务端拼 `ak/sk/cfg` 到 WebSocket URL”变成“服务端用 AK/SK 创建默认 AI Agent 实例，返回 `id/token` 形式的 RTC WebSocket URL”。客户端只传 `agentProfile`。
3. 第一版的 `tts-minimax` Edge Function 已删除，TTS 音频现在走 RTC WebSocket 二进制音频流；当前聊天页只把音频写到小程序本地临时文件，不再通过独立 TTS HTTP 接口生成持久 `audioUrl`。
4. 家庭成员模块已修复并强化：有 `user_active_member` 激活成员；当前用餐支持 `selectedMealMemberIds` 多成员选择；营养分析会按选中的成员生成健康档案上下文。
5. 称重/营养记录仍使用 `weighing_records`，但当前实现是给每个选中成员各保存一条记录，并保存“人均”营养值；PDF 文档中写的 `memberIds + childCount/adultCount/elderCount` 模型与当前数据库结构不一致。
6. 当前 PDF 文档以未来品类平台 REST API 为目标，统一返回 `code/message/requestId/data`；当前小程序实际仍是 Supabase SDK 与 Edge Function 原生返回。若要建设品类后台，需要明确“兼容当前小程序”还是“迁移到品类平台统一 REST 包装”。

## 二、代码接口变动清单

### 2.1 WebSocket 签名接口 `ws-sign`

第一版实现：

- 请求体：`{ cfg, mode = "cfg", ac = "raw16k" }`
- `mode !== "default"` 时要求 `cfg`
- 直接返回包含 `ak/sk/cfg` 的 RTC Gateway URL
- 返回体：`{ url, licenseKey, licenseDeviceId }`
- 不校验 Supabase 用户身份

当前实现：

- 请求体：`{ agentProfile?: "chat" | "vision" | "voice-realtime" | "voice-ptt" }`
- 必须携带 Supabase `Authorization`，服务端调用 `/auth/v1/user` 得到当前用户
- 服务端调用百度 RTC `POST /api/v1/aiagent/generateAIAgentCall` 创建默认 Agent
- URL 参数从 `ak/sk/cfg` 变为 `a/id/t/ac`
- 返回体：`{ url, licenseKey, licenseDeviceId, agentProfile, userId }`
- 失败情况包括 `401 Unauthorized`、`400 Missing BRTC credentials`、`400 create default agent failed`

对品类后台的影响：

- 文档中的 `cfg` 不应再作为客户端必填字段。
- 文档中的 `data.wsUrl` 字段要么改为当前客户端实际字段 `url`，要么后台适配一层 `{ data: { wsUrl } }` 并同步改客户端。
- `userId` 不应由客户端请求体传入，应从 Bearer token 解析，避免伪造。
- 应新增 `agentProfile` 或等价字段，用于区分文本、视觉、实时语音、按住说话等场景。

建议 REST 版接口：

```json
POST /api/category-apps/{appId}/ws-sign
Authorization: Bearer {token}

{
  "agentProfile": "chat"
}
```

建议响应：

```json
{
  "code": 0,
  "message": "success",
  "requestId": "...",
  "data": {
    "wsUrl": "wss://rtc-aiotgw.exp.bcelive.com/v1/realtime?a=...&id=...&t=...&ac=raw16k",
    "licenseKey": "...",
    "licenseDeviceId": "...",
    "agentProfile": "chat"
  }
}
```

### 2.2 新增 RTC 云端历史接口 `brtc-history`

第一版：无该接口，聊天历史通过本地表读取：

- `getChatSessions(userId)`
- `getChatMessages(sessionId)`
- `createChatSession`
- `createChatMessage`
- `deleteChatSession`
- `deleteMultipleChatSessions`

当前实现：

- 新增 Supabase Edge Function：`brtc-history`
- 客户端调用：`supabase.functions.invoke("brtc-history", { body })`
- 请求体：`{ beginTime?, endTime?, pageNo?, pageSize? }`
- 默认查询最近 30 天，默认 `pageSize = 100`
- 服务端代理百度 RTC `GET /api/v1/dialogues`
- 服务端用当前 Supabase 用户 ID 作为 RTC `userId`
- 对 `QUESTION` / `ANSWER` 归一为 `user` / `assistant`
- 过滤内部 prompt、图片识别触发语、营养分析 prompt 等不应展示给用户的内容
- 超过 30 分钟的消息拆成不同历史组
- 最多返回 10 组历史

当前返回体：

```json
{
  "pageNo": 1,
  "pageSize": 100,
  "source": "baidu-rtc-dialogues",
  "groupGapSeconds": 1800,
  "historyLimit": 10,
  "groups": [
    {
      "id": "rtc-1762758368-1762758370",
      "title": "这个鸡蛋有多少卡路里？",
      "startTime": 1762758368,
      "endTime": 1762758370,
      "messages": [
        {"role": "user", "content": "这个鸡蛋有多少卡路里？", "timestamp": 1762758368},
        {"role": "assistant", "content": "一个中等大小的鸡蛋约含 72 大卡...", "timestamp": 1762758370}
      ]
    }
  ]
}
```

对品类后台的影响：

- PDF 通用文档的“对话记录”当前返回 RTC 原始 `data[]`，但小程序当前需要的是分组后的 `groups[]`。
- AI 营养秤文档中的 `/scale/chat-messages` 应改为“已废弃/仅兼容旧本地历史”，或改成代理 RTC 云端历史。
- 当前 RTC 云端历史不能保留图片 URL，也不能保留本地临时语音文件；如果后台需要完整图文语音历史，需要设计单独的业务历史表。

建议 REST 版接口：

```text
GET /api/category-apps/{appId}/users/me/dialogue-groups?beginTime=&endTime=&pageNo=&pageSize=
```

建议响应中使用当前小程序需要的 `groups`，而不是只透出 RTC 原始 `data`。

### 2.3 删除独立 TTS HTTP 接口

第一版存在 `supabase/functions/tts-minimax/index.ts`，虽然文件名叫 `tts-minimax`，实现实际是百度 TTS：

- 请求体：`{ text, voice_id, speed, pit, vol }`
- 返回：`{ audioUrl }`
- 生成音频上传到 `generated-audio` bucket

当前版本：

- `tts-minimax` 文件已删除
- `generated-audio` bucket 迁移仍保留，但主链路不再使用该 HTTP TTS EF
- TTS 由 RTC WebSocket 返回二进制音频流
- 聊天页将音频流写成本地 `wav/mp3` 临时文件，并作为当前页面消息的 `audio_url`

对品类后台的影响：

- 通用 PDF 中“音色切换”仍可以保留为未来配置接口，但需要说明：TTS 音色生效点在 `ws-sign` 创建 Agent 时，而不是独立 TTS 合成接口。
- 如 B 端需要历史语音回放，需新增“上传/持久化 RTC TTS 音频”的接口；当前实现没有持久化。

### 2.4 家庭成员与激活成员接口

第一版已经有 `family_members` 与 `user_active_member`，当前版本主要修复使用链路：

- `refreshMembers` 会在激活成员不存在时回退到主成员或第一个成员，并写回 `user_active_member`
- `selectedMealMemberIds` 会过滤无效成员 ID
- 当前用餐成员为空时默认选中当前激活成员
- 家庭健康上下文从单人 `buildHealthContext` 扩展为多人 `buildFamilyHealthContext`

当前数据模型：

- 表：`family_members`
- 字段：`id, user_id, nickname, avatar_url, gender, age, height, weight, birthday, blood_type, chronic_diseases, allergens, medications, daily_calorie_goal, daily_protein_goal, daily_fat_goal, daily_carb_goal, is_primary, created_at, updated_at`
- 激活成员表：`user_active_member(user_id, member_id, updated_at)`

对品类后台的影响：

- AI 营养秤 PDF 已覆盖家庭成员 CRUD，但缺少“获取/设置当前激活成员”接口。
- PDF 中 `medications` 写成 array，当前数据库和类型是 `string | null`。
- PDF 中 `bloodType` 只列 `A/B/AB/O`，当前还支持 `other`。
- 删除成员文档写“主用户不可删除”，当前 `deleteFamilyMember(id)` 并无前端/接口层保护，若后台需要该规则，应在服务端强制。

建议补充：

```text
GET /api/category-apps/{appId}/scale/members/active
PUT /api/category-apps/{appId}/scale/members/active
```

请求体：

```json
{"memberId": "member_001"}
```

### 2.5 称重记录与营养统计

第一版/当前数据库模型：

- 表：`weighing_records`
- 字段：`id, user_id, member_id, ingredients, person_count, analysis_result, total_calories, protein, fat, carbs, created_at`
- 一条记录只能关联一个 `member_id`

当前页面行为：

- 用户可选择多个用餐成员
- AI 分析 prompt 按选中成员生成多人健康档案
- AI 返回整餐营养 JSON 后，小程序除以用餐人数，得到“人均”营养值
- 对每个选中的成员分别调用 `createWeighingRecord`
- 因此统计页按 `member_id` 查询时，看到的是该成员人均摄入数据

PDF 当前写法：

- 保存称重记录请求体包含 `childCount/adultCount/elderCount/memberIds`
- 查询记录响应包含 `memberIds` 与 `hasAnalysis`
- 营养统计写“按 memberIds 分摊”

不一致点：

- 当前数据库没有 `memberIds`、`childCount`、`adultCount`、`elderCount`、`hasAnalysis` 字段。
- 当前没有“先保存称重记录，再 POST /analysis 关联分析”的两步接口；实际是在分析完成后一次性 `insert weighing_records`。
- 当前没有单独 `GET /weighing-records/{recordId}/analysis`。
- 当前 `getNutritionStats` 返回的是按日数组：`[{ date, total_calories, protein, fat, carbs, records_count }]`，不是 PDF 中的总览对象。

建议二选一：

1. 保持当前数据库模型：文档改为“每个成员一条记录，营养值已为人均值”，去掉 `memberIds/childCount/adultCount/elderCount`。
2. 升级后台模型：新增 `meal_records` 主表和 `meal_record_members` 关联表，保留整餐总量和成员分摊明细，再让接口按 PDF 模型实现。

如果要建设长期品类后台，建议选择方案 2。当前 Supabase 表可以作为迁移输入，但不建议继续把多人就餐压成多条独立 `weighing_records`，否则无法准确还原“同一餐”的整体记录。

### 2.6 图片上传接口

当前实现：

- Edge Function：`upload-food-image`
- 请求体：`{ image, ext = "jpg" }`
- 不要求 `userId`
- 使用 service role 上传到 `chat-images/food-images/...`
- 返回：`{ url }`
- 错误：`{ error }`

PDF 当前写法：

- 请求体包含 `userId`
- 返回统一包装 `{ code, message, requestId, data: { url } }`
- 说明 URL 用于 `chat-messages.imageUrl`

需要修改：

- 用户身份应来自 Bearer token，不建议从请求体传 `userId`。
- 如果继续走 Supabase EF，需要把文档返回体改为 `{ url }`；如果建设品类 REST 层，则后台可包装成 `data.url`。
- 由于当前聊天历史改走 RTC 云端，图片 URL 不会进入 RTC 云端历史；文档中“用于 chat-messages 的 imageUrl 字段”需要改成“仅用于当前会话展示/业务历史表持久化”。如果要历史回看图片，需要新增业务历史存储。

### 2.7 微信登录接口

当前实现：

- Edge Function：`wechat_miniapp_login`
- 请求体：`{ code }`
- 返回：`{ token, openid }`
- 客户端拿 `token` 调 Supabase `verifyOtp({ token_hash, type: "magiclink" })`

PDF 当前写法：

- 路径：`/api/category-apps/{appId}/auth/wechat-login`
- 返回：`{ userId, token, isNewUser }`

需要修改：

- 如果品类后台替代 Supabase Auth，需返回可直接作为 Bearer 使用的业务 JWT。
- 如果继续兼容当前小程序，应明确 `token` 是 Supabase magiclink `hashed_token`，不是最终 session access token。
- 建议新增 `openid` 和 `isNewUser`，但当前 EF 不返回 `isNewUser`。

### 2.8 设备管理接口

当前实现：

- 设备表：`devices`
- 小程序使用 `upsertDevice/getDevices/deleteDevice`
- 字段：`device_id, device_name, device_model, service_uuid, is_connected, battery_level`
- 无品类 license 消耗、无 bindToken、无 bind-status、无 OTA

PDF 当前写法：

- 通用文档包含设备绑定、绑定状态查询、设备列表、解绑、OTA 固件管理
- 绑定时消耗 license
- 设备有 `categoryId/categoryName/bindToken/licenseKey`

需要修改：

- 对 AI 营养秤当前版本，应标注为 BLE 本地绑定，不涉及 IoT 绑定状态轮询和 OTA。
- 如果未来品类平台统一设备后台，需要补齐数据库字段：`category_id, bind_token, bind_at, license_key/license_status, firmware_version` 等。
- 当前 `deviceId` 在数据库中叫 `device_id`，响应文档用 `deviceId`，需要网关做字段映射。

## 三、PDF 接口文档修订建议

### 3.1 《品类接口 — 通用.pdf》

建议修改项：

| 章节 | 当前问题 | 建议 |
| --- | --- | --- |
| 1.1 WebSocket 签名 URL | `cfg` 必填，响应字段是 `data.wsUrl`，URL 示例含 `ak/sk/sign/cfg` | 改为 `agentProfile`；后台内部 `generateAIAgentCall`；URL 示例改为 `a/id/t/ac`；明确用户从 token 解析 |
| 1.2 ws-disconnect | 当前小程序没有调用该接口 | 标注“后台规划接口，当前小程序未接入”；若要资源清理，需要客户端补调用或服务端根据 RTC 生命周期清理 |
| 1.3 创建互动实例 | 描述方向正确，但应与当前 `ws-sign` 合并 | 明确实例创建发生在 `ws-sign` 内，失败码包含创建 Agent 失败 |
| 2 角色管理 | 当前无角色列表/切换接口，`ws-sign` 使用 env 默认角色 | 标注未实现；若要支持，需落用户偏好并传入 Agent config |
| 3 音色 | 当前无音色列表/切换接口，TTS 走 RTC WebSocket | 标注未实现；音色需在创建 Agent 时配置，不是独立合成 |
| 4 用户管理 | 当前主要使用 Supabase Auth，微信 EF 返回 magiclink token | 区分“当前 Supabase 兼容模式”和“未来品类 JWT 模式” |
| 4.5 地区上报 | 当前未实现 | 标注待实现或移出 MVP |
| 4.7 用户偏好 | 当前未实现 | 建议新增 `user_preferences` 表，或先标注待实现 |
| 5 对话记录 | 当前文档返回 RTC 原始 `data[]`，小程序需要分组 `groups[]` | 改为分组历史接口，或新增 `dialogue-groups` |
| 6 维护接口 | 清画像、清上下文、声纹均未实现 | 标注 B 端后台二期接口 |
| 7 品类查询 | 当前未实现 | 若只有营养秤 MVP，可暂不放在小程序必需接口 |
| 8 设备管理 | 文档是通用 IoT/License 绑定模型，当前营养秤是 BLE 本地设备表 | 拆成“BLE 简化绑定”和“WiFi/IoT 品类绑定” |
| 9 OTA | 当前未实现 | 放入平台后续规划，不应作为当前小程序必需接口 |

### 3.2 《品类接口 — AI 营养秤.pdf》

建议修改项：

| 章节 | 当前问题 | 建议 |
| --- | --- | --- |
| 1.1 图片上传 | 请求体有 `userId`；说明写入 `chat-messages.imageUrl` | 用户从 token 解析；说明 RTC 云端历史不保存图片，若需历史回看需业务历史表 |
| 1.2 家庭成员 | 缺少激活成员接口；`medications` 类型与当前实现不一致 | 补 `active member`；`medications` 改 string 或后台做 array/string 映射 |
| 1.2.4 删除家庭成员 | 文档写主用户不可删除，当前服务层未强制 | 后台必须强制 `is_primary` 不可删，或文档去掉该承诺 |
| 1.3 称重记录 | 文档使用 `memberIds + 人群计数`，当前表只有 `member_id + person_count` | 长期建议改表支持主餐记录与成员关联；短期文档改为每成员一条记录 |
| 1.4 营养分析结果 | 文档写保存称重和保存分析两步，当前一次性保存 | 若后台重构可保留两步；兼容当前小程序应改为一次提交 |
| 1.5 营养统计 | 文档返回总览对象，当前 `getNutritionStats` 返回按日数组 | 增加 daily 明细接口，或改当前统计接口响应 |
| 1.6 对话消息 | 文档仍写全局 `chat-messages` 本地历史 | 改成“RTC 云端历史”；本地 `chat_messages` 标为旧接口/兼容接口 |
| 数据模型 | 文档列 `chat_messages.userId`，当前表是 `chat_messages.session_id` 关联 `chat_sessions.user_id` | 修正模型，或在后台新建真正的全局消息表 |
| 已移除接口 | 食材识别/营养分析/AI 对话/ASR 已正确标注走 WebSocket | 继续补充：TTS 也已从 HTTP EF 移到 RTC WebSocket |

## 四、建议的目标接口分层

为了让品类后台既能承接当前小程序，又能长期扩展，建议接口分三层：

### 4.1 当前必须实现/适配

这些是当前小程序真实依赖：

- `POST /ws-sign`：创建 RTC Agent 并返回 WebSocket URL
- `GET /dialogue-groups`：代理 RTC 云端历史并返回分组结果
- `POST /scale/upload-image`：上传食物图片
- 微信登录：返回可换取/代表登录态的 token
- 家庭成员 CRUD
- 获取/设置激活成员
- 设备简化绑定/列表/删除
- 称重记录创建/查询
- 营养统计按日聚合
- 提醒设置读取/更新
- 用户档案读取/更新

### 4.2 当前代码保留但已不是主链路

- `chat_sessions`
- `chat_messages`
- `getChatSessions/getChatMessages/createChatMessage`
- `deleteMultipleChatSessions/deleteChatSession`

这些可以作为兼容旧数据、调试或迁移用，但不要再作为“当前聊天历史”的主接口来设计。

### 4.3 后台规划接口

- 角色列表/切换
- 音色列表/切换
- 用户偏好
- 地区上报
- 清画像/清上下文
- 声纹注册/删除/列表
- 品类查询
- IoT/WiFi 设备绑定状态轮询
- OTA 固件管理

这些接口 PDF 可以保留，但应标注“当前小程序未接入/后台二期”。

## 五、推荐的数据模型调整

如果品类后台要长期服务多人就餐和统计，建议从当前 `weighing_records` 单表升级为如下结构：

```text
meal_records
- id
- user_id
- ingredients
- person_count
- analysis_result
- total_calories
- protein
- fat
- carbs
- created_at

meal_record_members
- id
- meal_record_id
- member_id
- allocated_calories
- allocated_protein
- allocated_fat
- allocated_carbs
```

这样既能保留整餐总量，也能准确查询每个家庭成员的分摊摄入，不需要把同一餐拆成多条互不关联的 `weighing_records`。

## 六、字段命名统一建议

当前代码/Supabase 表大量使用 snake_case，PDF 使用 camelCase。品类后台可以统一对外 camelCase，对内 snake_case，但文档必须明确映射：

| 对外字段 | 当前内部字段 |
| --- | --- |
| userId | user_id |
| memberId | member_id / id |
| avatarUrl | avatar_url |
| bloodType | blood_type |
| chronicDiseases | chronic_diseases |
| dailyCalorieGoal | daily_calorie_goal |
| deviceId | device_id |
| deviceName | device_name |
| serviceUuid | service_uuid |
| isConnected | is_connected |
| batteryLevel | battery_level |
| totalCalories | total_calories |
| recordsCount | records_count |
| imageUrl | image_url |
| createdAt | created_at |
| updatedAt | updated_at |

## 七、优先级建议

P0，必须马上修文档，否则会对接错：

- `ws-sign` 请求/响应
- RTC 云端历史替代 `/scale/chat-messages`
- 图片上传是否保存到历史
- 称重记录 `memberIds` 与当前 `member_id` 模型冲突
- 微信登录 token 语义

P1，建议随后台第一版补齐：

- 激活家庭成员接口
- 多人就餐的数据模型
- 营养统计响应结构
- 设备 BLE 简化绑定接口
- 统一错误码与统一响应包装

P2，后续能力：

- 角色/音色/用户偏好
- 地区上报
- 声纹与维护接口
- 品类查询
- OTA

## 八、当前真实接口对照表

| 能力 | 当前代码入口 | 当前返回 | PDF 状态 | 建议 |
| --- | --- | --- | --- | --- |
| 微信登录 | `wechat_miniapp_login` | `{token, openid}` | 写 `{userId, token, isNewUser}` | 修正 token 语义，补 `openid/isNewUser` 或后台适配 |
| WS 签名 | `ws-sign` | `{url, licenseKey, licenseDeviceId, agentProfile, userId}` | 写 `data.wsUrl` 和 `cfg` | 改 `agentProfile` + `wsUrl` |
| RTC 历史 | `brtc-history` | `{pageNo,pageSize,source,groupGapSeconds,historyLimit,groups}` | 通用写原始 `data[]`，营养秤写 `chat-messages` | 改成分组历史 |
| 图片上传 | `upload-food-image` | `{url}` | 写统一包装，且带 `userId` | token 解析用户，按目标平台包装 |
| 家庭成员 | Supabase `family_members` | snake_case 行数据 | camelCase REST | 后台做字段映射，补 active member |
| 称重记录 | Supabase `weighing_records` | 单成员记录 | `memberIds + 人群计数` | 改模型或改文档 |
| 营养统计 | `getNutritionStats` | daily array | total summary object | 明确 summary 和 daily 两类接口 |
| 对话本地表 | `chat_sessions/chat_messages` | 仍有函数，聊天页不主用 | 营养秤主文档仍主推 | 标旧接口/迁移接口 |
| TTS | RTC WebSocket audio | 本地临时音频文件 | 音色接口存在，未说明音频历史 | 补 TTS 架构说明 |
| 设备管理 | Supabase `devices` | BLE 简化绑定 | 通用 license/IoT/OTA 模型 | 拆 BLE MVP 与平台完整设备管理 |

## 九、验收建议

后台接口文档修订后，建议用当前小程序的真实调用链做一次验收：

1. 微信登录后拿到有效 Supabase/品类 token。
2. 进入聊天页，`ws-sign` 用 `agentProfile=chat` 成功返回 URL。
3. 发送文本，RTC 返回文本和 TTS 音频流。
4. 上传图片，图片 URL 能用于当前会话展示；若要求历史回看，确认业务历史表已保存。
5. 打开历史抽屉，`dialogue-groups` 能从 RTC 云端历史返回分组消息。
6. 新增/编辑/删除家庭成员后，激活成员和用餐成员仍有效。
7. 多成员营养分析后，统计页能按成员展示人均摄入趋势。

