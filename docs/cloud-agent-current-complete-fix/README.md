# 云端 Agent 当前完整修复包

本目录用于将本地工作区相对基线 `51d36e25` 的当前产品代码一次性同步到云端仓库。

## 文件

- `0001-current-complete-fix.patch`：完整 Git 补丁，包含已修改文件和本轮新增文件。
- `CLOUD_AGENT_PROMPT.md`：云端 Agent 的完整执行、冲突处理和验收指令。
- `SEND_TO_CLOUD_AGENT.txt`：可直接发送给云端 Agent 的短提示词。

## 基线

- Git 基线：`51d36e25 feat: add WeChat workflows and device test fixes`
- 补丁类型：相对基线的完整当前状态补丁，不依赖旧补丁的应用顺序。
- 数据库迁移：本补丁不新增数据库迁移。
- 补丁 SHA-256：`8582e88c68da1eb4712d8151e1c929c92e94e78bc8f1607c3816d53cbed6efa5`
- 补丁规模：28 个文件，2613 行新增、661 行删除，198940 bytes。

## 主要范围

1. 登录、微信绑定/解绑、主题颜色和首页拍照入口修复。
2. 品牌与 AI 顾问标志同步。
3. 营养素供能圆环、紧凑图例和三项统计口径。
4. 个人中心“历史记录查询”入口与独立年度/自定义热量查询页。
5. AI 问答语音区双控件布局和按住说话松开时序修复。
6. 对应静态检查、日期/供能算法检查及系统架构说明。

## 本地验证

生成后必须同时满足：

```bash
rtk git apply --check --reverse docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch
rtk git diff --check
rtk node scripts/checkChatStreaming.mjs
rtk node scripts/checkDeviceTestFixes.mjs
rtk node scripts/checkWechatFeatures.mjs
rtk node scripts/checkMacroDistribution.mjs
rtk node scripts/checkNutritionDates.mjs
rtk npx tsgo -p tsconfig.check.json
rtk npx biome lint --diagnostic-level=error
rtk npx oxlint -c .oxlintrc.json
rtk pnpm build:weapp
```

云端应用和验收方式以 `CLOUD_AGENT_PROMPT.md` 为准。
