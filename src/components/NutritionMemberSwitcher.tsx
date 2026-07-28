import {Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useCallback, useState} from 'react'
import {useAppStore} from '@/store/appStore'
import {getMemberAvatar} from '@/utils/avatarUtils'

export function NutritionMemberSwitcher({
  helperText = '统计数据和营养目标将同步切换',
}: {
  helperText?: string
}) {
  const {activeMember, familyMembers, loadingMembers, setActiveMemberById} = useAppStore()
  const [showPicker, setShowPicker] = useState(false)
  const [switchingMemberId, setSwitchingMemberId] = useState<string | null>(null)

  const handleSelectMember = useCallback(async (memberId: string) => {
    if (memberId === activeMember?.id) {
      setShowPicker(false)
      return
    }
    setSwitchingMemberId(memberId)
    try {
      await setActiveMemberById(memberId)
      setShowPicker(false)
    } catch (error) {
      console.error('切换营养统计成员失败:', error)
      Taro.showToast({title: '切换成员失败，请重试', icon: 'none'})
    } finally {
      setSwitchingMemberId(null)
    }
  }, [activeMember?.id, setActiveMemberById])

  if (!activeMember) return null

  return (
    <>
      <button
        type="button"
        disabled={loadingMembers || switchingMemberId !== null}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-primary/10 rounded-xl border border-primary/20 disabled:opacity-60"
        onClick={() => setShowPicker(true)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src={getMemberAvatar(activeMember)}
            mode="aspectFill"
            style={{width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0}}
          />
          <span className="text-xl text-primary truncate">当前查看：{activeMember.nickname}</span>
        </div>
        <div className="flex items-center gap-1 text-primary flex-shrink-0">
          <span className="text-xl font-medium">切换</span>
          <div className="i-mdi-chevron-right text-2xl" />
        </div>
      </button>

      {showPicker && (
        <div className="fixed inset-0 flex flex-col justify-end" style={{zIndex: 9999}}>
          <div
            className="absolute inset-0"
            style={{backgroundColor: 'rgba(0,0,0,0.42)'}}
            onClick={() => switchingMemberId === null && setShowPicker(false)}
          />
          <div
            className="relative bg-white flex flex-col"
            style={{maxHeight: '70vh', borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#D8D8D8'}} />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
              <div>
                <p className="text-2xl font-semibold text-foreground">切换查看成员</p>
                <p className="text-xl text-muted-foreground mt-1">{helperText}</p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center"
                style={{width: '40px', height: '40px'}}
                onClick={() => switchingMemberId === null && setShowPicker(false)}
              >
                <div className="i-mdi-close text-2xl text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto px-5">
              {familyMembers.map(member => {
                const selected = member.id === activeMember.id
                const switching = member.id === switchingMemberId
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={switchingMemberId !== null}
                    className="w-full flex items-center justify-between gap-3 py-4 border-b border-border disabled:opacity-60"
                    onClick={() => void handleSelectMember(member.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Image
                        src={getMemberAvatar(member)}
                        mode="aspectFill"
                        style={{width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0}}
                      />
                      <div className="text-left min-w-0">
                        <p className="text-xl font-medium text-foreground truncate">{member.nickname}</p>
                        {member.is_primary && <p className="text-xl text-muted-foreground mt-1">主成员</p>}
                      </div>
                    </div>
                    {switching
                      ? <div className="i-mdi-loading text-2xl text-primary" style={{animation: 'spin 1s linear infinite'}} />
                      : selected && <div className="i-mdi-check text-2xl text-primary" />}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="flex items-center justify-center gap-2 mx-5 mt-3 text-xl font-medium text-primary"
              style={{height: '48px'}}
              onClick={() => {
                setShowPicker(false)
                Taro.navigateTo({url: '/pages/family/index'})
              }}
            >
              <div className="i-mdi-account-multiple-plus text-2xl" />
              <span>管理家庭成员</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
