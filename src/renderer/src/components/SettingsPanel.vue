<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { MIC_DEVICE_STORAGE_KEY } from '../constants/audio'
import AppActionButton from './AppActionButton.vue'

interface Props {
  globalShortcut: string
  isCapturingShortcut?: boolean
  micPermissionHint: string
  accessibilityPermissionHint: string
  liveStatus: string
  continueWindowMsInput: string
  vadEnabled: boolean
  vadThresholdInput: string
  vadMinSpeechMsInput: string
  vadRedemptionMsInput: string
  vadMinDurationMsInput: string
}

type PermissionStatus = 'GRANTED' | 'DENIED' | 'NOT_DETERMINED' | 'RESTRICTED'
type PermissionKind = 'MICROPHONE' | 'ACCESSIBILITY'

interface MicrophoneDevice {
  deviceId: string
  label: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:globalShortcut': [value: string]
  'update:isCapturingShortcut': [value: boolean]
  'update:continueWindowMsInput': [value: string]
  'applyContinueWindowMs': []
  'update:vadEnabled': [value: boolean]
  'update:vadThresholdInput': [value: string]
  'update:vadMinSpeechMsInput': [value: string]
  'update:vadRedemptionMsInput': [value: string]
  'update:vadMinDurationMsInput': [value: string]
  'applyVadConfig': []
}>()

// 模型管理状态
interface DownloadProgress {
  type: string
  filename?: string
  downloaded?: number
  total?: number
  percent?: number
}

const modelExists = ref(false)
const isDownloading = ref(false)
const downloadProgress = ref<DownloadProgress>({ type: '' })
const modelDir = ref('')
const microphoneDevices = ref<MicrophoneDevice[]>([])
const selectedMicDeviceId = ref('')
const isLoadingMicrophones = ref(false)
const microphoneError = ref('')
const micPermissionStatus = ref<PermissionStatus>('NOT_DETERMINED')
const accessibilityPermissionStatus = ref<PermissionStatus>('NOT_DETERMINED')
const isCheckingPermissions = ref(false)
const isRequestingPermission = ref<PermissionKind | null>(null)
const permissionError = ref('')

let unsubscribeProgress: (() => void) | null = null

function getPermissionLabel(status: PermissionStatus, fallback: string): string {
  switch (status) {
    case 'GRANTED':
      return '已授权'
    case 'DENIED':
      return '已拒绝'
    case 'RESTRICTED':
      return '受限'
    case 'NOT_DETERMINED':
      return '未授权'
    default:
      return fallback
  }
}

const micPermissionHintText = computed(() =>
  getPermissionLabel(micPermissionStatus.value, props.micPermissionHint),
)

const accessibilityPermissionHintText = computed(() =>
  getPermissionLabel(
    accessibilityPermissionStatus.value,
    props.accessibilityPermissionHint,
  ),
)

async function refreshPermissionStatus(): Promise<void> {
  isCheckingPermissions.value = true
  permissionError.value = ''
  try {
    const [microphone, accessibility] = await Promise.all([
      window.api.permission.check('MICROPHONE'),
      window.api.permission.check('ACCESSIBILITY'),
    ])
    micPermissionStatus.value = microphone
    accessibilityPermissionStatus.value = accessibility
  }
  catch (error) {
    console.error('Failed to check permissions:', error)
    permissionError.value = '权限状态获取失败，请稍后重试'
  }
  finally {
    isCheckingPermissions.value = false
  }
}

async function requestPermission(kind: PermissionKind): Promise<void> {
  isRequestingPermission.value = kind
  permissionError.value = ''
  try {
    const status = await window.api.permission.request(kind)
    if (kind === 'MICROPHONE') {
      micPermissionStatus.value = status
      await refreshMicrophoneDevices({ requestAccess: status === 'GRANTED' })
    }
    else {
      accessibilityPermissionStatus.value = status
    }
  }
  catch (error) {
    console.error(`Failed to request ${kind} permission:`, error)
    permissionError.value = '权限请求失败，请前往系统设置手动开启'
  }
  finally {
    isRequestingPermission.value = null
  }
}

async function refreshMicrophoneDevices(options?: {
  requestAccess?: boolean
}): Promise<void> {
  isLoadingMicrophones.value = true
  microphoneError.value = ''
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      microphoneError.value = '当前环境不支持麦克风设备枚举'
      return
    }

    if (!navigator.mediaDevices.getUserMedia) {
      microphoneError.value = '当前环境不支持麦克风访问'
      return
    }

    if (options?.requestAccess) {
      // 在用户主动操作时申请一次音频流，保证设备 label 可读取。
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      stream.getTracks().forEach(track => track.stop())
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices
      .filter(device => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `麦克风 ${index + 1}`,
      }))

    microphoneDevices.value = audioInputs

    if (!audioInputs.find(device => device.deviceId === selectedMicDeviceId.value)) {
      selectedMicDeviceId.value = ''
      localStorage.removeItem(MIC_DEVICE_STORAGE_KEY)
    }

    if (options?.requestAccess && micPermissionStatus.value !== 'GRANTED') {
      micPermissionStatus.value = 'GRANTED'
    }
  }
  catch (error) {
    console.error('Failed to enumerate microphone devices:', error)
    microphoneDevices.value = []
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      micPermissionStatus.value = 'DENIED'
      microphoneError.value = '未获得麦克风权限，请先授权'
    }
    else {
      microphoneError.value = '获取麦克风设备失败，请重试'
    }
  }
  finally {
    isLoadingMicrophones.value = false
  }
}

function handleMicrophoneSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  selectedMicDeviceId.value = value
  if (!value) {
    localStorage.removeItem(MIC_DEVICE_STORAGE_KEY)
    return
  }
  localStorage.setItem(MIC_DEVICE_STORAGE_KEY, value)
}

function handleWindowFocus(): void {
  void refreshPermissionStatus()
}

onMounted(async () => {
  selectedMicDeviceId.value = localStorage.getItem(MIC_DEVICE_STORAGE_KEY) ?? ''

  // 获取模型信息
  const info = await window.api.asr.modelInfo()
  modelExists.value = info.exists
  modelDir.value = info.modelDir

  // 订阅下载进度
  unsubscribeProgress = window.api.asr.onDownloadProgress((progress) => {
    downloadProgress.value = progress

    if (progress.type === 'start') {
      isDownloading.value = true
    }
    else if (progress.type === 'complete') {
      isDownloading.value = false
      modelExists.value = true
    }
    else if (progress.type === 'error') {
      isDownloading.value = false
    }
  })

  await refreshPermissionStatus()
  await refreshMicrophoneDevices()
  window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  unsubscribeProgress?.()
  window.removeEventListener('focus', handleWindowFocus)
})

async function startDownload() {
  try {
    const result = await window.api.asr.downloadModel()
    if (result.status === 'exists') {
      modelExists.value = true
    }
  }
  catch (error) {
    console.error('Download failed:', error)
  }
}

const downloadedMB = computed(() => {
  const bytes = downloadProgress.value.downloaded || 0
  return (bytes / 1024 / 1024).toFixed(1)
})

const totalMB = computed(() => {
  const bytes = downloadProgress.value.total || 0
  return (bytes / 1024 / 1024).toFixed(1)
})

// 快捷键捕获状态
const pressedKeys = ref<string[]>([])
// 记录完整的快捷键组合（用于在keyup时保存）
let pendingShortcut: string | null = null

// 开始捕获快捷键
async function startCaptureShortcut() {
  emit('update:isCapturingShortcut', true)
  pressedKeys.value = []
  pendingShortcut = null
  // 禁用全局快捷键，避免冲突
  await window.api.shortcut.disableGlobal()
  // 使用 capture 阶段确保能捕获到系统快捷键
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
}

// 停止捕获
function stopCaptureShortcut() {
  emit('update:isCapturingShortcut', false)
  pressedKeys.value = []
  pendingShortcut = null
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
  // 重新启用全局快捷键
  void window.api.shortcut.enableGlobal()
}

// 保存待定的快捷键
async function savePendingShortcut() {
  if (pendingShortcut) {
    const shortcut = pendingShortcut
    emit('update:globalShortcut', shortcut)
    stopCaptureShortcut()
    await window.api.shortcut.set(shortcut)
  }
}

function handleKeyDown(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  const keys: string[] = []

  if (event.ctrlKey)
    keys.push('Ctrl')
  if (event.altKey)
    keys.push('Alt')
  if (event.shiftKey)
    keys.push('Shift')
  if (event.metaKey)
    keys.push('Cmd')

  const key = event.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': 'Return',
      'Tab': 'Tab',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    }
    keys.push(keyMap[key] || key.toUpperCase())
  }

  if (keys.length > 0) {
    pressedKeys.value = keys
    // 记录完整的快捷键组合（用于后续保存）
    pendingShortcut = keys.join(' + ')
  }
}

async function handleKeyUp(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  // 获取被松开的键名
  const releasedKey = event.key

  // 将 event.key 映射到我们的键名
  const keyMapping: Record<string, string> = {
    Control: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Meta: 'Cmd',
  }

  const mappedKey = keyMapping[releasedKey]

  // 从 pressedKeys 中移除被松开的键
  if (mappedKey) {
    pressedKeys.value = pressedKeys.value.filter(k => k !== mappedKey)
  }
  else {
    // 普通键被松开（非修饰键）
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': '↵',
      'Tab': 'Tab',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    }
    const normalizedKey = keyMap[releasedKey] || releasedKey.toUpperCase()
    pressedKeys.value = pressedKeys.value.filter(k => k !== normalizedKey)
  }

  // 当所有键都松开时，保存快捷键
  if (pressedKeys.value.length === 0 && pendingShortcut) {
    const shortcut = pendingShortcut
    emit('update:globalShortcut', shortcut)
    stopCaptureShortcut()
    // 保存快捷键
    await window.api.shortcut.set(shortcut)
  }
}

// 组件卸载时清理
onUnmounted(() => {
  if (pendingShortcut) {
    // 如果有待保存的快捷键，先保存（keyup 事件可能没有被触发）
    void savePendingShortcut()
  }
  if (props.isCapturingShortcut) {
    stopCaptureShortcut()
  }
})
</script>

<template>
  <section class="space-y-4">
    <section
      class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
    >
      <div class="text-2xl font-bold text-yl-ink-700">
        设置
      </div>
      <div class="mt-1 text-sm text-yl-muted-500">
        全局快捷键、麦克风选择、权限检测。
      </div>
    </section>

    <!-- 模型管理卡片：仅在未下载或下载中时显示 -->
    <section
      v-if="!modelExists || isDownloading"
      class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
    >
      <div class="text-base font-bold text-yl-ink-650">
        模型管理
      </div>

      <!-- 未下载状态 -->
      <div v-if="!modelExists && !isDownloading" class="mt-3 space-y-3">
        <div class="flex items-center gap-2 text-sm text-orange-600">
          <span class="text-lg">⚠️</span>
          <span>模型未下载，无法使用语音输入功能</span>
        </div>
        <div class="text-xs text-yl-muted-400">
          模型大小约 300MB，下载后可离线使用
        </div>
        <AppActionButton variant="primary" @click="startDownload">
          立即下载
        </AppActionButton>
      </div>

      <!-- 下载中状态 -->
      <div v-else-if="isDownloading" class="mt-3 space-y-3">
        <div class="text-sm text-yl-ink-500">
          正在下载:
          <span class="text-yl-ink-700">{{
            downloadProgress.filename || "准备中..."
          }}</span>
        </div>

        <!-- 进度条 -->
        <div class="h-2 bg-yl-paper-300 rounded-full overflow-hidden">
          <div
            class="h-full bg-linear-to-r from-yl-accent-400 to-yl-accent-500 transition-all duration-300"
            :style="{ width: `${downloadProgress.percent || 0}%` }"
          />
        </div>

        <!-- 进度数字 -->
        <div class="flex justify-between text-xs text-yl-muted-400">
          <span>{{ downloadedMB }} MB / {{ totalMB }} MB</span>
          <span>{{ downloadProgress.percent || 0 }}%</span>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-2 gap-4">
      <article
        class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
      >
        <div class="text-base font-bold text-yl-ink-650">
          全局快捷键
        </div>

        <!-- 快捷键显示/捕获区域 -->
        <div
          class="mt-3 rounded-xl border-2 p-4 text-center cursor-pointer transition-all select-none"
          :class="{
            'border-yl-brand-500 bg-yl-brand-50 ring-2 ring-yl-brand-100': props.isCapturingShortcut,
            'border-yl-line-200 bg-yl-paper-250 hover:border-yl-brand-300': !props.isCapturingShortcut,
          }"
          @click="!props.isCapturingShortcut && startCaptureShortcut()"
        >
          <!-- 捕获中状态 -->
          <template v-if="props.isCapturingShortcut">
            <div class="flex items-center justify-center gap-2">
              <kbd
                v-for="key in pressedKeys"
                :key="key"
                class="px-3 py-1.5 bg-white border-2 border-yl-brand-400 rounded-lg text-base font-mono shadow-sm animate-pulse"
              >
                {{ key }}
              </kbd>
              <span v-if="pressedKeys.length === 0" class="text-yl-muted-400">
                按下快捷键组合...
              </span>
            </div>
            <p class="text-xs text-yl-muted-400 mt-2">
              按住组合键后松开即可确认
            </p>
          </template>

          <!-- 显示当前快捷键 -->
          <template v-else>
            <div class="flex items-center justify-center gap-2">
              <kbd
                v-for="key in (props.globalShortcut || '未设置').split(' + ')"
                :key="key"
                class="px-4 py-2 bg-white border border-yl-line-300 rounded-lg text-base font-mono shadow-sm"
              >
                {{ key }}
              </kbd>
            </div>
            <p class="text-xs text-yl-brand-500 mt-2">
              点击修改快捷键
            </p>
          </template>
        </div>

        <!-- 取消按钮 -->
        <div v-if="props.isCapturingShortcut" class="mt-2 flex gap-2">
          <AppActionButton
            variant="outline"
            size="sm"
            class="flex-1"
            @click="stopCaptureShortcut"
          >
            取消
          </AppActionButton>
        </div>
      </article>

      <article
        class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
      >
        <div class="text-base font-bold text-yl-ink-650">
          麦克风选择
        </div>
        <select
          class="mt-2 w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm text-yl-ink-450"
          :value="selectedMicDeviceId"
          :disabled="isLoadingMicrophones || microphoneDevices.length === 0"
          @change="handleMicrophoneSelect"
        >
          <option value="">
            系统默认输入设备
          </option>
          <option
            v-for="device in microphoneDevices"
            :key="device.deviceId"
            :value="device.deviceId"
          >
            {{ device.label }}
          </option>
        </select>
        <div class="mt-2 flex items-center gap-2">
          <AppActionButton
            variant="outline"
            size="sm"
            :loading="isLoadingMicrophones"
            @click="refreshMicrophoneDevices({ requestAccess: true })"
          >
            刷新设备
          </AppActionButton>
          <span class="text-xs text-yl-muted-390">
            {{ microphoneDevices.length }} 个可用输入设备
          </span>
        </div>
        <div v-if="microphoneError" class="mt-2 text-xs text-red-500">
          {{ microphoneError }}
        </div>
      </article>
    </section>

    <section class="grid grid-cols-2 gap-4">
      <article
        class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
      >
        <div class="text-base font-bold text-yl-ink-650">
          权限检测
        </div>
        <div class="mt-2 space-y-2 text-sm text-yl-ink-450">
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span>麦克风：{{ micPermissionHintText }}</span>
              <AppActionButton
                variant="outline"
                size="sm"
                :loading="isRequestingPermission === 'MICROPHONE'"
                @click="requestPermission('MICROPHONE')"
              >
                请求授权
              </AppActionButton>
            </div>
          </div>
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span>辅助功能（用于粘贴识别结果）：{{ accessibilityPermissionHintText }}</span>
              <AppActionButton
                variant="outline"
                size="sm"
                :loading="isRequestingPermission === 'ACCESSIBILITY'"
                @click="requestPermission('ACCESSIBILITY')"
              >
                请求授权
              </AppActionButton>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <AppActionButton
              variant="outline"
              size="sm"
              :loading="isCheckingPermissions"
              @click="refreshPermissionStatus"
            >
              重新检测
            </AppActionButton>
          </div>
          <div v-if="permissionError" class="text-xs text-red-500">
            {{ permissionError }}
          </div>
        </div>
      </article>

      <article
        class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
      >
        <div class="text-base font-bold text-yl-ink-650">
          录音参数
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450">Continue Window(ms)</label>
          <input
            :value="props.continueWindowMsInput"
            class="w-32 rounded-lg border border-yl-line-300 bg-white px-2.5 py-1.5 text-sm"
            @input="
              emit(
                'update:continueWindowMsInput',
                ($event.target as HTMLInputElement).value,
              )
            "
          >
          <AppActionButton
            variant="outline"
            size="sm"
            @click="emit('applyContinueWindowMs')"
          >
            应用
          </AppActionButton>
        </div>
        <div class="mt-2 text-xs text-yl-muted-390">
          当前状态：{{ props.liveStatus }}
        </div>
      </article>
    </section>

    <article
      class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card"
    >
      <div class="flex items-center justify-between">
        <div class="text-base font-bold text-yl-ink-650">
          语音活动检测 (VAD)
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <span class="text-sm text-yl-ink-450">启用</span>
          <input
            type="checkbox"
            :checked="props.vadEnabled"
            class="w-4 h-4 rounded"
            @change="
              emit(
                'update:vadEnabled',
                ($event.target as HTMLInputElement).checked,
              )
            "
          >
        </label>
      </div>

      <div
        class="mt-4 space-y-3"
        :class="{ 'opacity-50 pointer-events-none': !props.vadEnabled }"
      >
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450 w-32">检测阈值</label>
          <input
            :value="props.vadThresholdInput"
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            class="w-40"
            @input="
              emit(
                'update:vadThresholdInput',
                ($event.target as HTMLInputElement).value,
              )
            "
          >
          <span class="text-sm text-yl-ink-450 w-12">{{
            props.vadThresholdInput
          }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450 w-32">最小语音时长(ms)</label>
          <input
            :value="props.vadMinSpeechMsInput"
            type="number"
            min="50"
            max="2000"
            step="50"
            class="w-24 rounded-lg border border-yl-line-300 bg-white px-2 py-1 text-sm"
            @input="
              emit(
                'update:vadMinSpeechMsInput',
                ($event.target as HTMLInputElement).value,
              )
            "
          >
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450 w-32">恢复时长(ms)</label>
          <input
            :value="props.vadRedemptionMsInput"
            type="number"
            min="50"
            max="2000"
            step="50"
            class="w-24 rounded-lg border border-yl-line-300 bg-white px-2 py-1 text-sm"
            @input="
              emit(
                'update:vadRedemptionMsInput',
                ($event.target as HTMLInputElement).value,
              )
            "
          >
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450 w-32">最小时长(ms)</label>
          <input
            :value="props.vadMinDurationMsInput"
            type="number"
            min="100"
            max="2000"
            step="100"
            class="w-24 rounded-lg border border-yl-line-300 bg-white px-2 py-1 text-sm"
            @input="
              emit(
                'update:vadMinDurationMsInput',
                ($event.target as HTMLInputElement).value,
              )
            "
          >
        </div>

        <div class="flex items-center gap-2 pt-2">
          <AppActionButton
            variant="outline"
            size="sm"
            @click="emit('applyVadConfig')"
          >
            应用 VAD 设置
          </AppActionButton>
        </div>
      </div>

      <div class="mt-3 text-xs text-yl-muted-390">
        VAD 可以自动过滤静音和背景噪音，避免无效识别。
      </div>
    </article>
  </section>
</template>
