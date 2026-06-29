// @title 智能健康助手

import {Image} from '@tarojs/components'
import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useRef, useState } from 'react'
import {supabase} from '@/client/supabase'
import {AllergenBanner, DisclaimerFooter} from '@/components/AllergenBanner'
import {DisclaimerModal} from '@/components/DisclaimerModal'
import {MarkdownRenderer} from '@/components/MarkdownRenderer'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {createWeighingRecord, getDevices, getWeighingRecords, updateProfile } from '@/db/api'
import type {Ingredient, WeighingRecord } from '@/db/types'
import {getAiWebSocket} from '@/services/aiWebSocket'
import {useAppStore} from '@/store/appStore'
import {buildHealthContext, enrichIngredientsWithAllergens } from '@/utils/allergenUtils'
import {buildFoodRecognitionPrompt, parseRecognizedFoods} from '@/utils/aiPromptHelpers'
import {bleMockService} from '@/utils/bleMock'
import type {WeightUnit} from '@/utils/bleService'
import {bleService} from '@/utils/bleService'
import {CHAT_CFG, VOICE_CFG} from '@/utils/brtcConfig'

function HomePage() {
  const {user, profile, refreshProfile} = useAuth()
  const {
    activeMember, refreshMembers,
    bleStatus, setBLEStatus, batteryLevel, setBatteryLevel,
    currentWeight, setCurrentWeight, weightUnit, setWeightUnit,
    isWeightStable, setIsWeightStable,
    ingredients, addIngredient, removeIngredient, clearIngredients,
    personCount, setPersonCount, isOnline
  } = useAppStore()

  const [showDisclaimer, setShowDisclaimer] = useState(false)

  const [foodName, setFoodName] = useState('')
  const [manualWeight, setManualWeight] = useState('')
  // 拍照识别后暂存图片URL，添加食材时一并写入；手动输入时为null
  const [currentIngredientImageUrl, setCurrentIngredientImageUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [history, setHistory] = useState<WeighingRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllergenBanner, setShowAllergenBanner] = useState(true)
  const [allergenWarning, setAllergenWarning] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [historyRefreshing, setHistoryRefreshing] = useState(false)
  const [connectedDeviceName, setConnectedDeviceName] = useState('')
  const [showAnalysisContent, setShowAnalysisContent] = useState(true)
  const recorderManager = useRef<Taro.RecorderManager | null>(null)

  // 检查免责声明；已同意过的用户直接标记 confirmed 允许 BLE 初始化
  useEffect(() => {
    if (!profile) return
    if (profile.has_seen_disclaimer) {
      // 已同意过 — 直接允许 BLE 初始化
      disclaimerConfirmedRef.current = true
    } else {
      setShowDisclaimer(true)
    }
  }, [profile])

  // 用 ref 持有最新版 tryConnectDevice，避免 loadData 与其产生循环依赖
  const tryConnectDeviceRef = useRef<(deviceId: string) => Promise<void>>(async () => {})

  // 标记 disclaimer 已确认，确保 BLE 初始化不在隐私弹窗期间触发系统权限弹窗
  const disclaimerConfirmedRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!user) return
    await refreshMembers(user.id)
    const records = await getWeighingRecords(user.id, activeMember?.id)
    setHistory(records)
    // 仅当 disclaimer 已确认后才尝试连接设备，避免与隐私弹窗同时触发系统权限弹窗
    if (!disclaimerConfirmedRef.current) return
    const devices = await getDevices(user.id)
    // 监听未运行时启动监听（不受 bleStatus 限制）
    if (!bleService.isListening) {
      if (devices.length > 0) {
        setConnectedDeviceName(devices[0].device_name || '')
        tryConnectDeviceRef.current(devices[0].device_id)
      }
    } else if (devices.length > 0) {
      setConnectedDeviceName(devices[0].device_name || '')
    }
  }, [user, activeMember?.id, refreshMembers])

  useEffect(() => { loadData() }, [loadData])
  useDidShow(() => {
    bleService.setCallbacks({
      onWeightUpdate: (weight, stable, unit) => {
        setCurrentWeight(weight)
        setIsWeightStable(stable)
        setWeightUnit(unit as WeightUnit)
      },
      onConnectionChange: (connected) => {
        setBLEStatus(connected ? 'connected' : 'disconnected')
      },
      onDeviceNameUpdate: (name) => {
        if (name) setConnectedDeviceName(name)
      },
    })
    loadData()
  })

  const tryConnectDevice = useCallback(async (deviceId: string) => {
    setBLEStatus('connecting')
    const isMock = deviceId === '__mock__'
    const service = isMock ? bleMockService : bleService
    service.setCallbacks({
      onWeightUpdate: (weight, stable, unit) => {
        setCurrentWeight(weight)
        setIsWeightStable(stable)
        setWeightUnit(unit as WeightUnit)
      },
      onBatteryUpdate: (level) => {
        setBatteryLevel(level)
      },
      onConnectionChange: (connected) => {
        setBLEStatus(connected ? 'connected' : 'disconnected')
      },
      onDeviceNameUpdate: (name) => {
        if (name) setConnectedDeviceName(name)
      },
    })
    if (isMock) {
      await service.connect(deviceId)
      setBLEStatus('connected')
      setBatteryLevel(80)
      setCurrentWeight(150)
    } else {
      const ok = await bleService.init()
      if (ok) {
        await bleService.connect(deviceId)
      } else {
        setBLEStatus('disconnected')
      }
    }
  }, [setBLEStatus, setCurrentWeight, setBatteryLevel, setIsWeightStable, setWeightUnit])

  // 同步最新 tryConnectDevice 到 ref
  useEffect(() => {
    tryConnectDeviceRef.current = tryConnectDevice
  }, [tryConnectDevice])

  // 过敏源预警检查
  useEffect(() => {
    const enriched = enrichIngredientsWithAllergens(ingredients, activeMember)
    const warned = enriched.filter(i => i.hasAllergen).map(i => i.allergenName || '').filter(Boolean)
    setAllergenWarning(warned.join('、'))
    setShowAllergenBanner(true)
  }, [ingredients, activeMember])

  const handleAddIngredient = () => {
    if (!foodName.trim()) {
      Taro.showToast({title: '请输入食材名称', icon: 'none'})
      return
    }
    const w = bleStatus === 'connected' ? currentWeight : parseFloat(manualWeight)
    if (!w || w <= 0) {
      Taro.showToast({title: '请输入有效重量', icon: 'none'})
      return
    }
    const base = {name: foodName.trim(), weight: w, unit: weightUnit, image_url: currentIngredientImageUrl ?? null}
    const enriched = enrichIngredientsWithAllergens([base], activeMember)
    addIngredient(enriched[0])
    setFoodName('')
    setManualWeight('')
    setCurrentIngredientImageUrl(null)
  }

  // 读取文件为base64（小程序专用）
  const readFileAsBase64 = (filePath: string): Promise<{base64: string; size: number}> => {
    return new Promise((resolve, reject) => {
      const fs = Taro.getFileSystemManager()
      fs.getFileInfo({
        filePath,
        success: (info) => {
          fs.readFile({
            filePath,
            encoding: 'base64',
            success: (res) => resolve({base64: res.data as string, size: info.size}),
            fail: reject
          })
        },
        fail: reject
      })
    })
  }

  // 读取图片为带前缀的base64
  const readImageAsBase64 = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fs = Taro.getFileSystemManager()
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg'
          const mimeMap: Record<string, string> = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'}
          const mime = mimeMap[ext] || 'image/jpeg'
          resolve(`data:${mime};base64,${res.data}`)
        },
        fail: reject
      })
    })
  }

  const handleVoiceInput = () => {
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接', icon: 'none'})
      return
    }
    if (isRecording) return

    recorderManager.current = Taro.getRecorderManager()
    recorderManager.current.onStart(() => setIsRecording(true))
    recorderManager.current.onStop(async (res) => {
      setIsRecording(false)
      if (!res.tempFilePath) return
      setRecognizing(true)
      const ws = getAiWebSocket()
      try {
        await ws.connect({cfg: VOICE_CFG})
        const {base64} = await readFileAsBase64(res.tempFilePath)
        const buffer = Taro.base64ToArrayBuffer(base64)
        ws.sendAudio(buffer)
        const text = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => { unsub(); reject(new Error('ASR timeout')) }, 15000)
          const unsub = ws.onMessage('asr-final', (data) => {
            clearTimeout(timeout)
            unsub()
            resolve(data as string)
          })
        })
        if (text.trim()) {
          setFoodName(text.trim())
          Taro.showToast({title: '识别成功，请确认', icon: 'success'})
        } else {
          Taro.showToast({title: '未能识别，请重试或手动输入', icon: 'none'})
        }
      } catch {
        Taro.showToast({title: '未能识别，请重试或手动输入', icon: 'none'})
      } finally {
        ws.disconnect()
        setRecognizing(false)
      }
    })
    recorderManager.current.start({duration: 10000, format: 'PCM' as any, sampleRate: 16000, numberOfChannels: 1, frameSize: 640})
  }

  const handleStopVoice = () => {
    recorderManager.current?.stop()
  }

  const handlePhotoRecognize = async () => {
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接', icon: 'none'})
      return
    }
    try {
      const res = await Taro.chooseMedia({count: 1, mediaType: ['image'], sourceType: ['album', 'camera']})
      if (!res.tempFiles?.[0]) return
      setRecognizing(true)

      // Step 1: 压缩图片
      Taro.showLoading({title: '图片压缩中...'})
      let compressedPath = res.tempFiles[0].tempFilePath
      try {
        const compressRes = await Taro.compressImage({src: compressedPath, quality: 80})
        compressedPath = compressRes.tempFilePath
      } catch {
        // 压缩失败降级到原图
      }

      // Step 2: 读取 base64
      const base64Image = await readImageAsBase64(compressedPath)
      const ext = compressedPath.split('.').pop()?.toLowerCase() || 'jpg'

      // Step 3: 识别食材 & 上传图片 并发执行
      Taro.showLoading({title: '识别并上传中...'})

      const ws = getAiWebSocket()
      const [recognizeResult, uploadResult] = await Promise.allSettled([
        (async () => {
          await ws.connect({mode: 'default'})
          const result = await ws.requestImageResponse({
            triggerText: buildFoodRecognitionPrompt('trigger'),
            imageBase64: base64Image,
            fileName: `food.${ext}`,
            finalText: buildFoodRecognitionPrompt('final')
          })
          ws.disconnect()
          return result
        })(),
        supabase.functions.invoke('upload-food-image', {body: {image: base64Image, ext}})
      ])

      Taro.hideLoading()

      // 处理上传结果
      let uploadedImageUrl: string | null = null
      if (uploadResult.status === 'fulfilled' && !uploadResult.value.error) {
        uploadedImageUrl = uploadResult.value.data?.url || null
      }

      // 处理识别结果
      if (recognizeResult.status === 'rejected') {
        throw recognizeResult.reason
      }
      const raw = recognizeResult.value
      const foods = parseRecognizedFoods(raw)
      if (foods.length > 0) {
        setFoodName(foods[0])
        setCurrentIngredientImageUrl(uploadedImageUrl)
        Taro.showToast({title: `识别到：${foods.slice(0, 3).join('、')}`, icon: 'none'})
      } else {
        setCurrentIngredientImageUrl(null)
        Taro.showToast({title: '未识别到食材，请光线充足正面拍摄', icon: 'none'})
      }
    } catch (err: any) {
      Taro.hideLoading()
      setCurrentIngredientImageUrl(null)
      console.error('拍照识别失败:', err?.message || err)
      Taro.showToast({title: '识别失败，请重新拍摄', icon: 'none'})
    } finally {
      setRecognizing(false)
    }
  }

  const handleAnalyze = async (targetIngredients?: Ingredient[]) => {
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接，无法使用AI分析', icon: 'none'})
      return
    }
    const list = targetIngredients || ingredients
    if (list.length === 0) {
      Taro.showToast({title: '请先添加食材', icon: 'none'})
      return
    }
    setIsAnalyzing(true)
    setAnalysisResult('')
    setShowAnalysisContent(true)
    const healthCtx = buildHealthContext(activeMember)
    const prompt = `${healthCtx ? healthCtx + '\n\n' : ''}请分析以下食材的营养成分（供${personCount}人食用）：\n${list.map(i => `${i.name} ${i.weight}${i.unit}`).join('\n')}\n\n\u3010输出要求\u3011请先在回复开头输出一个JSON代码块，包含以下字段：\n\`\`\`json\n{"calories":数值,"protein":数值,"fat":数值,"carbs":数值}\n\`\`\`\n其中calories单位为kcal，protein/fat/carbs单位为g。然后用Markdown格式输出详细分析。`

    try {
      const ws = getAiWebSocket()
      await ws.connect({cfg: CHAT_CFG})
      const result = await ws.requestResponse(prompt, {
        onInterim: (text) => {
          setAnalysisResult(text.replace(/```json[\s\S]*?```\s*/g, '').trimStart())
        }
      })
      ws.disconnect()
      const cleanResult = result.replace(/```json[\s\S]*?```\s*/g, '').trimStart()
      setAnalysisResult(cleanResult)

      let parsed: {calories?: number; protein?: number; fat?: number; carbs?: number} = {}

      const jsonBlock = result.match(/```json\s*([\s\S]*?)```/)
      if (jsonBlock) {
        try {
          parsed = JSON.parse(jsonBlock[1].trim())
        } catch {
          parsed = {}
        }
      }

      const caloriesRe = /(?:热量|总热量|能量)[线\s|：:\uff1a]*(?:约\s*)?([\d.]+)\s*(?:kcal|千卡|大卡|Cal|cal)/i
      const proteinRe = /(?:蛋白质)[线\s|：:\uff1a]*(?:约\s*)?([\d.]+)\s*g/i
      const fatRe = /(?:脂肪|脂坊)[线\s|：:\uff1a]*(?:约\s*)?([\d.]+)\s*g/i
      const carbsRe = /(?:碳水[化合物]?|碳水)[线\s|：:\uff1a]*(?:约\s*)?([\d.]+)\s*g/i

      const caloriesMatch = !parsed.calories ? result.match(caloriesRe) : null
      const proteinMatch = !parsed.protein ? result.match(proteinRe) : null
      const fatMatch = !parsed.fat ? result.match(fatRe) : null
      const carbsMatch = !parsed.carbs ? result.match(carbsRe) : null

      await createWeighingRecord({
        user_id: user!.id,
        member_id: activeMember?.id || null,
        ingredients: list,
        person_count: personCount,
        analysis_result: cleanResult,
        total_calories: parsed.calories ?? (caloriesMatch ? parseFloat(caloriesMatch[1]) : null),
        protein: parsed.protein ?? (proteinMatch ? parseFloat(proteinMatch[1]) : null),
        fat: parsed.fat ?? (fatMatch ? parseFloat(fatMatch[1]) : null),
        carbs: parsed.carbs ?? (carbsMatch ? parseFloat(carbsMatch[1]) : null),
      })

      const records = await getWeighingRecords(user!.id, activeMember?.id)
      setHistory(records)
    } catch (err: any) {
      console.error('AI分析失败:', err?.message || err)
      Taro.showToast({title: '分析失败，请检查网络后重试', icon: 'none'})
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGoToRecipe = (items: Ingredient[]) => {
    const encoded = encodeURIComponent(JSON.stringify(items))
    Taro.navigateTo({url: `/pages/recipe/index?ingredients=${encoded}`})
  }

  const handleContinueChat = () => {
    Taro.switchTab({url: '/pages/chat/index'})
  }

  const bleStatusColor = bleStatus === 'connected' ? 'bg-primary' : bleStatus === 'connecting' ? 'bg-warning animate-breathe' : 'bg-muted-foreground'
  const bleStatusText = bleStatus === 'connected'
    ? '接收中'
    : bleStatus === 'connecting'
      ? '搜索中...'
      : '未接收'

  const weightDisplay = bleStatus !== 'connected' ? '--' : String(currentWeight)
  const weightTextClass = !isWeightStable
    ? 'text-white font-bold animate-breathe'
    : 'text-white font-bold'

  return (
    <div className="min-h-screen bg-background">
      <DisclaimerModal
        visible={showDisclaimer}
        onAgree={async () => {
          setShowDisclaimer(false)
          if (user) await updateProfile(user.id, {has_seen_disclaimer: true})
          await refreshProfile()
          disclaimerConfirmedRef.current = true
          loadData()
        }}
      />

      {/* 过敏预警 */}
      {allergenWarning && showAllergenBanner && (
        <AllergenBanner allergenNames={allergenWarning} onClose={() => setShowAllergenBanner(false)} />
      )}

      <div className="px-4 py-4 pb-tabbar flex flex-col gap-4">
        {/* 称重卡片 */}
        <div className="bg-gradient-primary rounded-2xl p-5 shadow-elegant">
          {/* 顶部：连接状态 + 单位切换 */}
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex items-center gap-2"
              onClick={() => Taro.navigateTo({url: '/pages/device-manager/index'})}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${bleStatusColor}`} />
              <span className="text-xl text-white/80">{bleStatusText}</span>
              {bleStatus === 'connected' && connectedDeviceName ? (
                <span className="text-xl text-white/70">· {connectedDeviceName}</span>
              ) : activeMember && bleStatus === 'connected' ? (
                <span className="text-xl text-white/70">· {activeMember.nickname}</span>
              ) : null}
              {batteryLevel > 0 && bleStatus === 'connected' && (
                <div className="flex items-center gap-1 ml-1">
                  <div className="i-mdi-battery text-xl text-white/70" />
                  <span className="text-xl text-white/70">{batteryLevel}%</span>
                </div>
              )}
            </div>
            {/* 单位切换 */}
            <div className="flex gap-1">
              {(['g', 'oz', 'lb', 'ml'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  className={`flex items-center justify-center leading-none text-xl rounded-lg px-2 transition active:scale-95 ${weightUnit === u ? 'bg-white text-primary font-semibold' : 'text-white/70'}`}
                  style={{height: '32px'}}
                  onClick={() => setWeightUnit(u as WeightUnit)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* 稳定状态行 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isWeightStable ? 'bg-white' : 'bg-white/40 animate-breathe'}`} />
              <span className="text-xl text-white/70">
                {isWeightStable ? '已稳定' : '稳定中...'}
              </span>
            </div>
          </div>

          {/* 重量显示 */}
          <div className="flex items-end justify-center gap-2 py-4">
            <span
              className={weightTextClass}
              style={{fontSize: '64px', lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}
            >
              {weightDisplay}
            </span>
            {bleStatus === 'connected' && (
              <span className="text-white/80 text-2xl mb-3">{weightUnit}</span>
            )}
          </div>

          {/* 连接设备按钮（未连接时显示） */}
          {bleStatus !== 'connected' && (
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-medium rounded-xl border-2 border-white/40 text-white active:scale-95 active:opacity-80 transition"
                style={{height: '44px'}}
                onClick={() => Taro.navigateTo({url: '/pages/device-add/index'})}
              >
                <div className="i-mdi-bluetooth-connect text-xl" />
                <span>连接设备</span>
              </button>
            </div>
          )}
        </div>

        {/* 食材录入区 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center gap-2 mb-3">
            <div className="i-mdi-food text-2xl text-primary" />
            <span className="text-2xl font-semibold text-foreground">添加食材</span>
          </div>

          <div className="flex flex-col gap-3">
            {/* 食材名称输入 */}
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-background flex items-center gap-3">
              <input
                className="flex-1 text-xl text-foreground bg-transparent outline-none"
                placeholder="食材名称（如：西红柿）"
                value={foodName}
                onInput={(e) => { const ev = e as any; setFoodName(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
              {/* 语音按钮 */}
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${isRecording ? 'bg-destructive animate-breathe' : recognizing ? 'bg-primary/50' : 'bg-primary'}`}
                onTouchStart={handleVoiceInput}
                onTouchEnd={handleStopVoice}
              >
                <div className="i-mdi-microphone text-2xl text-white" />
              </div>
              {/* 拍照按钮 */}
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary flex-shrink-0"
                onClick={handlePhotoRecognize}
              >
                <div className="i-mdi-camera text-2xl text-primary" />
              </div>
            </div>

            {/* 重量输入（设备未连接时显示） */}
            {bleStatus !== 'connected' && (
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="手动输入重量 (g)"
                  value={manualWeight}
                  onInput={(e) => { const ev = e as any; setManualWeight(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </div>
            )}

            {bleStatus === 'connected' && (
              <div className="flex items-center gap-2 px-2">
                <div className="i-mdi-weight text-xl text-muted-foreground" />
                <span className="text-xl text-muted-foreground">当前重量：{currentWeight.toFixed(1)} {weightUnit}</span>
              </div>
            )}

            <button
              type="button"
              className="w-full flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl shadow-elegant"
              style={{height: '48px'}}
              onClick={handleAddIngredient}
            >
              <div className="i-mdi-plus text-2xl" />
              <span>添加食材</span>
            </button>
          </div>
        </div>

        {/* 用餐人数 */}
        {ingredients.length > 0 && (
          <div className="bg-card rounded-2xl px-4 py-3 shadow-elegant flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="i-mdi-account-group text-2xl text-primary" />
              <span className="text-xl text-foreground">用餐人数</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className={`flex items-center justify-center leading-none w-10 h-10 rounded-full border-2 text-2xl font-semibold transition ${personCount <= 1 ? 'border-border text-muted-foreground' : 'border-primary text-primary'}`}
                onClick={() => personCount > 1 && setPersonCount(personCount - 1)}
              >-</button>
              <span className="text-2xl font-bold text-foreground w-8 text-center">{personCount}</span>
              <button
                type="button"
                className={`flex items-center justify-center leading-none w-10 h-10 rounded-full border-2 text-2xl font-semibold transition ${personCount >= 20 ? 'border-border text-muted-foreground' : 'border-primary text-primary'}`}
                onClick={() => personCount < 20 && setPersonCount(personCount + 1)}
              >+</button>
            </div>
          </div>
        )}

        {/* 食材列表 */}
        {ingredients.length > 0 && (
          <div className="bg-card rounded-2xl p-4 shadow-elegant">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-semibold text-foreground">食材列表</span>
              <button
                type="button"
                className="flex items-center justify-center leading-none text-xl text-destructive"
                onClick={clearIngredients}
              >清空</button>
            </div>
            <div className="flex flex-col gap-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className={`flex items-center gap-3 py-3 px-3 rounded-xl ${ing.hasAllergen ? 'bg-destructive/10 border border-destructive/30' : 'bg-secondary'}`}>
                  <div
                    className="flex-shrink-0 overflow-hidden"
                    style={{width: '48px', height: '48px', borderRadius: '50%'}}
                  >
                    {ing.image_url ? (
                      <Image
                        src={ing.image_url}
                        mode="aspectFill"
                        style={{width: '48px', height: '48px'}}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center bg-gradient-primary"
                        style={{width: '48px', height: '48px'}}
                      >
                        <span className="text-white font-semibold" style={{fontSize: '18px'}}>
                          {ing.name.slice(0, 1)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-medium text-foreground">{ing.name}</span>
                      {ing.hasAllergen && <div className="i-mdi-alert-circle text-xl" style={{color: '#ef4444'}} />}
                    </div>
                    <span className="text-xl text-muted-foreground">{ing.weight} {ing.unit}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none px-3 text-xl font-medium bg-primary rounded-lg"
                      style={{height: '32px', color: '#333333'}}
                      onClick={() => handleAnalyze([ing])}
                    >分析</button>
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none px-3 text-xl font-medium border-2 border-primary text-primary rounded-lg"
                      style={{height: '32px', color: 'var(--color-primary, #4A7C59)'}}
                      onClick={() => handleGoToRecipe([ing])}
                    >菜谱</button>
                    <div className="i-mdi-delete-outline text-2xl text-muted-foreground" onClick={() => removeIngredient(idx)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl shadow-elegant"
                style={{height: '48px'}}
                onClick={() => handleAnalyze()}
              >
                <div className="i-mdi-chart-line text-2xl" />
                <span>综合营养分析</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-center leading-none gap-2 text-xl font-semibold border-2 border-primary text-primary rounded-xl px-4"
                style={{height: '48px'}}
                onClick={() => handleGoToRecipe(ingredients)}
              >
                <div className="i-mdi-chef-hat text-2xl" />
              </button>
            </div>
          </div>
        )}

        {/* 分析结果 */}
        {(isAnalyzing || analysisResult) && (
          <div id="analysis-result" className="bg-card rounded-2xl p-4 shadow-elegant">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-chart-donut text-2xl text-primary" />
                <span className="text-2xl font-semibold text-foreground">营养分析结果</span>
              </div>
              {!isAnalyzing && analysisResult && (
                <button
                  type="button"
                  className="flex items-center justify-center leading-none p-1 active:opacity-70"
                  onClick={() => setShowAnalysisContent(v => !v)}
                >
                  <div
                    className="i-mdi-chevron-down text-2xl text-muted-foreground"
                    style={{transform: showAnalysisContent ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s'}}
                  />
                </button>
              )}
            </div>

            {isAnalyzing && !analysisResult ? (
              <div className="flex flex-col gap-3 py-4">
                {[1,2,3].map(i => (
                  <div key={i} className="h-6 bg-secondary rounded-lg animate-breathe" />
                ))}
                <p className="text-xl text-muted-foreground text-center">AI分析中，请稍候...</p>
              </div>
            ) : showAnalysisContent ? (
              <>
                {isAnalyzing && (
                  <p className="text-xl text-muted-foreground mb-3">AI分析中，正在生成...</p>
                )}
                {allergenWarning && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl mb-3 border border-red-400">
                    <div className="i-mdi-alert-circle text-2xl flex-shrink-0 mt-0.5" style={{color: '#ef4444'}} />
                    <p className="text-xl" style={{color: '#ef4444'}}>含您的过敏原：{allergenWarning}，请谨慎食用</p>
                  </div>
                )}
                <MarkdownRenderer content={analysisResult} />
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl"
                    style={{height: '44px'}}
                    onClick={handleContinueChat}
                  >
                    <div className="i-mdi-chat-question text-xl" />
                    <span>继续咨询</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none gap-2 text-xl font-semibold border-2 border-primary text-primary rounded-xl px-4"
                    style={{height: '44px'}}
                    onClick={() => handleGoToRecipe(ingredients)}
                  >
                    <div className="i-mdi-chef-hat text-xl" />
                    <span>菜谱</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* 历史记录 */}
        <div className="bg-card rounded-2xl p-4 shadow-elegant">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-2 flex-1"
              onClick={() => setShowHistory(!showHistory)}
            >
              <div className="i-mdi-history text-2xl text-primary" />
              <span className="text-2xl font-semibold text-foreground">称重历史</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center justify-center leading-none p-1"
                onClick={async (e) => {
                  e.stopPropagation()
                  if (historyRefreshing || !user) return
                  setHistoryRefreshing(true)
                  try {
                    const records = await getWeighingRecords(user.id, activeMember?.id)
                    setHistory(records)
                    setShowHistory(true)
                    Taro.showToast({title: '已刷新', icon: 'success', duration: 1200})
                  } finally {
                    setHistoryRefreshing(false)
                  }
                }}
              >
                <div className={`i-mdi-refresh text-2xl text-muted-foreground transition ${historyRefreshing ? 'opacity-40' : 'active:text-primary'}`} />
              </button>
              <div
                className="i-mdi-chevron-down text-2xl text-muted-foreground"
                style={{transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s'}}
                onClick={() => setShowHistory(!showHistory)}
              />
            </div>
          </div>

          {showHistory && (
            <div className="flex flex-col gap-3 mt-3">
              {historyRefreshing ? (
                <p className="text-xl text-muted-foreground text-center py-6">刷新中...</p>
              ) : history.length === 0 ? (
                <p className="text-xl text-muted-foreground text-center py-6">暂无称重记录</p>
              ) : history.map(record => {
                const allIngs = record.ingredients as Ingredient[]
                const displayIngs = allIngs.slice(0, 3)
                const extraCount = allIngs.length > 3 ? allIngs.length - 2 : 0
                return (
                  <div key={record.id} className="bg-white rounded-xl overflow-hidden" style={{borderRadius: '12px', padding: '12px', marginBottom: '0'}}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-muted-foreground" style={{fontSize: '12px'}}>
                        {new Date(record.created_at).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}
                      </span>
                      {record.total_calories != null && (
                        <span className="font-bold text-foreground" style={{fontSize: '14px'}}>
                          {record.total_calories.toFixed(0)} kcal
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2 mb-3">
                      {displayIngs.map((ing: Ingredient, i: number) => {
                        const isLast = i === 2 && extraCount > 0
                        return (
                          <div key={i} className="flex flex-col items-center" style={{width: '64px'}}>
                            <div className="relative" style={{width: '64px', height: '64px'}}>
                              {ing.image_url ? (
                                <Image
                                  src={ing.image_url}
                                  mode="aspectFill"
                                  style={{width: '64px', height: '64px', borderRadius: '8px', display: 'block'}}
                                />
                              ) : (
                                <div
                                  className="flex items-center justify-center bg-secondary"
                                  style={{width: '64px', height: '64px', borderRadius: '8px'}}
                                >
                                  <span className="text-muted-foreground font-medium" style={{fontSize: '13px'}}>
                                    {ing.name.slice(0, 2)}
                                  </span>
                                </div>
                              )}
                              {isLast && (
                                <div
                                  className="absolute bottom-0 right-0 flex items-center justify-center bg-black/60"
                                  style={{borderRadius: '0 0 8px 0', borderTopLeftRadius: '6px', minWidth: '22px', height: '22px', paddingLeft: '4px', paddingRight: '4px'}}
                                >
                                  <span className="text-white font-semibold" style={{fontSize: '11px'}}>+{extraCount}</span>
                                </div>
                              )}
                            </div>
                            <span
                              className="text-muted-foreground mt-1 text-center"
                              style={{fontSize: '11px', width: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block'}}
                            >{ing.name}</span>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="w-full flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary bg-white rounded-xl transition active:bg-secondary"
                      style={{height: '36px'}}
                      onClick={() => {
                        if (record.analysis_result) {
                          setAnalysisResult(record.analysis_result)
                          setShowAnalysisContent(true)
                          setTimeout(() => {
                            Taro.pageScrollTo({selector: '#analysis-result', duration: 300, offsetTop: -16})
                          }, 100)
                        }
                      }}
                    >查看完整分析</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <DisclaimerFooter />
    </div>
  )
}

export default withRouteGuard(HomePage)
