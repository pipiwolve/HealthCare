import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'

function sanitizeIngredients(value: unknown): Array<{name: string; weight: number; unit: string}> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const name = String((item as any).name || '').trim().slice(0, 40)
    const weight = Number((item as any).weight)
    const unit = String((item as any).unit || '').trim().slice(0, 10)
    return name && Number.isFinite(weight) ? [{name, weight, unit}] : []
  })
}

function sanitizeRecipeContent(value: unknown): string {
  const sensitiveLine = /(手机号|身份证|姓名[：:]|用户年龄|家庭成员|正在服用|用户过敏源)/
  return String(value || '')
    .split('\n')
    .filter(line => !sensitiveLine.test(line))
    .join('\n')
    .trim()
}

async function createShare(req: Request, body: any) {
  const ownerId = await getAuthUserId(req)
  const title = String(body.title || '').trim().slice(0, 80)
  const recipeContent = sanitizeRecipeContent(body.recipeContent)
  if (!title || !recipeContent) throw new HttpError(400, '菜谱内容不完整')
  if (recipeContent.length > 20_000) throw new HttpError(400, '菜谱内容过长')
  const {data, error} = await getSupabaseAdmin()
    .from('recipe_shares')
    .insert({owner_id: ownerId, title, recipe_content: recipeContent, ingredients: sanitizeIngredients(body.ingredients)})
    .select('id, expires_at')
    .single()
  if (error) throw error
  return json({shareId: data.id, expiresAt: data.expires_at})
}

async function getShare(body: any) {
  const shareId = String(body.shareId || '')
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) throw new HttpError(400, '分享链接无效')
  const {data, error} = await getSupabaseAdmin()
    .from('recipe_shares')
    .select('id, title, recipe_content, ingredients, expires_at, revoked_at, created_at')
    .eq('id', shareId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) throw new HttpError(404, '这份菜谱分享已失效')
  return json({
    share: {
      id: data.id,
      title: data.title,
      recipeContent: data.recipe_content,
      ingredients: sanitizeIngredients(data.ingredients),
      expiresAt: data.expires_at,
      createdAt: data.created_at
    }
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'create') return await createShare(req, body)
    if (body.action === 'get') return await getShare(body)
    throw new HttpError(400, '未知的菜谱分享操作')
  } catch (error) {
    return handleError(error, 'recipe-share')
  }
})
