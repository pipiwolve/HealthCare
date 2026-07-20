import {useEffect, useMemo, useState} from 'react'
import Taro, {useShareAppMessage, useShareTimeline} from '@tarojs/taro'
import {MarkdownRenderer} from '@/components/MarkdownRenderer'
import {getRecipeShare, type RecipeShareSnapshot} from '@/services/recipeShare'

export default function RecipeSharePage() {
  const shareId = useMemo(() => String(Taro.getCurrentInstance().router?.params?.id || ''), [])
  const [share, setShare] = useState<RecipeShareSnapshot | null>(null)
  const [error, setError] = useState('')

  useShareAppMessage(() => ({
    title: share?.title || '好友分享的 AI 菜谱',
    path: `/pages/recipe-share/index?id=${encodeURIComponent(shareId)}`
  }))
  useShareTimeline(() => ({
    title: share?.title || '好友分享的 AI 菜谱',
    query: `id=${encodeURIComponent(shareId)}`
  }))

  useEffect(() => {
    getRecipeShare(shareId).then(setShare).catch(reason => setError(reason instanceof Error ? reason.message : '菜谱加载失败'))
  }, [shareId])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 gap-4">
        <div className="i-mdi-link-off text-5xl text-muted-foreground" />
        <p className="text-2xl font-semibold text-foreground">{error}</p>
        <button type="button" className="px-5 bg-primary text-white rounded-xl text-xl" style={{height: '44px'}} onClick={() => Taro.reLaunch({url: '/pages/home/index'})}>进入智能健康助手</button>
      </div>
    )
  }
  if (!share) return <div className="min-h-screen bg-background flex items-center justify-center text-xl text-muted-foreground">菜谱加载中...</div>

  return (
    <div className="min-h-screen bg-background pb-safe-4">
      <div className="bg-primary px-5 py-6">
        <p className="text-3xl font-bold text-white">{share.title}</p>
        <p className="text-xl text-white/80 mt-2">好友分享的 AI 营养菜谱</p>
      </div>
      <div className="px-4 py-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <MarkdownRenderer content={share.recipeContent} />
        </div>
        {share.ingredients.length > 0 && (
          <div className="mt-4">
            <p className="text-xl font-semibold text-foreground mb-2">使用食材</p>
            <div className="flex flex-wrap gap-2">
              {share.ingredients.map((item, index) => <span key={index} className="text-xl bg-secondary rounded-lg px-3 py-1">{item.name} {item.weight}{item.unit}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
