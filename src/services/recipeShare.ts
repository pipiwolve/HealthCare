import {supabase} from '@/client/supabase'
import type {Ingredient} from '@/db/types'

export interface RecipeShareSnapshot {
  id: string
  title: string
  recipeContent: string
  ingredients: Ingredient[]
  expiresAt: string
  createdAt: string
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  const {data, error} = await supabase.functions.invoke('recipe-share', {body})
  if (error) {
    try {
      const text = await error?.context?.text?.()
      if (text) throw new Error(JSON.parse(text).message || '菜谱分享服务不可用')
    } catch (parsed) {
      if (parsed instanceof Error) throw parsed
    }
    throw new Error(error.message || '菜谱分享服务不可用')
  }
  return data
}

export async function createRecipeShare(title: string, recipeContent: string, ingredients: Ingredient[]): Promise<string> {
  const data = await invoke({action: 'create', title, recipeContent, ingredients})
  if (!data?.shareId) throw new Error('菜谱分享创建失败')
  return data.shareId
}

export async function getRecipeShare(shareId: string): Promise<RecipeShareSnapshot> {
  const data = await invoke({action: 'get', shareId})
  if (!data?.share) throw new Error('菜谱分享不存在')
  return data.share
}
