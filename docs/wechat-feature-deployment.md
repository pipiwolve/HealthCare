# 微信登录、一次性提醒与菜谱分享部署清单

本文件只描述云端配置和人工验收。不要把真实 AppSecret、service-role key、调度密钥或手机号写入仓库和补丁。

## 1. 数据库

先执行重复身份审计，结果必须为零行：

```sql
select openid, count(*)
from public.profiles
where openid is not null
group by openid
having count(*) > 1;
```

备份 schema 后执行 `supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql`。确认四张新表均启用 RLS，`avatars` bucket 为公开读，且 `claim_due_notification_jobs` 只授权给 service role。

## 2. Secrets

除既有 Supabase 变量外，配置：

- `WECHAT_MINIPROGRAM_LOGIN_APP_ID`
- `WECHAT_MINIPROGRAM_LOGIN_APP_SECRET`
- `WECHAT_LOGIN_TICKET_SECRET`：至少 32 个随机字符
- `WECHAT_NOTIFICATION_DISPATCH_SECRET`：独立随机值
- `WECHAT_SUBSCRIBE_TEMPLATES_JSON`

模板配置示例；字段名必须替换成微信公众平台审核模板中的真实关键词：

```json
{
  "breakfast":{"templateId":"TEMPLATE_A","page":"/pages/home/index","fields":{"menu":"thing1","date":"time2","checkInTime":"time4"}},
  "lunch":{"templateId":"TEMPLATE_B","page":"/pages/home/index","fields":{"menu":"thing1","date":"time2","checkInTime":"time4"}},
  "dinner":{"templateId":"TEMPLATE_C","page":"/pages/home/index","fields":{"menu":"thing1","date":"time2","checkInTime":"time4"}},
  "water":{"templateId":"TEMPLATE_D","page":"/pages/home/index","fields":{"tip":"thing1","drinkTime":"time6"}}
}
```

四个一次性模板标题必须不同，否则微信客户端会过滤同名模板。
餐食模板发送餐单、上海日期和打卡时间；饮水模板发送温馨提示和上海饮水时间。

## 3. Edge Functions

部署或更新：

- `wechat_miniapp_login`：公开入口，函数内部对绑定和状态操作校验用户 JWT。
- `upload-avatar`
- `wechat-notification-schedule`
- `wechat-notification-dispatch`：公开入口，仅接受 dispatch secret。
- `recipe-share`：公开读取，创建操作要求用户 JWT。

确认 `supabase/config.toml` 中登录、通知调度和菜谱分享函数的 JWT 设置已生效。

## 4. 调度器

使用 Supabase Cron 或云平台调度器每分钟 POST 调用通知调度函数，请求头携带：

```text
x-dispatch-secret: <WECHAT_NOTIFICATION_DISPATCH_SECRET>
```

调度接口幂等领取到期任务；进程中断后的任务会在五分钟后重新领取，每条任务最多尝试三次。

## 5. 微信后台和真机验收

1. 确认小程序为已认证非个人主体，并有手机号快速验证额度。
2. 配置四个一次性订阅模板和合法 request 域名。
3. 验证旧微信用户登录、新用户跳过手机号、新用户授权手机号和用户名账号绑定。
4. 同时预约四类提醒，至少接受一类，确认到点后服务通知送达且开关自动关闭。
5. 分享好友卡片，未登录好友应打开同一份菜谱；再验证图片海报的小程序入口。

正式 PNG 底板到位后，在海报渲染器的背景入口替换 Canvas 默认背景，不需要修改快照、分享路径或通知代码。
