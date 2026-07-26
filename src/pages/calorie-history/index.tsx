// @title 历史热量查询

import {useEffect, useRef} from 'react'
import {CalorieHistoryPanel} from '@/components/CalorieHistoryPanel'
import {NutritionMemberSwitcher} from '@/components/NutritionMemberSwitcher'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {useAppStore} from '@/store/appStore'

function CalorieHistoryPage() {
  const {user} = useAuth()
  const {activeMember, loadingMembers, refreshMembers} = useAppStore()
  const requestedMembersForUser = useRef<string | null>(null)

  useEffect(() => {
    if (user && !activeMember && !loadingMembers && requestedMembersForUser.current !== user.id) {
      requestedMembersForUser.current = user.id
      void refreshMembers(user.id)
    }
  }, [activeMember, loadingMembers, refreshMembers, user])

  if (!user) return null

  const calorieGoal = activeMember?.daily_calorie_goal
    || (activeMember?.gender === 'male' ? 2000 : 1600)
    || 1800

  return (
    <div className="min-h-screen bg-background">
      <div
        className="px-4 py-4 flex flex-col gap-4"
        style={{paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))'}}
      >
        <NutritionMemberSwitcher helperText="历史热量和营养目标将同步切换" />
        <CalorieHistoryPanel
          userId={user.id}
          memberId={activeMember?.id || null}
          calorieGoal={calorieGoal}
        />
      </div>
    </div>
  )
}

export default withRouteGuard(CalorieHistoryPage)
