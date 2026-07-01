// @title 编辑成员
import {useState, useCallback, useEffect, useMemo} from 'react'
import Taro from '@tarojs/taro'
import {Picker, Image} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {getFamilyMember, createFamilyMember, updateFamilyMember} from '@/db/api'
import {useAppStore} from '@/store/appStore'
import {getAvatarByGender} from '@/utils/avatarUtils'
import type {FamilyMember, GenderType} from '@/db/types'

const CHRONIC_DISEASES = ['高血压', '糖尿病', '高血脂', '痛风', '肾病']
const ALLERGEN_OPTIONS = ['花生', '海鲜', '坚果', '乳制品', '蛋类', '麸质']

function FamilyEditPage() {
  const {user} = useAuth()
  const {refreshMembers} = useAppStore()
  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])
  const memberId = routeParams.id as string | undefined

  const [form, setForm] = useState<Partial<FamilyMember>>({
    nickname: '', gender: 'unknown', chronic_diseases: [], allergens: []
  })
  const [saving, setSaving] = useState(false)

  const loadMember = useCallback(async () => {
    if (!memberId) return
    const data = await getFamilyMember(memberId)
    if (data) setForm(data)
  }, [memberId])

  useEffect(() => { loadMember() }, [loadMember])

  const handleSave = async () => {
    if (!user) return
    if (!form.nickname?.trim()) {
      Taro.showToast({title: '请输入成员昵称', icon: 'none'})
      return
    }
    setSaving(true)
    try {
      if (memberId) {
        await updateFamilyMember(memberId, form)
      } else {
        await createFamilyMember({
          user_id: user.id,
          nickname: form.nickname!.trim(),
          avatar_url: null,
          gender: form.gender || 'unknown',
          age: form.age || null,
          height: form.height || null,
          weight: form.weight || null,
          birthday: form.birthday || null,
          blood_type: form.blood_type || null,
          chronic_diseases: form.chronic_diseases || [],
          allergens: form.allergens || [],
          medications: form.medications || null,
          daily_calorie_goal: form.daily_calorie_goal || null,
          daily_protein_goal: null,
          daily_fat_goal: null,
          daily_carb_goal: null,
          is_primary: false
        })
      }
      await refreshMembers(user.id)
      Taro.showToast({title: memberId ? '更新成功' : '成员已添加', icon: 'success'})
      setTimeout(() => Taro.navigateBack(), 500)
    } finally {
      setSaving(false)
    }
  }

  const toggleDisease = (d: string) => {
    const list = form.chronic_diseases || []
    setForm({...form, chronic_diseases: list.includes(d) ? list.filter(x => x !== d) : [...list, d]})
  }

  const toggleAllergen = (a: string) => {
    const list = form.allergens || []
    setForm({...form, allergens: list.includes(a) ? list.filter(x => x !== a) : [...list, a]})
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 头像区 — 根据性别动态显示卡通头像，预留点击上传框架 */}
        <div className="flex flex-col items-center py-4">
          <div
            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-2"
            style={{backgroundColor: '#E8F5E9'}}
          >
            <Image
              src={getAvatarByGender(form.gender)}
              mode="aspectFill"
              style={{width: '80px', height: '80px'}}
            />
          </div>
          <span className="text-xl text-muted-foreground">头像随性别自动切换</span>
        </div>

        {/* 基础信息 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="i-mdi-account-edit text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">基本信息</span>
          </div>

          {/* 昵称 */}
          <div>
            <p className="text-xl text-muted-foreground mb-2">昵称</p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="请输入成员昵称"
                value={form.nickname || ''}
                onInput={(e) => { const ev = e as any; setForm({...form, nickname: ev.detail?.value ?? ev.target?.value ?? ''}) }}
              />
            </div>
          </div>

          {/* 性别 */}
          <div>
            <p className="text-xl text-muted-foreground mb-2">性别</p>
            <div className="flex gap-2">
              {([['male', '男'], ['female', '女']] as [GenderType, string][]).map(([g, label]) => (
                <button
                  key={g}
                  type="button"
                  className={`flex items-center justify-center leading-none text-xl px-6 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${form.gender === g ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                  style={{height: '40px', ...(form.gender === g ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                  onClick={() => setForm({...form, gender: g})}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* 年龄、身高、体重 */}
          <div className="flex gap-3">
            {[
              {label: '年龄', key: 'age', unit: '岁'},
              {label: '身高', key: 'height', unit: 'cm'},
              {label: '体重', key: 'weight', unit: 'kg'},
            ].map(field => (
              <div key={field.key} className="flex-1">
                <p className="text-xl text-muted-foreground mb-2">{field.label}</p>
                <div className="border-2 border-input rounded-xl px-3 py-3 bg-background">
                  <input
                    className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder={field.unit}
                    value={(form as any)[field.key]?.toString() || ''}
                    onInput={(e) => {
                      const ev = e as any
                      const val = ev.detail?.value ?? ev.target?.value ?? ''
                      setForm({...form, [field.key]: val ? parseFloat(val) : null})
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 生日 */}
          <div>
            <p className="text-xl text-muted-foreground mb-2">生日</p>
            <Picker
              mode="date"
              value={form.birthday || '2000-01-01'}
              onChange={(e) => {
                const ev = e as any
                setForm({...form, birthday: ev.detail?.value || ''})
              }}
            >
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background">
                <span className="text-xl text-foreground">{form.birthday || '点击选择生日'}</span>
              </div>
            </Picker>
          </div>
        </div>

        {/* 慢性病 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-3">
            <div className="i-mdi-heart-pulse text-2xl text-primary" />
            <span className="text-xl font-semibold text-foreground">慢性病</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CHRONIC_DISEASES.map(d => (
              <button
                key={d}
                type="button"
                className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${(form.chronic_diseases || []).includes(d) ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                style={{height: '36px', ...((form.chronic_diseases || []).includes(d) ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                onClick={() => toggleDisease(d)}
              >{d}</button>
            ))}
          </div>
        </div>

        {/* 过敏源 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-3">
            <div className="i-mdi-alert text-2xl text-warning" />
            <span className="text-xl font-semibold text-foreground">过敏源</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_OPTIONS.map(a => (
              <button
                key={a}
                type="button"
                className={`flex items-center justify-center leading-none text-xl px-4 rounded-xl border-2 transition active:opacity-60 active:scale-95 ${(form.allergens || []).includes(a) ? 'border-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                style={{height: '36px', ...((form.allergens || []).includes(a) ? {backgroundColor: '#4A7C59', color: '#333333'} : {})}}
                onClick={() => toggleAllergen(a)}
              >{a}</button>
            ))}
          </div>
        </div>

        {/* 保存 */}
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-xl font-semibold text-white rounded-2xl shadow-elegant ${saving ? 'bg-primary/50' : 'bg-gradient-primary'}`}
          style={{height: '52px'}}
          onClick={handleSave}
        >{saving ? '保存中...' : memberId ? '保存修改' : '添加成员'}</button>
      </div>
    </div>
  )
}

export default withRouteGuard(FamilyEditPage)
