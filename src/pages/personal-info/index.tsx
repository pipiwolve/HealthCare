// @title 个人资料
import {useState, useCallback, useEffect, useRef} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {getFamilyMembers, updateFamilyMember, createFamilyMember, deleteAllChatMessages} from '@/db/api'
import {useAppStore} from '@/store/appStore'
import type {FamilyMember, GenderType, BloodType} from '@/db/types'

const CHRONIC_DISEASES = ['高血压', '糖尿病', '高血脂', '痛风', '肾病']
const ALLERGEN_OPTIONS = ['花生', '海鲜', '坚果', '乳制品', '蛋类', '麸质']
const BLOOD_TYPES: BloodType[] = ['A', 'B', 'AB', 'O', 'other']

function PersonalInfoPage() {
  const {user} = useAuth()
  const {activeMember, refreshMembers} = useAppStore()
  const [member, setMember] = useState<Partial<FamilyMember>>({
    gender: 'unknown', chronic_diseases: [], allergens: []
  })
  const [calorieGoalText, setCalorieGoalText] = useState('')
  const [customDisease, setCustomDisease] = useState('')
  const [customAllergen, setCustomAllergen] = useState('')
  const [saving, setSaving] = useState(false)

  const activeMemberRef = useRef(activeMember)
  useEffect(() => { activeMemberRef.current = activeMember }, [activeMember])

  // 只在首次挂载时加载数据（不依赖 activeMember，避免 store 变化触发 re-load 覆盖用户编辑）
  const loadMember = useCallback(async () => {
    if (!user) return
    const cur = activeMemberRef.current
    if (cur) {
      setMember(cur)
      setCalorieGoalText(cur.daily_calorie_goal?.toString() || '')
    } else {
      const members = await getFamilyMembers(user.id)
      const primary = members.find(m => m.is_primary) || members[0]
      if (primary) {
        setMember(primary)
        setCalorieGoalText(primary.daily_calorie_goal?.toString() || '')
      }
    }
  }, [user])

  useEffect(() => { loadMember() }, [loadMember])
  useDidShow(() => { loadMember() })

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const updates = {
        ...member,
        daily_calorie_goal: calorieGoalText ? parseInt(calorieGoalText) : null
      }
      if (member.id) {
        await updateFamilyMember(member.id, updates)
      } else {
        await createFamilyMember({
          user_id: user.id,
          nickname: user.id.slice(0, 8),
          avatar_url: null,
          gender: member.gender || 'unknown',
          age: member.age || null,
          height: member.height || null,
          weight: member.weight || null,
          birthday: member.birthday || null,
          blood_type: member.blood_type || null,
          chronic_diseases: member.chronic_diseases || [],
          allergens: member.allergens || [],
          medications: member.medications || null,
          daily_calorie_goal: calorieGoalText ? parseInt(calorieGoalText) : null,
          daily_protein_goal: member.daily_protein_goal || null,
          daily_fat_goal: member.daily_fat_goal || null,
          daily_carb_goal: member.daily_carb_goal || null,
          is_primary: true
        })
      }
      await refreshMembers(user.id)
      Taro.showToast({title: '保存成功', icon: 'success'})
    } finally {
      setSaving(false)
    }
  }

  const toggleDisease = (d: string) => {
    const list = member.chronic_diseases || []
    setMember({...member, chronic_diseases: list.includes(d) ? list.filter(x => x !== d) : [...list, d]})
  }

  const toggleAllergen = (a: string) => {
    const list = member.allergens || []
    setMember({...member, allergens: list.includes(a) ? list.filter(x => x !== a) : [...list, a]})
  }

  const handleClearData = async () => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '清除健康数据',
        content: '此操作将清除您的所有健康档案数据，不可撤销。确认继续？',
        confirmColor: '#D9534F',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    if (member.id) {
      await updateFamilyMember(member.id, {
        gender: 'unknown', age: null, height: null, weight: null,
        birthday: null, blood_type: null, chronic_diseases: [], allergens: [],
        medications: null, daily_calorie_goal: null
      })
    }
    await refreshMembers(user!.id)
    loadMember()
    Taro.showToast({title: '健康数据已清除', icon: 'success'})
  }

  const handleClearChat = async () => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '清除对话记录',
        content: '将删除所有AI问答历史，此操作不可撤销。',
        confirmColor: '#D9534F',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    await deleteAllChatMessages(user!.id)
    Taro.showToast({title: '对话记录已清除', icon: 'success'})
  }

  // BMI参考热量
  const bmiCalorie = member.height && member.weight && member.gender
    ? Math.round(member.gender === 'male'
        ? (10 * member.weight + 6.25 * member.height - 5 * (member.age || 30) + 5) * 1.55
        : (10 * member.weight + 6.25 * member.height - 5 * (member.age || 30) - 161) * 1.55)
    : null

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 基础信息 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-4">
            <div className="i-mdi-account-circle text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">基础健康信息</span>
          </div>

          {/* 性别 */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <span className="text-xl text-foreground">性别</span>
            <div className="flex gap-2">
              {([['male', '男'], ['female', '女']] as [GenderType, string][]).map(([g, label]) => (
                <button
                  key={g}
                  type="button"
                  className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${member.gender === g ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                  style={{height: '36px', ...(member.gender === g ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                  onClick={() => setMember({...member, gender: g})}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* 年龄、身高、体重 */}
          {[
            {label: '年龄', key: 'age', unit: '岁', type: ''},
            {label: '身高', key: 'height', unit: 'cm', type: ''},
            {label: '体重', key: 'weight', unit: 'kg', type: ''},
          ].map(field => (
            <div key={field.key} className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-xl text-foreground">{field.label}</span>
              <div className="flex items-center gap-2">
                <div className="border border-input rounded-xl px-3 py-2 bg-background">
                  <input
                    className="text-xl text-foreground bg-transparent outline-none text-right"
                    style={{width: '80px'}}
                    placeholder="未设置"
                    value={(member as any)[field.key]?.toString() || ''}
                    onInput={(e) => {
                      const ev = e as any
                      const val = ev.detail?.value ?? ev.target?.value ?? ''
                      setMember({...member, [field.key]: val ? parseFloat(val) : null})
                    }}
                  />
                </div>
                <span className="text-xl text-muted-foreground">{field.unit}</span>
              </div>
            </div>
          ))}

          {/* 生日 */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <span className="text-xl text-foreground">生日</span>
            <Picker
              mode="date"
              value={member.birthday || '2000-01-01'}
              onChange={(e) => {
                const ev = e as any
                setMember({...member, birthday: ev.detail?.value || ''})
              }}
            >
              <span className="text-xl text-primary">{member.birthday || '点击选择'}</span>
            </Picker>
          </div>

          {/* 血型 */}
          <div className="flex items-center justify-between py-3">
            <span className="text-xl text-foreground">血型</span>
            <div className="flex gap-2 flex-wrap justify-end">
              {BLOOD_TYPES.map(bt => (
                <button
                  key={bt}
                  type="button"
                  className={`flex items-center justify-center leading-none text-xl px-3 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${member.blood_type === bt ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                  style={{height: '32px', ...(member.blood_type === bt ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                  onClick={() => setMember({...member, blood_type: bt})}
                >{bt === 'other' ? '特殊' : bt}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 慢性病标签 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-1">
            <div className="i-mdi-heart-pulse text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">慢性病</span>
          </div>
          <p className="text-xl text-muted-foreground mb-3">该信息仅用于个性化营养建议，不用于医疗诊断</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {CHRONIC_DISEASES.map(d => (
              <button
                key={d}
                type="button"
                className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${(member.chronic_diseases || []).includes(d) ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                style={{height: '36px', ...((member.chronic_diseases || []).includes(d) ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                onClick={() => toggleDisease(d)}
              >{d}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 border border-input rounded-xl px-3 py-2 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="其他（手动输入）"
                value={customDisease}
                onInput={(e) => { const ev = e as any; setCustomDisease(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
            <button
              type="button"
              className="flex items-center justify-center leading-none text-xl text-primary border border-primary rounded-xl px-3"
              style={{height: '40px'}}
              onClick={() => {
                if (customDisease.trim()) {
                  toggleDisease(customDisease.trim())
                  setCustomDisease('')
                }
              }}
            >添加</button>
          </div>
        </div>

        {/* 过敏源标签 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-1">
            <div className="i-mdi-alert text-2xl text-warning" />
            <span className="text-xl font-semibold text-foreground">过敏源</span>
          </div>
          <p className="text-xl text-muted-foreground mb-3">设置后，含过敏原食材将自动标红提示</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ALLERGEN_OPTIONS.map(a => (
              <button
                key={a}
                type="button"
                className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${(member.allergens || []).includes(a) ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                style={{height: '36px', ...((member.allergens || []).includes(a) ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                onClick={() => toggleAllergen(a)}
              >{a}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 border border-input rounded-xl px-3 py-2 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="其他过敏源"
                value={customAllergen}
                onInput={(e) => { const ev = e as any; setCustomAllergen(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
            <button
              type="button"
              className="flex items-center justify-center leading-none text-xl text-primary border border-primary rounded-xl px-3"
              style={{height: '40px'}}
              onClick={() => {
                if (customAllergen.trim()) {
                  toggleAllergen(customAllergen.trim())
                  setCustomAllergen('')
                }
              }}
            >添加</button>
          </div>
        </div>

        {/* 正在服用的药物 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-1">
            <div className="i-mdi-pill text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">正在服用的药物</span>
          </div>
          <p className="text-xl text-muted-foreground mb-3">填写后AI将提示可能的食药互作，不用于诊断</p>
          <div className="border border-input rounded-xl px-4 py-3 bg-background">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="例如：二甲双胍、降压药等（换行分隔）"
              value={member.medications || ''}
              style={{minHeight: '80px', resize: 'none'}}
              onInput={(e) => { const ev = e as any; setMember({...member, medications: ev.detail?.value ?? ev.target?.value ?? ''}) }}
            />
          </div>
        </div>

        {/* 每日营养目标 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-4">
            <div className="i-mdi-flag-checkered text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">每日营养目标</span>
          </div>

          {bmiCalorie && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/5 rounded-xl border border-primary/20">
              <div className="i-mdi-lightbulb-outline text-xl text-primary" />
              <p className="text-xl text-primary">根据您的体型，建议每日热量约 {bmiCalorie} kcal</p>
            </div>
          )}

          <div className="flex items-center justify-between py-3 border-b border-border">
            <span className="text-xl text-foreground">每日热量目标</span>
            <div className="flex items-center gap-2">
              <div className="border border-input rounded-xl px-3 py-2 bg-background">
                <input
                  className="text-xl text-foreground bg-transparent outline-none text-right"
                  style={{width: '80px'}}
                  placeholder={String(bmiCalorie || 1800)}
                  value={calorieGoalText}
                  onInput={(e) => { const ev = e as any; setCalorieGoalText(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </div>
              <span className="text-xl text-muted-foreground">kcal</span>
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-xl font-semibold text-white rounded-2xl shadow-elegant ${saving ? 'bg-primary/50' : 'bg-gradient-primary'}`}
          style={{height: '52px'}}
          onClick={handleSave}
        >{saving ? '保存中...' : '保存健康档案'}</button>

        {/* 数据清除 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="i-mdi-delete-outline text-2xl text-destructive" />
            <span className="text-xl font-semibold text-foreground">数据管理</span>
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none text-xl font-medium text-destructive border-2 border-destructive/30 bg-destructive/5 rounded-xl"
            style={{height: '48px'}}
            onClick={handleClearData}
          >清除所有健康数据</button>
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary rounded-xl"
            style={{height: '48px'}}
            onClick={handleClearChat}
          >清除对话记录</button>
        </div>
      </div>
    </div>
  )
}

export default withRouteGuard(PersonalInfoPage)
