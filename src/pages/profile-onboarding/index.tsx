import {useState} from 'react'
import Taro from '@tarojs/taro'
import {Image} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {getFamilyMembers, updateFamilyMember, updateProfile} from '@/db/api'
import {useAppStore} from '@/store/appStore'
import {uploadWechatAvatar} from '@/services/wechatAuth'
import {completeLoginRedirect} from '@/utils/authRedirect'
import {withRouteGuard} from '@/components/RouteGuard'

function ProfileOnboardingPage() {
  const {user, refreshProfile} = useAuth()
  const {refreshMembers} = useAppStore()
  const [nickname, setNickname] = useState('')
  const [avatarPath, setAvatarPath] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChooseAvatar = (event: any) => {
    const path = event?.detail?.avatarUrl
    if (path) setAvatarPath(path)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const avatarUrl = avatarPath ? await uploadWechatAvatar(avatarPath) : undefined
      const updates = {
        ...(nickname.trim() ? {nickname: nickname.trim()} : {}),
        ...(avatarUrl ? {avatar_url: avatarUrl} : {})
      }
      if (Object.keys(updates).length > 0) {
        const saved = await updateProfile(user.id, updates)
        if (!saved) throw new Error('资料保存失败')
        const members = await getFamilyMembers(user.id)
        const primary = members.find(member => member.is_primary)
        if (primary) await updateFamilyMember(primary.id, updates)
        await Promise.all([refreshProfile(), refreshMembers(user.id)])
      }
      completeLoginRedirect()
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '资料保存失败', icon: 'none'})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 pt-10">
      <div className="flex flex-col items-center mb-8">
        <button
          type="button"
          {...({openType: 'chooseAvatar', onChooseAvatar: handleChooseAvatar} as any)}
          className="overflow-hidden border-2 border-primary/30 bg-primary/10 flex items-center justify-center"
          style={{width: '96px', height: '96px', borderRadius: '50%'}}
        >
          {avatarPath
            ? <Image src={avatarPath} mode="aspectFill" style={{width: '96px', height: '96px'}} />
            : <div className="i-mdi-account text-5xl text-primary" />}
        </button>
        <p className="text-xl text-muted-foreground mt-3">选择头像</p>
      </div>
      <div className="mb-6">
        <p className="text-xl text-muted-foreground mb-2">昵称</p>
        <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
          <input
            type="nickname"
            value={nickname}
            placeholder="填写微信昵称"
            className="w-full text-xl text-foreground bg-transparent outline-none"
            onInput={(event) => {
              const value = (event as any).detail?.value ?? (event as any).target?.value ?? ''
              setNickname(value)
            }}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={saving}
        className="w-full flex items-center justify-center text-xl font-semibold bg-primary text-white rounded-xl disabled:opacity-50"
        style={{height: '52px'}}
        onClick={handleSave}
      >{saving ? '保存中...' : '保存并继续'}</button>
      <button
        type="button"
        className="w-full flex items-center justify-center text-xl text-muted-foreground mt-3"
        style={{height: '44px'}}
        onClick={completeLoginRedirect}
      >暂时跳过</button>
    </div>
  )
}

export default withRouteGuard(ProfileOnboardingPage)
