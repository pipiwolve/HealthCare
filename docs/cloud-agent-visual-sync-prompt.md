# 云端 Agent 视觉同步 Prompt

下面内容可直接连同男女两张头像图片一起发送给云端 Agent。

---

你正在维护一个 Taro + React + TypeScript 微信小程序。请把本次视觉更新同步到云端代码库，并处理我随消息附带的两张默认头像图片。

## 输入图片

- 附件 1：男性默认头像，最终对应 `src/assets/avatars/avatar-male.png`
- 附件 2：女性默认头像，最终对应 `src/assets/avatars/avatar-female.png`

如果附件名称或性别对应关系不明确，先根据我提供的说明确认，不要自行猜测。头像已经是最终视觉稿，不要重新生图、改变人物长相或叠加文字、Logo、边框。只允许做保持构图的方形裁切、尺寸统一和 PNG 格式转换。

## 目标

1. 将“智能健康助手”的通用心电爱心图标改为“扫描框 + 叶片”的产品标志，表达 AI 识别、营养和健康管理。
2. 将“AI 健康顾问”的机器人图标改为“对话气泡 + 星芒”，弱化幼态机器人感，同时保留 AI 对话语义。
3. 用附件中的男女头像替换当前动漫默认头像，并让个人中心、家庭成员、成员编辑和统计页继续通过统一头像工具函数获得新默认头像。
4. 保留用户已经上传的 `avatar_url`；新图片只作为没有自定义头像时的性别默认值。

## 代码实现

新增 `src/components/HealthMarks.tsx`：

```tsx
interface HealthMarkProps {
  size?: number
  className?: string
}

export function HealthBrandMark({size = 48, className = ''}: HealthMarkProps) {
  const leafSize = Math.round(size * 0.42)

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{width: `${size}px`, height: `${size}px`}}
    >
      <div className="i-lucide-scan-line absolute inset-0" style={{width: `${size}px`, height: `${size}px`}} />
      <div
        className="i-lucide-leaf absolute"
        style={{width: `${leafSize}px`, height: `${leafSize}px`, transform: 'rotate(-8deg)'}}
      />
    </div>
  )
}

export function HealthAdvisorMark({size = 48, className = ''}: HealthMarkProps) {
  const bubbleSize = Math.round(size * 0.8)
  const sparkleSize = Math.max(9, Math.round(size * 0.34))

  return (
    <div
      className={`relative flex items-end justify-start ${className}`}
      style={{width: `${size}px`, height: `${size}px`}}
    >
      <div
        className="i-lucide-message-circle-more"
        style={{width: `${bubbleSize}px`, height: `${bubbleSize}px`}}
      />
      <div
        className="i-lucide-sparkles absolute"
        style={{width: `${sparkleSize}px`, height: `${sparkleSize}px`, top: 0, right: 0}}
      />
    </div>
  )
}
```

项目已经启用 `@iconify-json/lucide`，不要新增图标依赖，也不要手绘 SVG。

完成以下替换：

- `src/pages/login/index.tsx`
  - 导入 `HealthBrandMark`。
  - 将顶部品牌区的 `i-mdi-heart-pulse` 替换为 `<HealthBrandMark size={52} className="text-white" />`。
- `src/components/DisclaimerModal.tsx`
  - 导入 `HealthBrandMark`。
  - 将品牌图标替换为 `<HealthBrandMark size={40} className="text-white" />`。
- `src/pages/chat/index.tsx`
  - 导入 `HealthAdvisorMark`。
  - 空状态主图标替换为 `<HealthAdvisorMark size={40} className="text-white" />`。
  - AI 消息头像和加载中头像均替换为 `<HealthAdvisorMark size={20} className="text-white" />`。

不要顺带替换“慢性病”等确实用于表达医疗健康信息的 `heart-pulse` 图标。

## 头像处理与 CDN 路径

1. 将两个附件处理为相同尺寸的方形 PNG，建议 `1024x1024`；确保人物在 80px 圆形裁切下仍清晰，头肩位置一致，不要把圆形边框烘焙进图片。
2. 覆盖本地部署源：
   - `src/assets/avatars/avatar-male.png`
   - `src/assets/avatars/avatar-female.png`
3. 分别计算完整 SHA-256，并取前 12 位作为不可变 CDN 文件名中的内容哈希：
   - `defaults/avatar-male-<hash12>.png`
   - `defaults/avatar-female-<hash12>.png`
4. 更新 `src/utils/avatarUtils.ts` 中 `AVATAR_MALE_URL` 和 `AVATAR_FEMALE_URL` 的 Supabase Storage 路径。不要改变 `getAvatarByGender` 与 `getMemberAvatar` 的回退逻辑。
5. 如果当前任务已获准修改关联 Supabase 项目且 CLI 已登录，上传到公开 `avatars` bucket：

```bash
rtk supabase --experimental storage cp --linked --content-type image/png --cache-control 'public,max-age=31536000,immutable' src/assets/avatars/avatar-male.png ss:///avatars/defaults/avatar-male-<hash12>.png
rtk supabase --experimental storage cp --linked --content-type image/png --cache-control 'public,max-age=31536000,immutable' src/assets/avatars/avatar-female.png ss:///avatars/defaults/avatar-female-<hash12>.png
rtk supabase --experimental storage ls --linked ss:///avatars/defaults
```

不要覆盖旧哈希资源，也不要删除旧头像；这样已有构建仍可正常访问。如果没有 Supabase 凭据或没有外部上传授权，完成本地文件和代码更新后停止，不要伪造上传成功，并在结果中给出准确的待执行命令。

## 约束

- 工作区可能已有未提交修改，保留并兼容它们，不要回滚或格式化无关代码。
- 修改范围仅限上述组件、页面、头像资源和 `avatarUtils.ts`。
- 不要改变登录、聊天、家庭成员或自定义头像上传逻辑。
- 图标必须保持矢量清晰，并在微信小程序与 H5 中正确继承 `text-white` 颜色。
- 不要让头像图片或图标改变现有容器尺寸、布局或圆形裁切行为。

## 验证

执行并报告结果：

```bash
rtk pnpm exec tsc -p tsconfig.check.json
rtk pnpm exec biome check src/components/HealthMarks.tsx src/components/DisclaimerModal.tsx src/pages/login/index.tsx src/pages/chat/index.tsx src/utils/avatarUtils.ts
rtk pnpm build:weapp
```

在约 `390x844` 的移动视口做实际渲染检查：

- 登录页产品标志为白色且居中，无溢出或重叠。
- AI 健康顾问空状态图标和 20px 消息头像清晰可辨。
- 男、女、未知性别默认头像显示正确；未知性别继续使用男性默认头像，除非当前产品规则另有定义。
- 用户已有自定义 `avatar_url` 时仍优先显示自定义头像。

最终回复必须列出：改动文件、两张图片的完整 SHA-256、新 CDN 路径、是否实际上传成功、验证命令结果，以及移动端截图路径。

---
