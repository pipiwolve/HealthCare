export function normalizeAiMarkdown(text: string): string {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .trim()

  return normalizeMarkdownStructure(normalized).trim()
}

function normalizeMarkdownStructure(text: string): string {
  const lines = text
    .replace(/\*\*([^\n*：:]{1,18})[：:]\s*\n\s*\*\*/g, '**$1**')
    .replace(/\*\*\s*\n\s*([^*\n：:]{1,18})[：:]\s*\*\*/g, '**$1**')
    .replace(/\*\*([^*\n]{1,28})\*\*\s*\n\s*([：:])/g, '**$1**')
    .split('\n')

  const merged: string[] = []
  for (const rawLine of lines) {
    const withoutQuote = rawLine.replace(/^(\s*)>\s?/, '$1')
    const trimmed = withoutQuote.trim()

    if (trimmed === '：' || trimmed === ':') {
      continue
    }

    const leadingColonMatch = withoutQuote.match(/^(\s*)([：:])\s*(.+)$/)
    if (leadingColonMatch) {
      const previous = merged[merged.length - 1] || ''
      const indent = leadingColonMatch[1] || (isMarkdownListLine(previous) ? '  ' : '')
      merged.push(`${indent}${leadingColonMatch[3].trim()}`)
      continue
    }

    merged.push(withoutQuote)
  }

  return merged
    .join('\n')
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/(^|[\s，。；;、])\*\*(?=($|[\s，。；;、]))/g, '$1')
}

function isMarkdownListLine(line: string): boolean {
  return /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line)
}

export function stripLeadingJsonMetadata(text: string): string {
  const normalized = normalizeAiMarkdown(text)
    .replace(/^```json\s*[\s\S]*?```\s*/i, '')
    .trimStart()

  if (!normalized.startsWith('{')) return normalized

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return normalized.slice(i + 1).trimStart()
    }
  }

  return normalized
}
