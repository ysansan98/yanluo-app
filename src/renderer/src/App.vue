<script setup lang="ts">
import type {
  HistoryEntry,
  MenuItem,
  MenuKey,
} from './types/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AboutPanel from './components/AboutPanel.vue'
import AiProviderPanel from './components/AiProviderPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import HomePage from './components/HomePage.vue'
import OnboardingModal from './components/onboarding/OnboardingModal.vue'
import PolishCommandPanel from './components/PolishCommandPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useAsrPage } from './composables/useAsrPage'
import { formatDuration } from './utils'

const globalShortcut = ref('Ctrl + Z')
const isCapturingShortcut = ref(false)

const menuItems: MenuItem[] = [
  { key: 'home', label: '首页', hint: '统计与最近历史' },
  { key: 'polish', label: '润色指令', hint: '语音润色处理' },
  { key: 'provider', label: 'AI 服务商配置', hint: '配置大模型服务商' },
  { key: 'settings', label: '设置', hint: '快捷键 / 麦克风 / 权限' },
  { key: 'about', label: '关于', hint: '版本与反馈入口' },
]

const activeMenu = ref<MenuKey>('home')
const historyEntries = ref<HistoryEntry[]>([])
const resultCardRef = ref<HTMLElement | null>(null)
let unsubscribeHistoryCreated: (() => void) | null = null

// 引导页面状态
const showOnboarding = ref(false)

function clearHistory(): void {
  void window.api.history
    .clear()
    .then(() => {
      historyEntries.value = []
    })
    .catch((error) => {
      console.error('failed to clear history', error)
    })
}

function isToday(timestamp: number): boolean {
  const d = new Date(timestamp)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  )
}

// 工具函数已从 composables/useFormatters.ts 导入，不再在此定义

const todayUsageCount = computed(
  () => historyEntries.value.filter(item => isToday(item.triggeredAt)).length,
)
const todayChars = computed(() =>
  historyEntries.value
    .filter(item => isToday(item.triggeredAt))
    .reduce((sum, item) => sum + item.textLength, 0),
)
const todayAudioDurationMs = computed(() =>
  historyEntries.value
    .filter(item => isToday(item.triggeredAt))
    .reduce((sum, item) => sum + item.elapsedMs, 0),
)
const totalChars = computed(() =>
  historyEntries.value.reduce((sum, item) => sum + item.textLength, 0),
)
const totalAudioDurationMs = computed(() =>
  historyEntries.value.reduce((sum, item) => sum + item.elapsedMs, 0),
)
const recentHistory = computed(() => historyEntries.value.slice(0, 8))

const statCards = computed(() => [
  {
    label: '今日使用次数',
    value: String(todayUsageCount.value),
    tone: 'from-yl-stat-1-from to-yl-stat-1-to',
  },
  {
    label: '今日识别字数',
    value: String(todayChars.value),
    tone: 'from-yl-stat-2-from to-yl-stat-2-to',
  },
  {
    label: '累计识别字数',
    value: String(totalChars.value),
    tone: 'from-yl-stat-2-from to-yl-stat-2-to',
  },
  {
    label: '今日音频时长',
    value: formatDuration(todayAudioDurationMs.value),
    tone: 'from-yl-stat-3-from to-yl-stat-3-to',
  },
  {
    label: '累计音频时长',
    value: formatDuration(totalAudioDurationMs.value),
    tone: 'from-yl-stat-4-from to-yl-stat-4-to',
  },
])

const electronVersion = computed(
  () => window.electron?.process?.versions?.electron ?? '-',
)
const chromeVersion = computed(
  () => window.electron?.process?.versions?.chrome ?? '-',
)
const nodeVersion = computed(
  () => window.electron?.process?.versions?.node ?? '-',
)

const {
  applyContinueWindowMs,
  continueWindowMsInput,
  liveStatus,
  vadEnabled,
  vadThresholdInput,
  vadMinSpeechMsInput,
  vadRedemptionMsInput,
  vadMinDurationMsInput,
  applyVadConfig,
} = useAsrPage({
  resultCardRef,
  onTranscriptCreated: () => {},
})

const micPermissionHint = computed(() => {
  if (liveStatus.value.toLowerCase().includes('permission'))
    return liveStatus.value
  return '待接入检测'
})

const accessibilityPermissionHint = computed(() => {
  if (liveStatus.value.toLowerCase().includes('accessibility'))
    return liveStatus.value
  return '待接入检测'
})

onMounted(async () => {
  // 获取当前快捷键
  const shortcut = await window.api.shortcut.get()
  if (shortcut) {
    globalShortcut.value = shortcut
  }

  void window.api.history
    .list({ limit: 200 })
    .then((entries) => {
      historyEntries.value = entries
    })
    .catch((error) => {
      console.error('failed to load history entries', error)
    })

  // 监听引导页面显示事件
  window.api.app.onShowOnboarding(() => {
    showOnboarding.value = true
  })

  // 监听模型缺失提示
  window.api.app.onModelRequired(() => {
    showDialog({
      title: '模型未下载',
      content: '使用语音输入需要下载 ASR 模型（约 300MB）',
      actions: [
        {
          label: '去设置下载',
          primary: true,
          callback: () => {
            showOnboarding.value = false
            activeMenu.value = 'settings'
          },
        },
        { label: '取消', callback: () => {} },
      ],
    })
  })

  // 监听快捷键缺失提示
  window.api.app.onShortcutRequired(() => {
    showDialog({
      title: '未设置快捷键',
      content: '使用语音输入前需要先设置快捷键',
      actions: [
        {
          label: '去设置',
          primary: true,
          callback: () => {
            activeMenu.value = 'settings'
          },
        },
        { label: '取消', callback: () => {} },
      ],
    })
  })

  // 监听历史记录创建事件，实时更新首页列表
  unsubscribeHistoryCreated = window.api.history.onCreated((entry) => {
    historyEntries.value.unshift(entry)
  })
})

onUnmounted(() => {
  unsubscribeHistoryCreated?.()
})

// 简单的对话框实现
interface DialogAction {
  label: string
  primary?: boolean
  callback: () => void
}

interface DialogOptions {
  title: string
  content: string
  actions: DialogAction[]
}

const dialog = ref<DialogOptions | null>(null)
const showDialogRef = ref(false)

function showDialog(options: DialogOptions) {
  dialog.value = options
  showDialogRef.value = true
}

function closeDialog() {
  showDialogRef.value = false
  dialog.value = null
}
</script>

<template>
  <div
    class="min-h-screen px-6 pt-12 pb-5 text-yl-ink-900 font-yl-sans"
    style="--yl-sticky-offset: 80px;"
  >
    <div
      class="fixed inset-x-0 top-0 z-60 h-11 bg-transparent [-webkit-app-region:drag]"
    />
    <div class="relative mx-auto max-w-410 space-y-4">
      <AppSidebar
        :menu-items="menuItems"
        :active-menu="activeMenu"
        @update:active-menu="activeMenu = $event"
      />

      <main class="space-y-4">
        <HomePage
          v-if="activeMenu === 'home'"
          :stat-cards="statCards"
          :recent-history="recentHistory"
          @clear-history="clearHistory"
        />

        <PolishCommandPanel
          v-else-if="activeMenu === 'polish'"
          @switch-menu="activeMenu = $event as MenuKey"
        />

        <AiProviderPanel v-else-if="activeMenu === 'provider'" />

        <SettingsPanel
          v-else-if="activeMenu === 'settings'"
          :global-shortcut="globalShortcut"
          :is-capturing-shortcut="isCapturingShortcut"
          :mic-permission-hint="micPermissionHint"
          :accessibility-permission-hint="accessibilityPermissionHint"
          :live-status="liveStatus"
          :continue-window-ms-input="continueWindowMsInput"
          :vad-enabled="vadEnabled"
          :vad-threshold-input="vadThresholdInput"
          :vad-min-speech-ms-input="vadMinSpeechMsInput"
          :vad-redemption-ms-input="vadRedemptionMsInput"
          :vad-min-duration-ms-input="vadMinDurationMsInput"
          @update:global-shortcut="globalShortcut = $event"
          @update:is-capturing-shortcut="isCapturingShortcut = $event"
          @update:continue-window-ms-input="continueWindowMsInput = $event"
          @apply-continue-window-ms="applyContinueWindowMs"
          @update:vad-enabled="vadEnabled = $event"
          @update:vad-threshold-input="vadThresholdInput = $event"
          @update:vad-min-speech-ms-input="vadMinSpeechMsInput = $event"
          @update:vad-redemption-ms-input="vadRedemptionMsInput = $event"
          @update:vad-min-duration-ms-input="vadMinDurationMsInput = $event"
          @apply-vad-config="applyVadConfig"
        />

        <AboutPanel
          v-else
          :electron-version="electronVersion"
          :chrome-version="chromeVersion"
          :node-version="nodeVersion"
        />
      </main>
    </div>
  </div>

  <!-- 引导页面 -->
  <OnboardingModal v-if="showOnboarding" @close="showOnboarding = false" />

  <!-- 提示对话框 -->
  <div
    v-if="showDialogRef && dialog"
    class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click="closeDialog"
  >
    <div class="w-100 bg-white rounded-2xl shadow-2xl p-6" @click.stop>
      <h3 class="text-lg font-bold text-yl-ink-700 mb-2">
        {{ dialog.title }}
      </h3>
      <p class="text-sm text-yl-muted-500 mb-6">
        {{ dialog.content }}
      </p>
      <div class="flex justify-end gap-2">
        <button
          v-for="action in dialog.actions"
          :key="action.label"
          class="px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            action.primary
              ? 'bg-yl-accent-500 text-white hover:bg-yl-accent-600'
              : 'bg-yl-paper-200 text-yl-ink-600 hover:bg-yl-paper-300'
          "
          @click="
            action.callback();
            closeDialog();
          "
        >
          {{ action.label }}
        </button>
      </div>
    </div>
  </div>
</template>
