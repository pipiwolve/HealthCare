// Markdown渲染组件（微信小程序兼容版）— 支持表格/多级标题/加粗/斜体/行内代码/列表/缩进列表/分隔线
import type React from 'react'
interface MarkdownProps {
  content: string
  className?: string
}

export function MarkdownRenderer({content, className = ''}: MarkdownProps) {
  const elements: JSX.Element[] = []
  let key = 0

  // 预处理：将孤立冒号行（整行仅为 "：" 或 ":"）合并到前一行末尾
  const rawLines = content.split('\n')
  const merged: string[] = []
  for (let j = 0; j < rawLines.length; j++) {
    const trimmed = rawLines[j].trim()
    if ((trimmed === '：' || trimmed === ':') && merged.length > 0) {
      merged[merged.length - 1] = merged[merged.length - 1] + trimmed
    } else {
      merged.push(rawLines[j])
    }
  }

  // 先按行扫描，检测连续表格行后整体渲染
  const lines = merged
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // ——— 检测表格块（连续 |...| 行，第二行为分隔行 |---|---| ）———
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(renderTable(tableLines, key++))
      continue
    }

    // ——— 标题层级（长前缀优先匹配）———
    if (line.startsWith('##### ')) {
      elements.push(
        <p key={key++} className="text-base font-semibold text-foreground mt-1.5 mb-0.5 leading-snug">
          {renderInline(line.slice(6), key)}
        </p>
      )
    } else if (line.startsWith('#### ')) {
      elements.push(
        <p key={key++} className="text-base font-bold text-foreground mt-2 mb-0.5 leading-snug">
          {renderInline(line.slice(5), key)}
        </p>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <p key={key++} className="text-lg font-bold text-foreground mt-2 mb-1 leading-snug">
          {renderInline(line.slice(4), key)}
        </p>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <p key={key++} className="text-lg font-bold text-foreground mt-2.5 mb-1 leading-snug">
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
          <span className="text-muted-foreground text-sm mt-0.5 flex-shrink-0">◦</span>
          <p className="text-sm text-foreground flex-1 leading-snug">{renderInline(text, key)}</p>
        </div>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={key++} className="flex items-start gap-1.5 py-px">
          <span className="text-primary text-sm mt-0.5 flex-shrink-0">•</span>
          <p className="text-sm text-foreground flex-1 leading-snug">{renderInline(line.slice(2), key)}</p>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/)
      if (match) {
        elements.push(
          <div key={key++} className="flex items-start gap-1.5 py-px">
            <span className="text-primary text-sm font-semibold flex-shrink-0 leading-snug">{match[1]}.</span>
            <p className="text-sm text-foreground flex-1 leading-snug">{renderInline(match[2], key)}</p>
          </div>
        )
      }
    } else if (line.startsWith('---') || line.startsWith('***')) {
      elements.push(<div key={key++} className="h-px bg-border my-2" />)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1" />)
    } else {
      elements.push(
        <p key={key++} className="text-sm text-foreground leading-snug py-px">
          {renderInline(line, key)}
        </p>
      )
    }
    i++
  }

  return <div className={`markdown-compact ${className}`.trim()}>{elements}</div>
}

// 渲染 Markdown 表格块（含表头、分隔行、数据行）
function renderTable(tableLines: string[], baseKey: number): JSX.Element {
  // 解析单行 cells（去掉首尾 |，按 | 分割，trim）
  const parseCells = (row: string) =>
    row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())

  const headerCells = parseCells(tableLines[0])
  // tableLines[1] 是分隔行，跳过
  const bodyRows = tableLines.slice(2).map(parseCells)

  const cellStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    padding: '5px 6px',
    textAlign: 'left',
    fontSize: '14px',
    lineHeight: 1.35,
    color: '#333333',
    verticalAlign: 'top',
  }
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#F7F8FA',
    fontWeight: 700,
    color: '#111111',
  }

  return (
    <div key={baseKey} className="w-full overflow-x-auto my-2" style={{borderRadius: '6px', border: '1px solid #E5E5E5'}}>
      <table style={{width: '100%', borderCollapse: 'collapse', tableLayout: 'auto'}}>
        <thead>
          <tr>
            {headerCells.map((cell, ci) => (
              <th key={ci} style={headerCellStyle}>{renderInline(cell, baseKey * 100 + ci)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} style={{backgroundColor: ri % 2 === 1 ? '#FAFAFA' : '#FFFFFF'}}>
              {row.map((cell, ci) => (
                <td key={ci} style={cellStyle}>{renderInline(cell, baseKey * 100 + ri * 20 + ci)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
      parts.push(text.slice(lastIndex, match.index))
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
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}
