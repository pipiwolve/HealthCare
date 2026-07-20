// @title 家庭成员
import {useState, useCallback, useEffect} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Image} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {useAppStore} from '@/store/appStore'
import {withRouteGuard} from '@/components/RouteGuard'
import {getFamilyMembers, deleteFamilyMember} from '@/db/api'
import type {FamilyMember} from '@/db/types'
import {getMemberAvatar} from '@/utils/avatarUtils'

function FamilyPage() {
  const {user} = useAuth()
  const {activeMember, setActiveMemberById, refreshMembers} = useAppStore()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(false)

  const loadMembers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await getFamilyMembers(user.id)
    setMembers(data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadMembers() }, [loadMembers])
  useDidShow(() => { loadMembers() })

  const handleSwitch = async (member: FamilyMember) => {
    await setActiveMemberById(member.id)
    Taro.showToast({title: `已切换至${member.nickname}的档案`, icon: 'success'})
  }

  const handleDelete = async (member: FamilyMember) => {
    if (member.is_primary) {
      Taro.showToast({title: '主用户档案不可删除', icon: 'none'})
      return
    }
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '删除成员',
        content: `确认删除「${member.nickname}」？该成员所有历史记录将一并删除，不可撤销。`,
        confirmColor: '#D9534F',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    await deleteFamilyMember(member.id)
    await refreshMembers(user!.id)
    loadMembers()
    Taro.showToast({title: '成员已删除', icon: 'success'})
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 添加按钮 */}
      <div className="px-4 py-4">
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-2xl shadow-elegant ${members.length >= 10 ? 'bg-primary/50' : ''}`}
          style={{height: '52px'}}
          onClick={() => {
            if (members.length >= 10) {
              Taro.showToast({title: '最多支持10名家庭成员', icon: 'none'})
              return
            }
            Taro.navigateTo({url: '/pages/family-edit/index'})
          }}
        >
          <div className="i-mdi-account-plus text-2xl" />
          <span>添加家庭成员</span>
        </button>
      </div>

      {/* 成员列表 */}
      <div className="px-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1,2].map(i => (
              <div key={i} className="h-24 bg-card rounded-2xl animate-breathe" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-20 h-20 bg-secondary rounded-3xl flex items-center justify-center">
              <div className="i-mdi-account-group text-5xl text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">暂无家庭成员</p>
            <p className="text-xl text-muted-foreground text-center">添加家庭成员后可分别管理健康档案</p>
          </div>
        ) : members.map(member => {
          const isActive = activeMember?.id === member.id
          return (
            <div
              key={member.id}
              className={`bg-card rounded-2xl p-4 shadow-elegant border-2 transition ${isActive ? 'border-primary' : 'border-transparent'}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-secondary">
                  <Image
                    src={getMemberAvatar(member)}
                    mode="aspectFill"
                    style={{width: '56px', height: '56px'}}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-semibold text-foreground">{member.nickname}</p>
                    {member.is_primary && (
                      <span className="text-xl px-2 py-0.5 bg-primary/10 text-primary rounded-lg">主用户</span>
                    )}
                    {isActive && (
                      <span className="text-xl px-2 py-0.5 bg-primary/20 text-primary rounded-lg">当前使用</span>
                    )}
                  </div>
                  <p className="text-xl text-muted-foreground mt-1">
                    {[
                      member.gender === 'male' ? '男' : member.gender === 'female' ? '女' : null,
                      member.age ? `${member.age}岁` : null,
                      member.chronic_diseases?.length ? `${member.chronic_diseases.length}项慢性病` : null,
                      member.allergens?.length ? `${member.allergens.length}种过敏源` : null,
                    ].filter(Boolean).join(' · ') || '健康档案未完善'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-3">
                {!isActive && (
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center leading-none gap-1 text-xl font-medium bg-gradient-primary text-white rounded-xl"
                    style={{height: '40px'}}
                    onClick={() => handleSwitch(member)}
                  >
                    <div className="i-mdi-swap-horizontal text-xl" />
                    <span>切换</span>
                  </button>
                )}
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center leading-none gap-1 text-xl font-medium border-2 border-primary text-primary rounded-xl"
                  style={{height: '40px'}}
                  onClick={() => Taro.navigateTo({url: `/pages/family-edit/index?id=${member.id}`})}
                >
                  <div className="i-mdi-pencil text-xl" />
                  <span>编辑</span>
                </button>
                {!member.is_primary && (
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none w-10 h-10 rounded-xl border-2 border-destructive/30 text-destructive"
                    onClick={() => handleDelete(member)}
                  >
                    <div className="i-mdi-delete-outline text-xl" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default withRouteGuard(FamilyPage)
