// @title 用户协议
import Taro from '@tarojs/taro'

export default function AgreementPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* 内容区 */}
      <div className="px-5 py-6">
        {/* 标题 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-3">
            <div className="i-mdi-file-document-outline text-3xl text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">用户协议</h1>
          <p className="text-xl text-muted-foreground mt-1">更新日期：2025年1月1日</p>
        </div>

        {/* 提示卡片 */}
        <div className="rounded-xl px-4 py-3 mb-6" style={{backgroundColor: '#FFF7ED', borderLeft: '4px solid #F97316'}}>
          <p className="text-xl text-foreground font-medium">请仔细阅读本协议</p>
          <p className="text-xl text-muted-foreground mt-1">使用本应用即表示您同意以下条款。若不同意，请停止使用。</p>
        </div>

        {Section('一、服务说明', [
          '智能健康助手（以下简称"本应用"）是基于 AI 技术的营养与健康管理工具，为用户提供食材识别、营养分析和健康建议等服务。',
          '本应用提供的健康建议仅供参考，不构成医疗诊断或治疗意见。如有健康问题，请及时就医。',
        ])}

        {Section('二、账号注册与使用', [
          '用户需提供真实、准确的注册信息。账号和密码由用户自行保管，因保管不善导致的损失由用户自负。',
          '用户不得将账号转让、出租或授权他人使用。',
          '用户不得利用本应用从事违法活动，包括但不限于传播虚假健康信息、侵犯他人权益等。',
          '我们保留在违规情形下暂停或终止账号服务的权利。',
        ])}

        {Section('三、数据收集与使用', [
          '为提供个性化服务，本应用会收集您的健康档案、饮食记录、身体数据等信息。',
          '所有个人数据经加密存储，仅用于提供和改善本应用服务。',
          '未经您明确授权，我们不会将您的个人健康数据出售给第三方。',
          '您可随时在"我的 → 账号管理"中申请删除账号及相关数据。',
        ])}

        {Section('四、知识产权', [
          '本应用的所有内容（包括文字、图片、软件代码等）均受知识产权法律保护。',
          '未经书面许可，您不得复制、修改、传播或商业使用本应用的任何内容。',
        ])}

        {Section('五、免责声明', [
          '本应用提供的营养数据和健康建议基于公开数据库和 AI 模型生成，可能存在误差，仅供参考。',
          '对于因网络故障、设备问题或不可抗力导致的服务中断，我们不承担责任。',
          '用户因违规使用本应用所造成的任何损失，由用户自行承担。',
        ])}

        {Section('六、协议变更', [
          '我们可能不定期更新本协议。更新后继续使用本应用视为接受新协议。',
          '重大变更将通过应用内通知提前告知。',
        ])}

        {Section('七、联系我们', [
          '如对本协议有任何疑问，请通过应用内反馈功能联系我们。',
          '我们将在收到反馈后的 5 个工作日内予以回复。',
        ])}

        {/* 同意按钮 */}
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
