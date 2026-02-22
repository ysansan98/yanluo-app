<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppActionButton from '../AppActionButton.vue'

const emit = defineEmits<{
  complete: []
}>()

interface DownloadProgress {
  type: string
  filename?: string
  downloaded?: number
  total?: number
  percent?: number
}

// 状态：'idle' | 'checking' | 'downloading' | 'completed'
const status = ref<'idle' | 'checking' | 'downloading' | 'completed'>('idle')
const downloadProgress = ref<DownloadProgress>({ type: '' })
const error = ref('')

let unsubscribeProgress: (() => void) | null = null

onMounted(async () => {
  // 只检查一次状态，显示给用户看，但不自动触发完成
  status.value = 'checking'
  try {
    const info = await window.api.asr.modelInfo()
    if (info.exists) {
      status.value = 'completed'
      // 不自动 emit，让用户自己点击"下一步"
    }
    else {
      status.value = 'idle'
    }
  }
  catch {
    status.value = 'idle'
  }

  // 订阅下载进度
  unsubscribeProgress = window.api.asr.onDownloadProgress((progress) => {
    downloadProgress.value = progress

    if (progress.type === 'start') {
      status.value = 'downloading'
      error.value = ''
    }
    else if (progress.type === 'complete') {
      status.value = 'completed'
      // 下载完成，自动进入下一步
      emit('complete')
    }
    else if (progress.type === 'error') {
      status.value = 'idle'
      error.value = progress.message || '下载失败，请检查网络连接后重试'
    }
  })
})

onUnmounted(() => {
  unsubscribeProgress?.()
})

async function startDownload() {
  try {
    error.value = ''
    const result = await window.api.asr.downloadModel()
    if (result.status === 'exists') {
      status.value = 'completed'
      emit('complete')
    }
    // 'running' 或 'ok' 会触发 onDownloadProgress
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : '下载失败，请重试'
    status.value = 'idle'
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
</script>

<template>
  <div class="space-y-8">
    <!-- 检查中 -->
    <div v-if="status === 'checking'" class="text-center py-12">
      <div
        class="inline-block w-10 h-10 border-3 border-yl-brand-500 border-t-transparent rounded-full animate-spin"
      />
      <p class="text-yl-muted-500 mt-6 text-base">
        正在检查模型状态...
      </p>
    </div>

    <!-- 已完成状态（用户点击下载或原本就有） -->
    <div
      v-else-if="status === 'completed'"
      class="rounded-3xl bg-yl-success-50 border-2 border-yl-success-100 p-4"
    >
      <div class="flex items-center gap-6">
        <div
          class="w-16 h-16 rounded-2xl bg-yl-success-100 flex items-center justify-center text-2xl text-yl-success-600"
        >
          ✓
        </div>
        <div>
          <div class="text-lg font-bold text-yl-success-600">
            模型已就绪
          </div>
          <div class="text-yl-muted-500 mt-1">
            点击"下一步"继续设置
          </div>
        </div>
      </div>
    </div>

    <!-- 未下载状态 -->
    <template v-else-if="status === 'idle'">
      <div class="grid grid-cols-3 gap-4">
        <div
          class="rounded-2xl bg-white border border-yl-line-200 p-6 text-center shadow-yl-card"
        >
          <div class="text-2xl mb-3">
            📦
          </div>
          <div class="text-xs text-yl-muted-400 uppercase tracking-wider mb-1">
            模型大小
          </div>
          <div class="text-base font-bold text-yl-ink-700">
            ~300 MB
          </div>
        </div>
        <div
          class="rounded-2xl bg-white border border-yl-line-200 p-6 text-center shadow-yl-card"
        >
          <div class="text-2xl mb-3">
            🌐
          </div>
          <div class="text-xs text-yl-muted-400 uppercase tracking-wider mb-1">
            支持语言
          </div>
          <div class="text-base font-bold text-yl-ink-700">
            中英粤日韩
          </div>
        </div>
        <div
          class="rounded-2xl bg-white border border-yl-line-200 p-6 text-center shadow-yl-card"
        >
          <div class="text-2xl mb-3">
            🔒
          </div>
          <div class="text-xs text-yl-muted-400 uppercase tracking-wider mb-1">
            隐私保护
          </div>
          <div class="text-base font-bold text-yl-ink-700">
            本地处理
          </div>
        </div>
      </div>

      <div
        v-if="error"
        class="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700"
      >
        <span class="font-medium">下载失败：</span>{{ error }}
      </div>

      <AppActionButton
        variant="primary"
        class="w-full py-4 text-base"
        @click="startDownload"
      >
        开始下载模型
      </AppActionButton>
    </template>

    <!-- 下载中 -->
    <template v-else-if="status === 'downloading'">
      <div
        class="rounded-3xl bg-white border border-yl-line-200 p-8 shadow-yl-card"
      >
        <div class="flex justify-between items-center mb-4">
          <span class="text-yl-ink-600 font-medium">{{
            downloadProgress.filename || "正在准备下载..."
          }}</span>
          <span class="text-2xl font-bold text-yl-brand-500">{{ downloadProgress.percent || 0 }}%</span>
        </div>
        <div class="h-4 bg-yl-paper-300 rounded-full overflow-hidden mb-4">
          <div
            class="h-full bg-gradient-to-r from-yl-brand-500 to-yl-accent-600 transition-all duration-300 rounded-full"
            :style="{ width: `${downloadProgress.percent || 0}%` }"
          />
        </div>
        <div class="flex justify-between text-sm text-yl-muted-400">
          <span>已下载 {{ downloadedMB }} MB</span>
          <span>共 {{ totalMB }} MB</span>
        </div>
      </div>
    </template>
  </div>
</template>
