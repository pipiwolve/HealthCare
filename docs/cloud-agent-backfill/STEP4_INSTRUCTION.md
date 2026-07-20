# 第四步：Edge Functions 受控部署

## 本次建议上传的 3 个文件

1. `README.md`
2. `STEP4_INSTRUCTION.md`
3. `patches/0003-backfill-Supabase-proxy-edge-functions-and-secrets-m.patch`

`0003` 仅作为待部署 Edge Function 源码的标准参考，不得再次盲目应用。

## 发给云端 Agent 的指令

```text
第三步标准树审计已经完成，当前代码已与 89269e9d + 0001-0003 的标准结果字节级一致，代码检查全部通过。现在单独授权第四步：Edge Functions 受控部署。

本次授权只允许部署或更新以下 4 个 Supabase Edge Functions：

- brtc-history
- ws-sign
- upload-food-image
- wechat_miniapp_login

明确禁止：

- 不得执行 supabase/migrations/00000_complete_supabase_import.sql 或任何数据库 DDL/DML。
- 不得创建、修改或删除数据库表、策略、触发器、函数、bucket 或 publication。
- 不得写入、覆盖或删除任何 Supabase Secret，只能检查变量是否存在。
- 不得修改客户端 .env、构建变量或微信后台配置。
- 不得删除远端 tts-minimax；本轮只报告它是否仍存在。
- 不得修改当前已通过标准树审计的源码。

一、部署前检查

1. 明确打印目标 Supabase project name/ref，确认与当前生产代理实际指向同一项目；如无法确认，停止部署。
2. 对 4 个函数分别记录当前部署状态、版本、更新时间和 verify_jwt 配置，形成回滚记录。不得输出源码中的密钥或 token。
3. 只检查以下 Secrets 的存在性，报告 present/missing，禁止输出值：
   APP_SUPABASE_URL 或 SUPABASE_URL；
   APP_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY；
   APP_SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SERVICE_ROLE_KEY；
   BAIDU_BCE_AK 或 BAIDU_BRTC_AK；
   BAIDU_BCE_SK 或 BAIDU_BRTC_SK；
   BAIDU_BRTC_APPID；
   BAIDU_BRTC_LICENSE_KEY；
   WECHAT_MINIPROGRAM_LOGIN_APP_ID；
   WECHAT_MINIPROGRAM_LOGIN_APP_SECRET。
4. 任一函数的必需 Secret 缺失时，不部署该函数，停止并报告缺失项。
5. 保持现有正确的 verify_jwt 策略。特别确认 wechat_miniapp_login 必须允许未登录小程序使用微信 code 调用；不得因为 CLI 默认值改变现有调用语义。如远端配置不明确，停止并报告，不得猜测。

二、受控部署

1. 只能从当前已经通过标准树审计的以下目录部署：
   supabase/functions/brtc-history/
   supabase/functions/ws-sign/
   supabase/functions/upload-food-image/
   supabase/functions/wechat_miniapp_login/
2. 不允许在部署前临时改源码，也不允许把本地 .env 或 supabase/.temp 上传为函数内容。
3. 逐个部署并记录每个函数的新版本和部署时间。某个函数部署失败不应阻止记录其他函数状态，但不得通过修改源码绕过失败。
4. brtc-history 当前旧版本存在 boot error，本次必须重点检查新版本启动日志。若新版本仍 boot error，停止其烟测并完整报告错误摘要，不得回滚到已知同样 boot error 的旧版本。
5. 对原本正常的其他函数，如新版本出现明确回归，使用部署前记录的版本执行回滚，并报告回滚结果。

三、部署后启动与接口烟测

所有请求优先通过 TARO_APP_SUPABASE_URL 对应的生产代理域名访问 /functions/v1/<function>，以同时验证代理透传。测试日志不得输出 Authorization、apikey、BRTC token、WebSocket 完整 URL、微信 code 或用户数据。

1. 四个函数均检查部署状态和启动日志，要求无 boot error、import error、missing module 或未捕获初始化异常。
2. brtc-history：
   - OPTIONS 请求应正常返回 CORS 响应；
   - 无有效用户身份的 POST 应返回 401，而不是 500/boot error；
   - 使用隔离测试用户调用一次，期望成功返回 groups 数组或受控的上游超时/空历史响应。
3. ws-sign：
   - OPTIONS 请求应正常；
   - 无有效用户身份的 POST 应返回 401；
   - 使用隔离测试用户最多调用一次，确认返回结构含 url、agentProfile、userId，但报告中只能写字段是否存在，不能输出字段值或完整 URL。
4. upload-food-image：
   - OPTIONS 请求应正常；
   - 使用隔离测试用户和最小测试图片调用一次；
   - 记录成功/失败状态，成功后删除本次测试产生的对象，不能遗留测试数据。
5. wechat_miniapp_login：
   - OPTIONS 请求应正常；
   - 空 body 或缺少 code 应返回受控的 400；
   - 只有具备一次性测试 code 时才做真实登录烟测，禁止记录或复用微信 code。
6. 若无法获得隔离测试用户、微信测试 code 或安全测试图片，对相应项目标记 blocked，不得使用生产用户数据替代。

四、数据库差异保持只读

第三步报告发现 2 个缺失触发器和 1 条 storage policy 定义差异。本步骤不得修复它们，只需在最终报告中补全：

- 两个触发器的精确名称、所属表、触发时机/事件、目标 function 和标准定义；
- storage policy 的精确名称、所属对象、当前定义和 00000_complete_supabase_import.sql 中的期望定义；
- 每一项是否可以独立用最小 SQL 修复；
- 不得执行或创建迁移文件，等待下一次单独授权。

五、完成报告格式

1. 目标项目：project name/ref 是否确认，不能输出 secret。
2. Secrets：逐项 present/missing/无法验证，不能输出值。
3. 部署结果：4 个函数分别列旧版本、新版本、verify_jwt、部署成功/失败/回滚。
4. 启动健康：分别列 healthy/boot error，并给出脱敏错误摘要。
5. 烟测结果：按 OPTIONS、未授权请求、授权测试分别报告 pass/fail/blocked。
6. 代理验证：四个 /functions/v1 路径是否通过生产代理正常透传。
7. tts-minimax：只报告远端是否存在，本轮不得删除。
8. 数据库三项差异：两个触发器和一条 policy 的精确定义，只读报告。
9. 最终结论：只能是“Edge Functions 部署完成，可以准备最小数据库修复”或“存在部署阻断项”。

完成后停止。不得自行进入数据库修复阶段。
```

## 本步骤允许产生的外部变更

仅允许更新以下 4 个 Edge Function 的部署版本：

```text
brtc-history
ws-sign
upload-food-image
wechat_miniapp_login
```

代码仓库、Secrets、数据库、Storage、微信后台和其他远端函数均应保持不变。

