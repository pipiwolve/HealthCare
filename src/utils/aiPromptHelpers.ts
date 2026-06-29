interface ChatPromptOptions {
  userQuestion: string
  healthContext?: string
  ingredientContext?: string
}

export function buildChatPrompt(options: ChatPromptOptions): string {
  const systemParts = [
    '你是专业健康饮食顾问。请直接、简洁、可执行。',
    '请用不超过400字回答，先给结论，再给3-5条建议。',
    '不要输出长篇食谱，除非用户明确要求。',
    '不能给出医疗诊断性建议；涉及疾病治疗、用药、停药或换药时，末尾必须附加「请咨询专业医生」。',
  ]

  if (options.healthContext) systemParts.push(options.healthContext)
  if (options.ingredientContext) systemParts.push(options.ingredientContext)

  return `${systemParts.join('\n')}\n\n用户问题：${options.userQuestion.trim()}`
}

export function buildFoodRecognitionPrompt(stage: 'trigger' | 'final'): string {
  const base = [
    '识别图片中的食材/食物。',
    '只输出食材名；多个食材每行一个。',
    '不要输出解释、寒暄、语气词、标点、编号、Markdown。',
    '不要输出“这个啊”“看起来像”“图片中是”等前缀。',
    '无法确认时输出：未识别',
  ].join('\n')

  if (stage === 'trigger') {
    return `${base}\n请先请求上传图片。`
  }

  return `${base}\n图片已上传完成，请基于已上传图片直接输出食材名，不要再次请求上传图片。`
}

export function parseRecognizedFoods(raw: string): string[] {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\[M\]:/g, '')
    .replace(/让我想想啊[.。]*/g, '')
    .replace(/^(?:这个啊|这个|嗯|啊|呃|好的|让我看看|看一下|我看看|看起来像|可能是|应该是|这是)[.。…\s]*/g, '')
    .replace(/图片中(?:的)?(?:水果|食材|食物)?(?:是|包括|有|为)[:：]*/g, '')
    .replace(/识别(?:到|出)(?:的)?(?:水果|食材|食物)?(?:是|包括|有|为)[:：]*/g, '')
    .split(/[\n、，,]/)
    .map(s => s.trim().replace(/^[\d.、\-*]+\s*/, '').replace(/[。.!！；;：:]+$/g, ''))
    .map(s => s.replace(/^(?:这个啊|这个|让我看看|看一下|我看看|看起来像|可能是|应该是|这是)[.。…\s]*/g, '').trim())
    .filter(Boolean)
    .filter(s => s !== '未识别')
}
