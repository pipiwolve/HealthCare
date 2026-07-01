// @title 隐私政策
import Taro from '@tarojs/taro'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="px-5 py-6">
        {/* 标题 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-3">
            <div className="i-mdi-shield-lock-outline text-3xl text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">隐私政策</h1>
          <p className="text-xl text-muted-foreground mt-1">更新日期：2025年1月1日</p>
        </div>

        {/* 提示卡片 */}
        <div className="rounded-xl px-4 py-3 mb-6" style={{backgroundColor: '#F0FDF4', borderLeft: '4px solid #4A7C59'}}>
          <p className="text-xl text-foreground font-medium">您的隐私对我们至关重要</p>
          <p className="text-xl text-muted-foreground mt-1">本政策说明我们如何收集、使用和保护您的个人信息。</p>
        </div>

        {Section('一、我们收集的信息', [
          '【账号信息】：您注册时提供的用户名、密码（加密存储，不可逆）。',
          '【健康档案】：您主动填写的年龄、性别、身高、体重、健康目标等。',
          '【饮食记录】：您通过拍照、从相册选择图片或手动输入的食材和饮食数据。',
          '【照片或视频信息】：您主动选择或拍摄的食材图片，仅用于食材识别、图片问答和饮食记录展示。',
          '【语音信息】：您主动录入的语音内容，仅用于转换为文字并完成语音输入或 AI 问答。',
          '【蓝牙信息】：用于搜索并连接您的智能秤设备，读取称重数据。',
          '【剪贴板信息】：仅在您点击复制时写入回答文本，便于您粘贴使用。',
          '【设备信息】：为兼容不同硬件，我们收集设备型号和操作系统版本（不含设备唯一标识符）。',
          '【使用日志】：功能使用频率等匿名统计数据，用于产品改进。',
        ])}

        {Section('二、信息使用方式', [
          '提供拍照识别食材、相册图片识别、营养分析和个性化健康建议等核心功能。',
          '在 AI 问答中使用您主动上传的食材图片，以便结合图片内容生成回答。',
          '生成饮食统计报告，帮助您追踪健康目标进度。',
          '改善 AI 模型准确性（使用匿名聚合数据，不含个人标识）。',
          '发送与您服务相关的通知（如饮食提醒）。',
          '我们不会将您的个人健康数据用于广告投放。',
        ])}

        {Section('三、信息存储与安全', [
          '您的数据存储在经安全认证的云服务器上，全程采用 TLS 加密传输。',
          '健康数据单独加密存储，即使内部人员也无法直接读取原始内容。',
          '我们定期进行安全审计，及时修复已知漏洞。',
          '数据默认保留至账号注销后 30 天，之后永久删除。',
        ])}

        {Section('四、第三方服务', [
          '【AI 识别服务】：您主动拍摄或选择的食材图片会发送至百度 AI 平台进行识别和问答处理。',
          '【语音服务】：语音输入内容通过百度语音识别处理，仅用于文字转换和 AI 问答。',
          '以上第三方服务均已签署数据处理协议，受其各自隐私政策约束。',
        ])}

        {Section('五、您的权利', [
          '【查阅权】：您可在"我的 → 个人信息"中查看所有已录入的个人数据。',
          '【更正权】：您可随时修改账号信息和健康档案。',
          '【删除权】：您可申请删除账号及所有相关数据，我们将在 7 个工作日内处理。',
          '【撤回授权】：您可在手机设置中随时撤回相机、麦克风等权限，但可能影响部分功能使用。',
        ])}

        {Section('六、未成年人保护', [
          '本应用不面向 14 周岁以下未成年人。若发现未成年人注册账号，我们将及时删除相关数据。',
          '14-18 周岁未成年人使用本应用须在监护人知情和同意下进行。',
        ])}

        {Section('七、隐私政策更新', [
          '本政策如有重大变更，将通过应用内弹窗提前 7 天通知。',
          '继续使用本应用视为接受更新后的隐私政策。',
        ])}

        {Section('八、联系我们', [
          '如需行使上述权利或对本隐私政策有任何疑问，请通过应用内"意见反馈"功能联系我们。',
        ])}

        {/* 返回按钮 */}
        <button
          type="button"
          className="w-full flex items-center justify-center leading-none text-2xl font-semibold rounded-xl bg-gradient-primary text-white mt-8 mb-4"
          style={{height: '56px'}}
          onClick={() => Taro.navigateBack()}
        >
          我已阅读，返回
        </button>
      </div>
    </div>
  )
}

function Section(title: string, items: string[]) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-foreground mb-3">{title}</h2>
      <div className="flex flex-col gap-3">
        {items.map((text, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-2.5" />
            <p className="text-xl text-foreground leading-relaxed flex-1">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
