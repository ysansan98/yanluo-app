<script setup lang="ts">
import type { HistoryEntry, MenuItem, MenuKey, TranscriptSource } from './types/ui'
import { computed, onMounted, ref } from 'vue'
import AboutPanel from './components/AboutPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import ComingSoonPanel from './components/ComingSoonPanel.vue'
import HomePage from './components/HomePage.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import WorkbenchPage from './components/WorkbenchPage.vue'
import { useAsrPage } from './composables/useAsrPage'
import { formatDuration } from './utils'

const GLOBAL_SHORTCUT = 'Ctrl + Z'

const menuItems: MenuItem[] = [
  { key: 'home', label: '首页', hint: '统计与最近历史' },
  { key: 'workbench', label: '识别工作台', hint: '录音与文件识别' },
  { key: 'polish', label: '润色指令', hint: '先保留入口' },
  { key: 'provider', label: 'AI 服务商配置', hint: '先保留入口' },
  { key: 'settings', label: '设置', hint: '快捷键 / 麦克风 / 权限' },
  { key: 'about', label: '关于', hint: '版本与反馈入口' },
]

const activeMenu = ref<MenuKey>('home')
const historyEntries = ref<HistoryEntry[]>([])
const resultCardRef = ref<HTMLElement | null>(null)

function addHistory(payload: {
  source: TranscriptSource
  entryType?: 'asr_only' | 'polish'
  commandName?: string | null
  text: string
  language?: string
  elapsedMs: number
  audioPath?: string | null
}): void {
  const text = payload.text.trim()
  if (!text)
    return

  void window.api.history.create({
    source: payload.source,
    entryType: payload.entryType ?? 'asr_only',
    commandName: payload.commandName ?? null,
    text,
    language: payload.language,
    elapsedMs: payload.elapsedMs,
    audioPath: payload.audioPath ?? null,
    triggeredAt: Date.now(),
  }).then((entry) => {
    historyEntries.value = [entry, ...historyEntries.value].slice(0, 200)
  }).catch((error) => {
    console.error('failed to persist history entry', error)
  })
}

function clearHistory(): void {
  void window.api.history.clear().then(() => {
    historyEntries.value = []
  }).catch((error) => {
    console.error('failed to clear history', error)
  })
}

function isToday(timestamp: number): boolean {
  const d = new Date(timestamp)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

// 工具函数已从 composables/useFormatters.ts 导入，不再在此定义

const {
  applyContinueWindowMs,
  checkHealth,
  continueWindowMsInput,
  filePath,
  language,
  liveElapsedMs,
  liveFinalText,
  liveIsRecording,
  livePartialText,
  liveStatus,
  pickAudioFile,
  status,
  toggleLiveRecording,
  transcribe,
} = useAsrPage({
  resultCardRef,
  onTranscriptCreated: addHistory,
})

const todayUsageCount = computed(() => historyEntries.value.filter(item => isToday(item.triggeredAt)).length)
const todayChars = computed(() => historyEntries.value
  .filter(item => isToday(item.triggeredAt))
  .reduce((sum, item) => sum + item.textLength, 0))
const todayAudioDurationMs = computed(() => historyEntries.value
  .filter(item => isToday(item.triggeredAt))
  .reduce((sum, item) => sum + item.elapsedMs, 0))
const totalChars = computed(() => historyEntries.value.reduce((sum, item) => sum + item.textLength, 0))
const totalAudioDurationMs = computed(() => historyEntries.value.reduce((sum, item) => sum + item.elapsedMs, 0))
const recentHistory = computed(() => historyEntries.value.slice(0, 8))

const statCards = computed(() => [
  { label: '今日使用次数', value: String(todayUsageCount.value), tone: 'from-yl-stat-1-from to-yl-stat-1-to' },
  { label: '今日识别字数', value: String(todayChars.value), tone: 'from-yl-stat-2-from to-yl-stat-2-to' },
  { label: '累计识别字数', value: String(totalChars.value), tone: 'from-yl-stat-2-from to-yl-stat-2-to' },
  { label: '今日音频时长', value: formatDuration(todayAudioDurationMs.value), tone: 'from-yl-stat-3-from to-yl-stat-3-to' },
  { label: '累计音频时长', value: formatDuration(totalAudioDurationMs.value), tone: 'from-yl-stat-4-from to-yl-stat-4-to' },
])

const electronVersion = computed(() => window.electron?.process?.versions?.electron ?? '-')
const chromeVersion = computed(() => window.electron?.process?.versions?.chrome ?? '-')
const nodeVersion = computed(() => window.electron?.process?.versions?.node ?? '-')

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

onMounted(() => {
  void window.api.history.list({ limit: 200 }).then((entries) => {
    historyEntries.value = entries
  }).catch((error) => {
    console.error('failed to load history entries', error)
  })
})
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_12%_6%,var(--color-yl-paper-400)_0,var(--color-yl-paper-300)_38%,var(--color-yl-paper-500)_100%)] px-6 pt-12 pb-5 text-yl-ink-900 font-yl-sans">
    <div class="fixed inset-x-0 top-0 z-[60] h-11 bg-transparent [-webkit-app-region:drag]" />
    <div class="pointer-events-none fixed inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_85%_10%,rgba(95,116,162,0.2),rgba(95,116,162,0))]" />
    <div class="pointer-events-none fixed inset-x-0 bottom-0 h-56 bg-[radial-gradient(circle_at_10%_90%,rgba(200,93,58,0.14),rgba(200,93,58,0))]" />
    <div class="relative mx-auto max-w-[1640px] space-y-4">
      <AppSidebar :menu-items="menuItems" :active-menu="activeMenu" @update:active-menu="activeMenu = $event" />

      <main class="space-y-4">
        <HomePage
          v-if="activeMenu === 'home'"
          :stat-cards="statCards"
          :recent-history="recentHistory"
          @clear-history="clearHistory"
        />

        <WorkbenchPage
          v-else-if="activeMenu === 'workbench'"
          :live-status="liveStatus"
          :live-elapsed-ms="liveElapsedMs"
          :live-is-recording="liveIsRecording"
          :live-partial-text="livePartialText"
          :live-final-text="liveFinalText"
          :file-path="filePath"
          :language="language"
          :status="status"
          @update:file-path="filePath = $event"
          @update:language="language = $event"
          @toggle-live-recording="toggleLiveRecording"
          @pick-audio-file="pickAudioFile"
          @transcribe="transcribe"
          @check-health="checkHealth"
        />

        <ComingSoonPanel
          v-else-if="activeMenu === 'polish'"
          title="润色指令"
          description="功能尚未接入，当前仅保留菜单入口。"
          note="规划建议：支持 Prompt 模板库、变量插值、快捷调用和执行历史。"
        />

        <ComingSoonPanel
          v-else-if="activeMenu === 'provider'"
          title="AI 服务商配置"
          description="功能尚未接入，当前仅保留入口。"
          note="规划建议：配置 API Key、模型、超时、重试与回退策略。"
        />

        <SettingsPanel
          v-else-if="activeMenu === 'settings'"
          :global-shortcut="GLOBAL_SHORTCUT"
          :mic-permission-hint="micPermissionHint"
          :accessibility-permission-hint="accessibilityPermissionHint"
          :live-status="liveStatus"
          :continue-window-ms-input="continueWindowMsInput"
          @update:continue-window-ms-input="continueWindowMsInput = $event"
          @apply-continue-window-ms="applyContinueWindowMs"
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
</template>
