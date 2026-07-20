// Markdown渲染组件（微信小程序兼容版）— 支持表格/多级标题/加粗/斜体/行内代码/列表/缩进列表/分隔线
import type React from 'react'
import {normalizeAiMarkdown} from '@/utils/markdownText'
interface MarkdownProps {
  content: string
  className?: string
}

export function MarkdownRenderer({content, className = ''}: MarkdownProps) {
  const elements: JSX.Element[] = []
  let key = 0

  const normalizedContent = normalizeMarkdownContent(content)

  const rawLines = normalizedContent.split('\n')
  const merged: string[] = []
  for (let j = 0; j < rawLines.length; j++) {
    const trimmed = rawLines[j].trim()
    if (trimmed !== '：' && trimmed !== ':') {
      merged.push(rawLines[j])
    }
  }

  // 先按行扫描，检测连续表格行后整体渲染
  const lines = merged
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <div
          key={key++}
          className="my-2 overflow-x-auto rounded-md border border-border bg-secondary px-3 py-2"
        >
          <pre className="text-xl leading-snug text-foreground whitespace-pre-wrap font-mono">
            {codeLines.join('\n')}
          </pre>
        </div>
      )
      i++
      continue
    }

    // ——— 检测表格块（连续 |...| 行，第二行为分隔行 |---|---| ）———
    if (isTableRowLine(line) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const tableLines: string[] = []
      while (i < lines.length && isTableRowLine(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(renderTable(tableLines, key++))
      continue
    }

    // ——— 检测营养总览的非标准表格（模型有时会漏掉列分隔符）———
    if (isNutritionOverviewHeaderLine(line) && i + 1 < lines.length && isLooseTableSeparatorLine(lines[i + 1])) {
      const tableLines: string[] = [line]
      i += 2
      while (i < lines.length && isNutritionValueLine(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(renderNutritionOverviewTable(tableLines, key++))
      continue
    }

    // ——— 标题层级（长前缀优先匹配）———
    if (line.startsWith('##### ')) {
      elements.push(
        <p key={key++} className="text-xl font-semibold text-foreground mt-1.5 mb-0.5 leading-snug">
          {renderInline(line.slice(6), key)}
        </p>
      )
    } else if (line.startsWith('#### ')) {
      elements.push(
        <p key={key++} className="text-xl font-bold text-foreground mt-2 mb-0.5 leading-snug">
          {renderInline(line.slice(5), key)}
        </p>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <p key={key++} className="text-xl font-bold text-foreground mt-2 mb-1 leading-snug">
          {renderInline(line.slice(4), key)}
        </p>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <p key={key++} className="text-xl font-bold text-foreground mt-2.5 mb-1 leading-snug">
          {renderInline(line.slice(3), key)}
        </p>
      )
    } else if (line.startsWith('# ')) {
      elements.push(
        <p key={key++} className="text-xl font-extrabold text-foreground mt-2.5 mb-1.5 leading-snug">
          {renderInline(line.slice(2), key)}
        </p>
      )
    // ——— 缩进列表（1~4空格 + "- " 或 "* "）———
    } else if (/^ {1,4}[*-] /.test(line)) {
      const text = line.replace(/^ {1,4}[*-] /, '')
      elements.push(
        <div key={key++} className="flex items-start gap-1.5 py-px pl-5">
          <span className="text-muted-foreground text-xl mt-0.5 flex-shrink-0">◦</span>
          <p className="text-xl text-foreground flex-1 leading-snug">{renderInline(text, key)}</p>
        </div>
      )
    } else if (/^ {1,4}\S/.test(line)) {
      elements.push(
        <div key={key++} className="py-px pl-5">
          <p className="text-xl text-foreground leading-snug">{renderInline(line.trim(), key)}</p>
        </div>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={key++} className="flex items-start gap-1.5 py-px">
          <span className="text-primary text-xl mt-0.5 flex-shrink-0">•</span>
          <p className="text-xl text-foreground flex-1 leading-snug">{renderInline(line.slice(2), key)}</p>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/)
      if (match) {
        elements.push(
          <div key={key++} className="flex items-start gap-1.5 py-px">
            <span className="text-primary text-xl font-semibold flex-shrink-0 leading-snug">{match[1]}.</span>
            <p className="text-xl text-foreground flex-1 leading-snug">{renderInline(match[2], key)}</p>
          </div>
        )
      }
    } else if (line.startsWith('---') || line.startsWith('***')) {
      elements.push(<div key={key++} className="h-px bg-border my-2" />)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1" />)
    } else if (/^[^：:\n]{1,32}[：:]\s*$/.test(line.trim())) {
      const label = line.trim().replace(/[：:]\s*$/, '')
      elements.push(
        <p key={key++} className="text-xl font-bold text-foreground mt-2 mb-0.5 leading-snug">
          {renderInline(label, key)}：
        </p>
      )
    } else {
      const keyValueMatch = line.match(/^([^：:\n]{1,28})[：:]\s*(.+)$/)
      if (keyValueMatch) {
        elements.push(
          <p key={key++} className="text-xl text-foreground leading-snug py-px">
            <span className="font-semibold text-foreground">{renderInline(keyValueMatch[1].trim(), key)}：</span>
            {renderInline(keyValueMatch[2].trim(), key)}
          </p>
        )
        i++
        continue
      }
      elements.push(
        <p key={key++} className="text-xl text-foreground leading-snug py-px">
          {renderInline(line, key)}
        </p>
      )
    }
    i++
  }

  return <div className={`markdown-compact ${className}`.trim()}>{elements}</div>
}

export function normalizeMarkdownContent(content: string): string {
  return normalizeAiMarkdown(content)
}

// 渲染 Markdown 表格块（含表头、分隔行、数据行）
function renderTable(tableLines: string[], baseKey: number): JSX.Element {
  const headerCells = parseCells(tableLines[0])
  // tableLines[1] 是分隔行，跳过
  const bodyRows = tableLines.slice(2).map(row => normalizeCellCount(parseCells(row), headerCells.length))
  const columnCount = Math.max(1, headerCells.length)

  const cellStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    padding: '5px 6px',
    textAlign: 'left',
    fontSize: '16px',
    flex: 1,
    lineHeight: 1.45,
    minWidth: '72px',
    color: '#333333',
    verticalAlign: 'top',
  }
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#F7F8FA',
    fontWeight: 700,
    color: '#111111',
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    minWidth: `${columnCount * 82}px`,
  }

  return (
    <div key={baseKey} className="w-full overflow-x-auto my-2" style={{borderRadius: '6px', border: '1px solid #E5E5E5'}}>
      <div style={rowStyle}>
        {normalizeCellCount(headerCells, columnCount).map((cell, ci) => (
          <div key={ci} style={headerCellStyle}>{renderInline(cell, baseKey * 100 + ci)}</div>
        ))}
      </div>
      {bodyRows.map((row, ri) => (
        <div key={ri} style={{...rowStyle, backgroundColor: ri % 2 === 1 ? '#FAFAFA' : '#FFFFFF'}}>
          {row.map((cell, ci) => (
            <div key={ci} style={cellStyle}>{renderInline(cell, baseKey * 100 + ri * 20 + ci)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

function renderNutritionOverviewTable(lines: string[], baseKey: number): JSX.Element {
  const header = parseNutritionOverviewHeader(lines[0])
  const rows = lines.slice(1).map(parseNutritionValueRow).filter((row): row is string[] => !!row)
  const tableLines = [
    `| ${header.join(' | ')} |`,
    '| --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ]
  return renderTable(tableLines, baseKey)
}

function isNutritionOverviewHeaderLine(line: string): boolean {
  const normalized = line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.includes('项目') && normalized.includes('整餐总量') && normalized.includes('人均')
}

function isLooseTableSeparatorLine(line: string): boolean {
  return /^[\s\-|]+$/.test(line.trim()) && line.includes('-')
}

function isNutritionValueLine(line: string): boolean {
  return /^(热量|蛋白质|脂肪|碳水化合物|碳水)(?:\s|[：:]|$)/.test(stripEdgePipes(line))
}

function parseNutritionOverviewHeader(line: string): string[] {
  const normalized = line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
  const averageMatch = normalized.match(/人均(?:（[^）]+）|\([^)]*\))?/)
  return ['项目', '整餐总量', averageMatch?.[0] || '人均']
}

function parseNutritionValueRow(line: string): string[] | null {
  const normalized = stripEdgePipes(line).replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
  const labelMatch = normalized.match(/^(热量|蛋白质|脂肪|碳水化合物|碳水)\s+(.+)$/)
  if (!labelMatch) return null

  const label = labelMatch[1] === '碳水化合物' ? '碳水' : labelMatch[1]
  const rest = labelMatch[2]
  const numberMatches = [...rest.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map(match => match[0])
  if (numberMatches.length < 2) return null
  const unit = label === '热量'
    ? (rest.match(/kcal|千卡|大卡|cal/i)?.[0] || '千卡')
    : (rest.match(/g|克/i)?.[0] || '克')

  return [
    label,
    `约 ${numberMatches[0]} ${unit}`,
    `约 ${numberMatches[1]} ${unit}`,
  ]
}

function stripEdgePipes(line: string): string {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').trim()
}

function isTableRowLine(line: string): boolean {
  return parseCells(line).length >= 2
}

function isTableSeparatorLine(line: string): boolean {
  const cells = parseCells(line)
  return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function parseCells(row: string): string[] {
  const normalized = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  if (!normalized.includes('|')) return []
  return normalized.split('|').map(c => c.trim()).filter((cell, index, cells) => cell || index < cells.length - 1)
}

function normalizeCellCount(cells: string[], count: number): string[] {
  if (cells.length === count) return cells
  if (cells.length > count) return cells.slice(0, count - 1).concat(cells.slice(count - 1).join(' '))
  return cells.concat(Array.from({length: count - cells.length}, () => ''))
}

// 解析行内加粗/斜体/行内代码，返回 JSX 节点数组
function renderInline(text: string, baseKey: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // 匹配顺序：先行内代码 `...`，再加粗 **...**，再斜体 *...*
  const pattern = /(`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlainText(parts, text.slice(lastIndex, match.index))
    }
    if (match[0].startsWith('`')) {
      // 行内代码
      parts.push(
        <span
          key={`${baseKey}-c-${idx++}`}
          className="text-primary font-mono"
          style={{backgroundColor: 'rgba(74,124,89,0.08)', borderRadius: '4px', padding: '1px 5px', fontSize: '0.9em'}}
        >
          {match[2]}
        </span>
      )
    } else if (match[0].startsWith('**')) {
      parts.push(
        <span key={`${baseKey}-b-${idx++}`} className="font-semibold text-foreground">
          {match[3]}
        </span>
      )
    } else {
      parts.push(
        <span key={`${baseKey}-i-${idx++}`} className="italic text-foreground">
          {match[4]}
        </span>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    pushPlainText(parts, text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text.replace(/\*\*/g, '').replace(/(^|\s)>\s?/g, '$1')]
}

function pushPlainText(parts: (string | JSX.Element)[], text: string) {
  const cleaned = text.replace(/\*\*/g, '').replace(/(^|\s)>\s?/g, '$1')
  if (cleaned) parts.push(cleaned)
}
