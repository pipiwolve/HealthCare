export function cleanRecipeLine(value: string): string {
  return value.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').replace(/[*_`]/g, '').trim()
}

export function extractPosterSections(markdown: string) {
  const sections: Record<'ingredients' | 'steps' | 'nutrition', string[]> = {
    ingredients: [], steps: [], nutrition: []
  }
  let current: keyof typeof sections | '' = ''
  for (const raw of markdown.split('\n')) {
    if (/^##\s*食材/.test(raw)) { current = 'ingredients'; continue }
    if (/^##\s*烹饪/.test(raw)) { current = 'steps'; continue }
    if (/^##\s*营养/.test(raw)) { current = 'nutrition'; continue }
    if (/^##\s/.test(raw)) { current = ''; continue }
    const line = cleanRecipeLine(raw)
    if (current && line) sections[current].push(line)
  }
  return sections
}
