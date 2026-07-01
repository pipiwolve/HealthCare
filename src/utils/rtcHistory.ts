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
  const sorted = [...rows]
    .map(row => ({
      role: mapRole(row.type),
      content: row.text || '',
      timestamp: normalizeTimestamp(row.timestamp),
    }))
    .filter(message => message.content.trim())
    .sort((a, b) => a.timestamp - b.timestamp)

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
