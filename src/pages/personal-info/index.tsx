// @title 个人资料
import {useState, useCallback, useEffect, useRef} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {getFamilyMembers, updateFamilyMember, createFamilyMember, updateProfile, deleteAllChatMessages, deleteRtcContexts} from '@/db/api'
import {useAppStore} from '@/store/appStore'
import type {FamilyMember, GenderType, BloodType} from '@/db/types'

const CHRONIC_DISEASES = ['高血压', '糖尿病', '高血脂', '痛风', '肾病']
const ALLERGEN_OPTIONS = ['花生', '海鲜', '坚果', '乳制品', '蛋类', '麸质']
const MEDICATION_OPTIONS = ['二甲双胍', '胰岛素', '阿卡波糖', '氨氯地平', '阿托伐他汀', '华法林']
const BLOOD_TYPES: BloodType[] = ['A', 'B', 'AB', 'O', 'other']

function PersonalInfoPage() {
  const {user, refreshProfile} = useAuth()
  const {activeMember, refreshMembers} = useAppStore()
  const [member, setMember] = useState<Partial<FamilyMember>>({
    gender: 'unknown', chronic_diseases: [], allergens: []
  })
  const [calorieGoalText, setCalorieGoalText] = useState('')
  const [customDisease, setCustomDisease] = useState('')
  const [customAllergen, setCustomAllergen] = useState('')
  const [customMedication, setCustomMedication] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearingChat, setClearingChat] = useState(false)

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
    const nickname = member.nickname?.trim() || ''
    if (!nickname) {
      Taro.showToast({title: '请输入昵称', icon: 'none'})
      return
    }
    if (nickname.length > 20) {
      Taro.showToast({title: '昵称不能超过20个字符', icon: 'none'})
      return
    }

    setSaving(true)
    try {
      const updates = {
        ...member,
        nickname,
        daily_calorie_goal: calorieGoalText ? parseInt(calorieGoalText) : null
      }
      const isPrimaryMember = member.id ? Boolean(member.is_primary) : true
      if (member.id) {
        const saved = await updateFamilyMember(member.id, updates)
        if (!saved) throw new Error('健康档案保存失败')
      } else {
        const created = await createFamilyMember({
          user_id: user.id,
          nickname,
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
        if (!created) throw new Error('健康档案保存失败')
      }
      if (isPrimaryMember) {
        const profileSaved = await updateProfile(user.id, {nickname})
        if (!profileSaved) throw new Error('用户昵称同步失败')
      }
      await Promise.all([
        refreshMembers(user.id),
        isPrimaryMember ? refreshProfile() : Promise.resolve()
      ])
      Taro.showToast({title: '保存成功', icon: 'success'})
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '保存失败', icon: 'none'})
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

  const getMedications = () => (member.medications || '')
    .split(/[,，\n、]/)
    .map(item => item.trim())
    .filter(Boolean)

  const toggleMedication = (medication: string) => {
    const medications = getMedications()
    const next = medications.includes(medication)
      ? medications.filter(item => item !== medication)
      : [...medications, medication]
    setMember({...member, medications: next.join('、')})
  }

  const handleClearData = async () => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '清空当前成员健康档案',
        content: '仅清空当前成员的基础健康信息、慢性病、过敏原、用药和营养目标；不会删除称重历史、食材图片、其他成员或账号。',
        confirmColor: '#2F8552',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    if (member.id) {
      await updateFamilyMember(member.id, {
        gender: 'unknown', age: null, height: null, weight: null,
        birthday: null, blood_type: null, chronic_diseases: [], allergens: [],
        medications: null, daily_calorie_goal: null, daily_protein_goal: null,
        daily_fat_goal: null, daily_carb_goal: null
      })
    }
    await refreshMembers(user!.id)
    loadMember()
    Taro.showToast({title: '当前成员健康档案已清空', icon: 'success'})
  }

  const handleClearChat = async () => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '清除 AI 对话',
        content: '将清除当前账号的 AI 对话上下文和本地对话记录。云服务日志可能仍按服务策略保留，此操作不可撤销。',
        confirmColor: '#2F8552',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    if (!user || clearingChat) return
    setClearingChat(true)
    try {
      await deleteRtcContexts()
      const localDeleted = await deleteAllChatMessages(user.id)
      if (!localDeleted) throw new Error('AI 对话删除失败')
      Taro.showToast({title: 'AI 对话已清除', icon: 'success'})
    } catch (error) {
      console.error('清除 AI 对话失败:', error)
      Taro.showToast({title: '清除失败，请稍后重试', icon: 'none'})
    } finally {
      setClearingChat(false)
    }
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

          {/* 昵称 */}
          <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
            <span className="text-xl text-foreground flex-shrink-0">昵称</span>
            <div className="border border-input rounded-xl px-3 py-2 bg-background" style={{width: '160px', height: '48px', boxSizing: 'border-box'}}>
              <input
                type="text"
                maxLength={20}
                className="w-full text-xl text-foreground bg-transparent outline-none text-right"
                placeholder="请输入昵称"
                value={member.nickname || ''}
                onInput={(e) => {
                  const ev = e as any
                  setMember({...member, nickname: ev.detail?.value ?? ev.target?.value ?? ''})
                }}
              />
            </div>
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
              <div className="flex items-center justify-between" style={{width: '148px'}}>
                <div className="border border-input rounded-xl px-3 py-2 bg-background" style={{width: '108px', height: '48px', boxSizing: 'border-box'}}>
                  <input
                    className="text-xl text-foreground bg-transparent outline-none text-right"
                    style={{width: '100%', height: '100%'}}
                    placeholder="未设置"
                    value={(member as any)[field.key]?.toString() || ''}
                    onInput={(e) => {
                      const ev = e as any
                      const val = ev.detail?.value ?? ev.target?.value ?? ''
                      setMember({...member, [field.key]: val ? parseFloat(val) : null})
                    }}
                  />
                </div>
                <span className="text-xl text-muted-foreground text-left" style={{width: '32px'}}>{field.unit}</span>
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
          <div className="flex flex-wrap gap-2 mb-3">
            {MEDICATION_OPTIONS.map(medication => (
              <button
                key={medication}
                type="button"
                className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${getMedications().includes(medication) ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                style={{height: '36px', ...(getMedications().includes(medication) ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                onClick={() => toggleMedication(medication)}
              >{medication}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 border border-input rounded-xl px-3 py-2 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="其他药物"
                value={customMedication}
                onInput={(e) => { const ev = e as any; setCustomMedication(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
            <button
              type="button"
              className="flex items-center justify-center leading-none text-xl text-primary border border-primary rounded-xl px-3"
              style={{height: '40px'}}
              onClick={() => {
                if (customMedication.trim()) {
                  toggleMedication(customMedication.trim())
                  setCustomMedication('')
                }
              }}
            >添加</button>
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
              <div className="border border-input rounded-xl px-3 py-2 bg-background" style={{width: '120px', height: '48px', boxSizing: 'border-box'}}>
                <input
                  className="text-xl text-foreground bg-transparent outline-none text-right"
                  style={{width: '100%', height: '100%'}}
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
            <div className="i-mdi-delete-outline text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">数据管理</span>
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none text-xl font-medium text-primary border-2 border-primary bg-white rounded-xl"
            style={{height: '48px'}}
            onClick={handleClearData}
          >清空当前成员健康档案</button>
          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary bg-white rounded-xl ${clearingChat ? 'opacity-50' : ''}`}
            style={{height: '48px'}}
            onClick={handleClearChat}
            disabled={clearingChat}
          >{clearingChat ? '清除中...' : '清除 AI 对话'}</button>
        </div>
      </div>
    </div>
  )
}

export default withRouteGuard(PersonalInfoPage)
