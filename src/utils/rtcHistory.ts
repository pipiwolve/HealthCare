export type RtcDialogueType = 'QUESTION' | 'ANSWER' | string

export interface RtcDialogueRow {
  type: RtcDialogueType
  timestamp: number | string
  text: string
}

export interface RtcHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface RtcHistoryGroup {
  id: string
  title: string
  startTime: number
  endTime: number
  messages: RtcHistoryMessage[]
}

const DEFAULT_GAP_SECONDS = 30 * 60

function normalizeTimestamp(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapRole(type: RtcDialogueType): RtcHistoryMessage['role'] {
  return type === 'QUESTION' ? 'user' : 'assistant'
}

export function normalizeRtcQuestionText(text: string): string {
  const source = (text || '').replace(/\\n/g, '\n').trim()
  if (!source) return ''

  const markerMatch = source.match(/用户问题[:：]\s*([\s\S]+)$/)
  if (markerMatch?.[1]) {
    return markerMatch[1].trim()
  }

  const hiddenQuestionPrefixes = [
    '你是专业健康饮食顾问',
    '请用不超过',
    '请使用简单 Markdown 输出',
    '不要输出长篇食谱',
    '不能给出医疗诊断',
    '请先请求上传图片',
    '图片已上传完成',
    '识别图片中的食材',
    '只输出食材名',
    '【本餐用餐成员健康档案】',
    '请分析以下食材',
  ]
  if (hiddenQuestionPrefixes.some(prefix => source.startsWith(prefix))) return ''
  if (source.includes('请分析以下食材的营养成分')) return ''
  return source
}

function normalizeDialogueText(row: RtcDialogueRow): string {
  if (row.type === 'QUESTION') return normalizeRtcQuestionText(row.text || '')
  return (row.text || '').trim()
}

function buildTitle(messages: RtcHistoryMessage[]): string {
  const firstQuestion = messages.find(message => message.role === 'user' && message.content.trim())
  const source = firstQuestion?.content.trim() || messages.find(message => message.content.trim())?.content.trim()
  if (!source) return '云端对话'
  if (!firstQuestion) return 'AI 回复'
  return source.slice(0, 20)
}

function toGroup(messages: RtcHistoryMessage[]): RtcHistoryGroup {
  const startTime = messages[0]?.timestamp || 0
  const endTime = messages[messages.length - 1]?.timestamp || startTime
  return {
    id: `rtc-${startTime}-${endTime}`,
    title: buildTitle(messages),
    startTime,
    endTime,
    messages,
  }
}

export function groupRtcDialogueRows(rows: RtcDialogueRow[], gapSeconds = DEFAULT_GAP_SECONDS): RtcHistoryGroup[] {
  const sortedRows = [...rows].sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp))
  const sorted: RtcHistoryMessage[] = []
  let skipAnswerForHiddenQuestion = false

  for (const row of sortedRows) {
    const role = mapRole(row.type)
    const content = normalizeDialogueText(row)
    if (role === 'user') {
      skipAnswerForHiddenQuestion = !content.trim()
      if (!content.trim()) continue
    } else if (skipAnswerForHiddenQuestion) {
      skipAnswerForHiddenQuestion = false
      continue
    }
    if (!content.trim()) continue
    sorted.push({
      role,
      content,
      timestamp: normalizeTimestamp(row.timestamp),
    })
  }

  const groups: RtcHistoryGroup[] = []
  let current: RtcHistoryMessage[] = []

  for (const message of sorted) {
    const previous = current[current.length - 1]
    if (previous && message.timestamp - previous.timestamp > gapSeconds) {
      groups.push(toGroup(current))
      current = []
    }
    current.push(message)
  }

  if (current.length > 0) groups.push(toGroup(current))
  return groups
}
