# 第二步：受控部署与真机验证

必须先阅读 `docs/wechat-feature-deployment.md`，并由用户确认数据库备份、重复 openid 审计、微信模板和 Secrets 已准备好。

顺序：

1. 只读执行重复 openid 审计；非零则停止。
2. 备份 schema，再执行增量迁移 `00005_wechat_auth_notifications_recipe_shares.sql`。
3. 配置新增 Secrets，不覆盖既有百度与 Supabase Secrets。
4. 部署 `wechat_miniapp_login`、`upload-avatar`、`wechat-notification-schedule`、`wechat-notification-dispatch`、`recipe-share`。
5. 将默认男女头像上传到公开 `avatars` bucket 的固定 CDN 路径。
6. 配置每分钟通知调度器，并用 dispatch secret 做一次无到期任务烟测。
7. 在体验版依次验证微信登录、可选手机号、已有账号绑定、一次提醒和菜谱好友分享。

默认头像上传命令：

```bash
supabase --experimental storage cp --linked --content-type image/png --cache-control 'public,max-age=31536000,immutable' \
  src/assets/avatars/avatar-male.png ss:///avatars/defaults/avatar-male-1e8f1423eb6c.png
supabase --experimental storage cp --linked --content-type image/png --cache-control 'public,max-age=31536000,immutable' \
  src/assets/avatars/avatar-female.png ss:///avatars/defaults/avatar-female-8ffc792d31b6.png
supabase --experimental storage ls --linked ss:///avatars/defaults
```

微信公众平台进入“开发管理 → 开发设置 → 服务器域名”，将当前 `TARO_APP_SUPABASE_URL` 的 HTTPS 域名加入 `downloadFile` 合法域名。当前项目对应：

```text
https://zhgdvfwemwcmnehoarwp.supabase.co
```

上传源文件 SHA-256：

```text
1e8f1423eb6c251f6f04ea2b69656da7406f4b5bf6e569827e8fde10e6c35668  avatar-male.png
8ffc792d31b6a21d5dee4e44b35aebfd7cb4d00791949d7a533fbb30489d28c5  avatar-female.png
```

生产数据迁移、Secrets 修改、函数部署和调度器创建均属于外部状态变更；没有用户明确授权时只输出待执行命令和检查结果。
