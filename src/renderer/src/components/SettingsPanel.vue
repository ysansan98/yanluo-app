<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

let unsubscribeProgress: (() => void) | null = null

onMounted(async () => {
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
})

onUnmounted(() => {
  unsubscribeProgress?.()
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

// 开始捕获快捷键
async function startCaptureShortcut() {
  emit('update:isCapturingShortcut', true)
  pressedKeys.value = []
  // 禁用全局快捷键，避免冲突
  await window.api.shortcut.disableGlobal()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
}

// 停止捕获
function stopCaptureShortcut() {
  emit('update:isCapturingShortcut', false)
  pressedKeys.value = []
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  // 重新启用全局快捷键
  void window.api.shortcut.enableGlobal()
}

function handleKeyDown(event: KeyboardEvent) {
  event.preventDefault()

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
      'Enter': '↵',
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
  }
}

async function handleKeyUp(event: KeyboardEvent) {
  event.preventDefault()

  if (
    pressedKeys.value.length > 0
    && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)
  ) {
    setTimeout(async () => {
      if (pressedKeys.value.length >= 1) {
        const shortcut = pressedKeys.value.join(' + ')
        emit('update:globalShortcut', shortcut)
        stopCaptureShortcut()
        // 保存快捷键
        await window.api.shortcut.set(shortcut)
      }
    }, 100)
  }
}

// 组件卸载时清理
onUnmounted(() => {
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
            class="h-full bg-gradient-to-r from-yl-accent-400 to-yl-accent-500 transition-all duration-300"
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
          disabled
        >
          <option>默认输入设备（待接入设备列表）</option>
        </select>
        <div class="mt-2 text-xs text-yl-muted-390">
          设备枚举和切换逻辑待接入。
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
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3">
            麦克风：{{ props.micPermissionHint }}
          </div>
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3">
            辅助功能（用于粘贴识别结果）：{{
              props.accessibilityPermissionHint
            }}
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
