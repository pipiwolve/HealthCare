// @title 菜谱推荐

import Taro, {useShareAppMessage, useShareTimeline} from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useState } from 'react'
import {DisclaimerFooter} from '@/components/AllergenBanner'
import {MarkdownRenderer} from '@/components/MarkdownRenderer'
import {withRouteGuard} from '@/components/RouteGuard'
import type {Ingredient} from '@/db/types'
import {getAiWebSocket} from '@/services/aiWebSocket'
import {useAppStore} from '@/store/appStore'
import {buildHealthContext, enrichIngredientsWithAllergens} from '@/utils/allergenUtils'
import {CHAT_CFG} from '@/utils/brtcConfig'

function RecipePage() {
  const {activeMember, isOnline, ingredients: storeIngredients} = useAppStore()
  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])

  // 分享启用
  useShareAppMessage(() => ({title: recipeTitle || '查看AI推荐菜谱'}))
  useShareTimeline(() => ({title: recipeTitle || '查看AI推荐菜谱'}))

  const [recipeContent, setRecipeContent] = useState('')
  const [recipeTitle, setRecipeTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [allergenWarning, setAllergenWarning] = useState('')

  // 解析传入的食材
  const ingredients: Ingredient[] = useMemo(() => {
    if (routeParams.ingredients) {
      try {
        return JSON.parse(decodeURIComponent(routeParams.ingredients as string))
      } catch {
        return []
      }
    }
    return storeIngredients
  }, [routeParams.ingredients, storeIngredients])

  const generateRecipe = useCallback(async () => {
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接才能生成菜谱', icon: 'none'})
      return
    }
    if (ingredients.length === 0) {
      Taro.showToast({title: '请先在首页添加食材', icon: 'none'})
      return
    }

    setLoading(true)
    setRecipeContent('')

    const healthCtx = buildHealthContext(activeMember)
    const allergenList = activeMember?.allergens?.length ? `用户过敏源（须规避）：${activeMember.allergens.join('、')}。` : ''
    const prompt = `${healthCtx ? healthCtx + '\n\n' : ''}${allergenList}
请根据以下食材推荐一道适合的菜谱：
${ingredients.map(i => `${i.name} ${i.weight}${i.unit}`).join('\n')}

要求：
1. 给出菜名
2. 列出所需食材及用量
3. 分步骤说明烹饪方法
4. 说明该菜肴的营养特点
5. 不要使用含过敏原的食材
用Markdown格式输出。`

    try {
      const ws = getAiWebSocket()
      await ws.connect({cfg: CHAT_CFG})
      const result = await ws.requestResponse(prompt, {
        onInterim: (text) => setRecipeContent(text)
      })
      ws.disconnect()
      setRecipeContent(result)

      // 提取菜名
      const titleMatch = result.match(/^#\s+(.+)$/m) || result.match(/菜名[：:]\s*(.+)/)
      if (titleMatch) setRecipeTitle(titleMatch[1].trim())

      // 检查过敏源
      const enriched = enrichIngredientsWithAllergens(ingredients, activeMember)
      const warned = enriched.filter(i => i.hasAllergen).map(i => i.allergenName || '').filter(Boolean)
      setAllergenWarning(warned.join('、'))
    } catch (err: any) {
      console.error('菜谱生成失败:', err?.message || err)
      Taro.showToast({title: '菜谱生成失败，请重试', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }, [ingredients, activeMember, isOnline])

  useEffect(() => {
    generateRecipe()
  }, [])

  const handleContinueChat = () => {
    Taro.switchTab({url: '/pages/chat/index'})
  }

  return (
    <div className="min-h-screen bg-background pb-safe-4">
      {/* 头部 */}
      <div className="bg-gradient-primary px-4 py-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="i-mdi-chef-hat text-2xl text-white" />
          <span className="text-2xl font-bold text-white">AI菜谱推荐</span>
        </div>
        <p className="text-xl text-white/80">
          {ingredients.length > 0
            ? `基于${ingredients.map(i => i.name).join('、')}等${ingredients.length}种食材`
            : '根据您的食材智能推荐'}
        </p>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 过敏预警 */}
        {allergenWarning && (
          <div className="flex items-start gap-2 p-3 rounded-xl border" style={{background: '#fff1f2', borderColor: '#ef4444'}}>
            <div className="i-mdi-alert-circle text-2xl flex-shrink-0 mt-0.5" style={{color: '#ef4444'}} />
            <p className="text-xl" style={{color: '#ef4444'}}>含您的过敏原：{allergenWarning}，请谨慎参考</p>
          </div>
        )}

        {/* 菜谱内容 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          {loading && !recipeContent ? (
            <div className="flex flex-col gap-3 py-6">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <div className="i-mdi-chef-hat text-4xl text-primary animate-breathe" />
                </div>
                <p className="text-xl font-medium text-foreground">AI正在为您创建菜谱...</p>
              </div>
              {[80, 60, 90, 70].map((w, i) => (
                <div key={i} className="h-5 bg-secondary rounded-lg animate-breathe" style={{width: `${w}%`, animationDelay: `${i * 0.15}s`}} />
              ))}
            </div>
          ) : recipeContent ? (
            <MarkdownRenderer content={recipeContent} />
          ) : (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="i-mdi-chef-hat text-5xl text-muted-foreground" />
              <p className="text-xl text-muted-foreground">请先在首页添加食材</p>
              <button
                type="button"
                className="flex items-center justify-center leading-none gap-2 text-xl font-medium text-primary border border-primary rounded-xl px-4"
                style={{height: '40px'}}
                onClick={() => Taro.switchTab({url: '/pages/home/index'})}
              >去添加食材</button>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {recipeContent && !loading && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl shadow-elegant"
                style={{height: '48px'}}
                onClick={handleContinueChat}
              >
                <div className="i-mdi-chat-question text-xl" />
                <span>继续咨询</span>
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-medium border-2 border-primary text-primary rounded-xl"
                style={{height: '48px'}}
                onClick={generateRecipe}
              >
                <div className="i-mdi-refresh text-xl" />
                <span>换一个</span>
              </button>
            </div>

            {/* 分享按钮 */}
            <button
              type="button"
              {...(Taro.getEnv() === Taro.ENV_TYPE.WEAPP
                ? {openType: 'share'} as any
                : {onClick: () => Taro.showToast({title: '分享功能仅在微信小程序中可用', icon: 'none'})}
              )}
              className="w-full flex items-center justify-center leading-none gap-2 text-xl font-medium border-2 border-primary/30 bg-primary/5 text-primary rounded-xl"
              style={{height: '48px'}}
            >
              <div className="i-mdi-share-variant text-xl" />
              <span>分享菜谱给朋友</span>
            </button>
          </div>
        )}

        {/* 食材列表 */}
        {ingredients.length > 0 && (
          <div className="bg-secondary rounded-2xl p-4">
            <p className="text-xl font-medium text-foreground mb-3">使用食材</p>
            <div className="flex flex-wrap gap-2">
              {ingredients.map((ing, i) => (
                <span key={i} className="text-xl px-3 py-1 bg-card rounded-lg text-foreground border border-border">
                  {ing.name} {ing.weight}{ing.unit}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </div>
  )
}

export default withRouteGuard(RecipePage)
