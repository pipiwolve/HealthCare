# 云端 Agent 指令：受控部署与全链路验证

## 前置条件

只有在增量补丁应用和全部静态检查通过、且用户另行明确授权生产变更后，才执行本指令。先阅读仓库中的 `docs/wechat-feature-deployment.md`。

本指令不携带任何环境变量值。必须使用云端当前目标项目已经配置的生产值，或由用户通过 Supabase Secrets/云平台 Secret 管理器单独注入。不得把 Secret 回显到日志、聊天或仓库。

## 1. 确认真实目标环境

只读确认当前云端仓库对应的生产 Supabase project ref、生产代理域名和小程序构建环境。不得使用本地项目 hostname，不得把其他 Supabase 项目的 URL、anon key 或 linked-project 配置迁移过来。

输出时只报告 project ref/域名是否匹配和变量名是否存在，不显示变量值。至少核对：

- 客户端：`TARO_APP_SUPABASE_URL`、`TARO_APP_SUPABASE_ANON_KEY`、`TARO_APP_APP_ID`、`TARO_APP_SHOW_PRIVACY_SCOPE_MODAL`
- 既有 Edge Functions：Supabase URL/anon/service-role、百度 BRTC/ASR/Qianfan 所需变量
- 本次新增：`WECHAT_MINIPROGRAM_LOGIN_APP_ID`、`WECHAT_MINIPROGRAM_LOGIN_APP_SECRET`、`WECHAT_LOGIN_TICKET_SECRET`、`WECHAT_SUBSCRIBE_TEMPLATES_JSON`、`WECHAT_NOTIFICATION_DISPATCH_SECRET`

不得覆盖当前已能工作的百度 BRTC Secrets。`WECHAT_LOGIN_TICKET_SECRET` 与 `WECHAT_NOTIFICATION_DISPATCH_SECRET` 必须是两个独立随机值。

## 2. 数据库只读预检与迁移

先备份生产 schema，并只读执行：

```sql
select openid, count(*)
from public.profiles
where openid is not null
group by openid
having count(*) > 1;
```

结果非零时停止，不执行迁移。结果为零且用户已明确授权后，只执行：

```text
supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql
```

不要重放 `00000_complete_supabase_import.sql`，也不要用 `supabase/schema.sql` 覆盖生产数据库。迁移后核对新增表、索引、RLS、函数、`avatars` bucket 与授权；不要删除或改写既有业务表、策略和触发器。

## 3. Edge Functions 部署

在确认 Secrets 已存在后，仅部署本次新增或修改的 5 个函数：

```text
wechat_miniapp_login
upload-avatar
wechat-notification-schedule
wechat-notification-dispatch
recipe-share
```

遵循 `supabase/config.toml` 的 JWT 设置。不要重新部署或回退 `ws-sign`、`brtc-history`、`upload-food-image`；它们继续服务于当前百度 BRTC Default Agent 链路。

部署后逐个检查最新 deployment id 的 Boot/Request 日志。`shutdown (reason: WallClockTime)` 仅表示空闲 worker 回收，不能作为函数失败证据；真正失败必须用同一 request id 对应的 HTTP 状态、异常日志和 BootFailure/InvalidWorkerCreation 判断。

## 4. 通知调度与微信平台

确认四个一次性订阅模板 ID 和字段映射来自当前微信公众平台审核通过的真实模板，四个模板标题不能相同。配置每分钟调用 `wechat-notification-dispatch` 的调度器，请求头使用 Secret 管理器中的 `WECHAT_NOTIFICATION_DISPATCH_SECRET`，不得把值写入脚本或仓库。`wechat-notification-schedule` 只由已登录小程序客户端创建预约任务，不能作为定时器目标。

将当前生产代理 HTTPS 域名按实际调用类型加入微信小程序合法域名：至少核对 `request` 和 `downloadFile`。WebSocket 继续核对当前百度 BRTC `wss` 域名。不要在指令或代码中硬编码某个本地 Supabase hostname。

本地男女默认头像已作为 PNG 打进小程序包，不需要上传到固定 CDN 路径。`avatars` bucket 只用于用户自定义头像上传。

## 5. API 烟测

使用隔离测试账号和测试数据，记录请求路径、HTTP 状态、request id 和关键响应字段；不得记录 token、手机号、openid、图片内容或 Secret。

- `wechat_miniapp_login`：无效 code 失败符合预期；有效 code 可创建/恢复用户；绑定和资料更新要求合法用户态。
- `upload-avatar`：未授权返回 401；授权上传测试头像成功，公开 URL 可下载。
- `wechat-notification-schedule`：错误 dispatch secret 被拒绝；正确 secret 的无到期任务烟测成功且无误发。
- `wechat-notification-dispatch`：由调度流程创建的隔离任务可发送或返回可解释的微信平台错误。
- `recipe-share`：未授权创建被拒绝；授权创建成功；公开 share id 可读取，随机 id 返回 404。

## 6. 小程序真机全量验证

在体验版真机逐项验证，不以开发者工具模拟器替代音频、授权和分享结论：

1. 旧微信用户登录、新用户跳过手机号、新用户授权手机号、已有账号绑定、首登资料与头像上传。
2. 四类一次性提醒授权、到点发送、重复调度幂等和发送后开关自动关闭。
3. 菜谱好友卡片、未登录好友公开打开、海报生成/保存/扫码进入同一菜谱。
4. AI 问答继续创建具备图像能力的百度 BRTC Default Agent，不切换旧接口；文本回答可正常流式输出。
5. 流式回复过程中音频按序边收边播，无重叠、跳帧或尾帧丢失；回复完成后“朗读”按钮可以从头重播已收集音频，并验证暂停、再次点击和页面退出时资源释放。
6. 统计页切换家庭成员后重新查询对应成员数据，不串用上一个成员结果。

音频失败时按同一会话时间线收集以下非敏感日志：WebSocket 连接/事件类型、PCM chunk 序号与字节数、队列长度、播放器状态回调、临时文件写入结果、`play()` 调用结果及错误码。先定位是服务端未下发音频、解码/拼接失败、临时文件不可播放，还是微信播放器状态机失败，再做最小修复；不得通过恢复旧 AI 接口规避问题。

## 7. 最终报告

分别报告：数据库迁移、5 个函数及其 deployment id、Secret 名称完整性、调度器、API 烟测、真机功能矩阵。对未执行项标记 `blocked` 并写明缺少的授权或测试条件，不得把未验证项写成通过。

报告中再次确认：未输出真实 Secret，未改变既有百度 BRTC 配置值，未使用本地 Supabase hostname，未部署范围外函数。
