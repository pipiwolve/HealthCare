# 云端 Agent 完整修复 Prompt

你正在维护一个 Taro 4 + React + TypeScript 微信小程序。请应用本消息附带的完整补丁，将云端仓库同步到本地当前实现，并完成代码检查、微信小程序构建和真机验收。不得只回复“已修复”，必须给出逐项证据。

## 一、输入与基线

- 完整补丁：`docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch`
- 本地生成基线：`51d36e25 feat: add WeChat workflows and device test fixes`
- 补丁包含基线之后的完整当前代码，不依赖旧补丁应用顺序。
- 云端可能已经应用部分旧补丁，禁止假定其状态与本地完全一致。

先执行并记录：

```bash
rtk git status --short
rtk git rev-parse --short HEAD
rtk git log -5 --oneline
rtk git apply --check docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch
rtk git apply --check --reverse docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch
```

状态判断：

- 正向检查通过：直接应用补丁。
- 反向检查通过：补丁已经完整存在，不要重复应用，直接进入验收。
- 两者都不通过：说明云端包含部分改动；使用三方合并，并逐文件解决冲突。

```bash
rtk git apply docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch
# 或
rtk git apply --3way docs/cloud-agent-current-complete-fix/0001-current-complete-fix.patch
```

禁止用整文件回退、`git reset --hard` 或 `git checkout -- <file>` 处理冲突。保留云端已经验证的 BRTC、BLE、提醒、头像上传、菜谱分享和聊天流式音频能力，只补齐本补丁定义的行为。

## 二、本轮必须达到的产品结果

### 1. 营养素分布

- 统计页使用圆环图展示碳水化合物、蛋白质和脂肪。
- 供能换算固定为：碳水 `4 kcal/g`、蛋白质 `4 kcal/g`、脂肪 `9 kcal/g`。
- 百分比使用最大余数法取整，总和必须为 100%。
- 圆环中心显示平均供能 kcal。
- 图例使用紧凑布局：较小色点、`text-lg` 字号、较小行距和数值间距。
- 删除“百分比按营养素供能计算”提示，不得在统计页重新出现。
- H5 和微信小程序都必须正常绘制 Canvas；不得恢复为横向进度条。

### 2. 历史热量查询

- 统计页不得嵌入历史查询模块。
- 个人中心保留“历史记录查询”入口，副文案必须仅为“热量趋势”。
- 点击后进入独立页面 `/pages/calorie-history/index`。
- 独立页面支持：
  - 全年 12 个月展示；
  - 自定义开始和结束日期；
  - 自定义范围最长 366 天；
  - 当前家庭成员切换；
  - 平均摄入、最高记录、达标天数；
  - 历史记录日列表。
- 冷启动直接进入历史页时也要加载当前家庭成员，不能依赖先访问首页。

### 3. AI 问答输入与按住说话

- 文字输入模式保留麦克风切换按钮、文本框和发送按钮。
- 语音输入模式只能有两个交互区域：
  - 左侧键盘切换按钮；
  - 中央“按住说话”区域。
- 语音模式右侧不得出现第三个圆形按钮，不论其图标是麦克风、机器人、电话还是通话入口。
- 不得恢复实时语音通话按钮或旧 `handleVoiceMicToggle`。

按住说话时序必须满足：

- 触摸按下后立即调用录音启动，不得保留 `VOICE_LONG_PRESS_MS` 或 120ms 延迟定时器。
- 松开时立即记录停止请求并调用 RecorderManager `stop()`。
- 如果松开发生在权限请求或 RecorderManager 启动完成之前，停止请求必须保留；`onStart` 到达后应立即停止，不能丢失松开事件。
- 每次录音使用尝试编号隔离旧监听回调，避免重复识别或重复发送。
- `touchcancel` 必须按取消处理，不得误发送。
- 松开后界面立即显示“正在发送...”，不能继续长时间停留在“录音中...”。
- 最短有效录音保持 500ms；过短录音明确提示“说话时间太短”。
- 上滑取消后提示“已取消发送”，且不得创建用户消息。
- RecorderManager 错误必须清理所有录音 UI 状态并提示重试。
- ASR 继续使用独立 `createAiWebSocket()` 和 `voice-ptt`，不得复用正在生成聊天回答的 socket。
- ASR 得到最终文本后，再通过普通 chat 链路生成回答；不得删除现有 RTC TTS、音频回放或流式消息逻辑。

## 三、完整补丁中已有能力不得回归

### 登录与微信绑定

- 新微信不得直接创建独立账号，只能绑定已有用户名账号或先普通注册再绑定。
- 普通注册保留确认密码。
- 微信绑定冲突必须按 `user_id`、provider 和 openid 拒绝。
- 解绑前验证当前用户名密码；纯微信旧账号不得直接解绑或自动合并数据。
- 不得输出 AppSecret、service-role key、anon key、登录票据、OpenID、手机号或密码。

### 首页与主题

- 首页添加食材只保留文字输入和相机识图，不得重新加入首页短语音入口。
- 首页不得包含 `getRecorderManager()` 或 `voice-ptt`。
- Tailwind `theme.extend` 只能有一个 `colors` 对象，主题按钮和个人中心图标必须保留正确颜色。

### 品牌视觉

- 登录/免责声明使用 `HealthBrandMark`。
- AI 健康顾问空状态、消息头像和加载头像使用 `HealthAdvisorMark`。
- 不得以旧机器人图标覆盖新的 AI 顾问标志。

## 四、必须核对的关键文件

```text
src/components/MacroDonutChart.tsx
src/components/CalorieHistoryPanel.tsx
src/components/NutritionMemberSwitcher.tsx
src/components/HealthMarks.tsx
src/pages/stats/index.tsx
src/pages/profile/index.tsx
src/pages/calorie-history/index.tsx
src/pages/calorie-history/index.config.ts
src/pages/chat/index.tsx
src/utils/macronutrients.ts
src/utils/nutritionDates.ts
src/utils/chartCanvas.ts
src/db/api.ts
src/app.config.ts
scripts/checkMacroDistribution.mjs
scripts/checkNutritionDates.mjs
scripts/checkChatStreaming.mjs
scripts/checkDeviceTestFixes.mjs
scripts/checkWechatFeatures.mjs
```

发生冲突时必须按功能合并这些文件，不能用云端旧版本整文件覆盖。

## 五、静态检查与构建

在仓库根目录执行，记录命令和退出码：

```bash
rtk node scripts/checkMacroDistribution.mjs
rtk node scripts/checkNutritionDates.mjs
rtk node scripts/checkChatStreaming.mjs
rtk node scripts/checkDeviceTestFixes.mjs
rtk node scripts/checkWechatFeatures.mjs
rtk npx tsgo -p tsconfig.check.json
rtk npx biome lint --diagnostic-level=error
rtk npx oxlint -c .oxlintrc.json
rtk bash scripts/checkNavigation.sh
rtk bash scripts/checkIconPath.sh
rtk bash scripts/checkAuthProvider.sh
rtk pnpm build:weapp
rtk git diff --check
```

任一真实 error 必须修复后重跑。Browserslist 数据过期、Sass legacy API 和 package module type warning 可以记录，但不得误报为业务失败。

构建后确认：

```bash
rtk proxy test -f dist/pages/calorie-history/index.js
rtk proxy test -f dist/pages/chat/index.js
rtk proxy test -f dist/pages/stats/index.js
rtk grep '历史热量查询' dist/pages/calorie-history/index.js
```

## 六、微信开发者工具与真机验收

### 统计页

- 今日、本周、本月切换正常。
- 圆环非空，三段颜色和中心 kcal 可见。
- 三行紧凑图例无截断、无重叠。
- 页面不存在已删除的供能计算提示。
- 页面不存在嵌入式历史查询模块。

### 个人中心与历史页

- 入口显示“历史记录查询 / 热量趋势”。
- 年度模式固定展示 1 至 12 月。
- 自定义日期可打开、修改并重新查询。
- 切换家庭成员后目标和历史数据同步变化。

### AI 问答

- 文字模式输入、键盘顶起和发送正常。
- 切换语音模式后只显示键盘按钮和中央按住区，右侧无第三按钮。
- 按住超过 500ms 后松开：立即出现“正在发送...”，随后出现“正在识别...”并自动发送识别文本。
- 快速短按：提示“说话时间太短”，无残留红色录音状态。
- 按住并上滑后松开：提示取消，不发送消息。
- 在 AI 正在回答时开始录音：旧回复被正确中断，新语音仍能识别并回答。
- 连续录制两次：每次只生成一条用户语音消息，不得重复发送。

录音时序必须使用微信原生 RecorderManager 在开发者工具或真机验证；H5 只能用于结构和布局检查，不能作为录音通过证据。

## 七、外部部署约束

- 本补丁不新增数据库迁移，不得重放历史 schema。
- 未获得明确授权时，不部署 Edge Function、不上传体验版、不修改生产数据库或 Secret。
- 获得授权后，只部署本补丁实际修改且验收需要的函数；记录非敏感 deployment id。
- 上传体验版前确认生产环境变量、微信 AppID 和合法 request 域名一致，不得输出 Secret 值。

## 八、回传格式

```markdown
# 云端完整修复执行报告

## 基线与补丁
- 原始 HEAD：
- 工作区初始状态：
- 正向 apply check：PASS/FAIL
- 反向 apply check：PASS/FAIL
- 应用方式：direct/3way/manual/already-applied
- 冲突文件与处理：

## 代码检查
- Macro distribution：PASS/FAIL
- Nutrition dates：PASS/FAIL
- Chat streaming：PASS/FAIL
- Device fixes：PASS/FAIL
- WeChat features：PASS/FAIL
- TypeScript：PASS/FAIL
- Biome：PASS/FAIL
- Oxlint：PASS/FAIL
- weapp build：PASS/FAIL
- diff check：PASS/FAIL

## 微信验收
- 紧凑圆环图例：PASS/FAIL/BLOCKED
- 删除供能提示：PASS/FAIL/BLOCKED
- 个人中心短文案：PASS/FAIL/BLOCKED
- 年度 12 月查询：PASS/FAIL/BLOCKED
- 自定义日期查询：PASS/FAIL/BLOCKED
- 语音仅两控件：PASS/FAIL/BLOCKED
- 松开立即停止并发送：PASS/FAIL/BLOCKED
- 短按提示：PASS/FAIL/BLOCKED
- 上滑取消：PASS/FAIL/BLOCKED
- 连续录音无重复：PASS/FAIL/BLOCKED

## 部署
- 数据库迁移：SKIPPED
- Edge Function：SKIPPED/部署项和 deployment id
- 体验版：SKIPPED/版本号和上传时间

## 证据
- 截图/录屏：
- 构建日志摘要：
- 非敏感 request id：

## 剩余问题
- 所有未执行项必须写 BLOCKED 和原因，不得写成 PASS。
```
