// 过敏源预警工具函数
import type {FamilyMember, Ingredient} from '@/db/types'

// 常见过敏原关键词映射
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  '花生': ['花生', '花生酱', '花生油', '落花生'],
  '海鲜': ['虾', '蟹', '贝', '鱼', '鲈', '鲷', '鳕', '三文鱼', '金枪鱼', '章鱼', '乌贼', '扇贝', '蛤', '蛏', '海鲜', '鱼翅'],
  '坚果': ['坚果', '核桃', '杏仁', '腰果', '开心果', '夏威夷果', '榛子', '松子', '栗子'],
  '乳制品': ['牛奶', '奶', '奶油', '黄油', '芝士', '奶酪', '奶粉', '乳清', '乳制品', '酸奶'],
  '蛋类': ['鸡蛋', '蛋', '蛋黄', '蛋清', '鸭蛋', '鹌鹑蛋'],
  '麸质': ['小麦', '面粉', '面包', '面条', '饺子皮', '麸质', '大麦', '黑麦', '燕麦']
}

export function checkAllergens(ingredientName: string, member: FamilyMember | null): string[] {
  if (!member || !member.allergens || member.allergens.length === 0) return []
  const triggered: string[] = []
  for (const allergen of member.allergens) {
    const keywords = ALLERGEN_KEYWORDS[allergen] || [allergen]
    for (const kw of keywords) {
      if (ingredientName.includes(kw)) {
        triggered.push(allergen)
        break
      }
    }
  }
  return triggered
}

export function enrichIngredientsWithAllergens(ingredients: Ingredient[], member: FamilyMember | null): Ingredient[] {
  if (!member) return ingredients
  return ingredients.map(ing => {
    const allergens = checkAllergens(ing.name, member)
    return {
      ...ing,
      hasAllergen: allergens.length > 0,
      allergenName: allergens.join('、')
    }
  })
}

export function buildHealthContext(member: FamilyMember | null): string {
  if (!member) return ''
  const parts: string[] = []
  if (member.gender && member.gender !== 'unknown') {
    parts.push(`性别：${member.gender === 'male' ? '男' : '女'}`)
  }
  if (member.age) parts.push(`年龄：${member.age}岁`)
  if (member.height) parts.push(`身高：${member.height}cm`)
  if (member.weight) parts.push(`体重：${member.weight}kg`)
  if (member.chronic_diseases?.length) {
    parts.push(`慢性病：${member.chronic_diseases.join('、')}`)
  }
  if (member.allergens?.length) {
    parts.push(`过敏源：${member.allergens.join('、')}`)
  }
  if (member.medications) {
    parts.push(`正在服用的药物：${member.medications}`)
  }
  if (parts.length === 0) return ''
  return `【用户健康档案】\n${parts.join('\n')}`
}

export function buildFamilyHealthContext(members: FamilyMember[]): string {
  if (members.length === 0) return ''
  const memberContexts = members
    .map(member => {
      const context = buildHealthContext(member).replace(/^【用户健康档案】\n?/, '').trim()
      if (!context) return `【${member.nickname}】\n健康档案未完善`
      return `【${member.nickname}】\n${context}`
    })
  return `【本餐用餐成员健康档案】\n${memberContexts.join('\n\n')}`
}
