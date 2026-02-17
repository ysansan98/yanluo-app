<script setup lang="ts">
import { formatDuration } from '../utils'
import AppActionButton from './AppActionButton.vue'

interface Props {
  liveStatus: string
  liveElapsedMs: number
  liveIsRecording: boolean
  livePartialText: string
  liveFinalText: string
  filePath: string
  language: string
  status: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:filePath': [value: string]
  'update:language': [value: string]
  'toggleLiveRecording': []
  'pickAudioFile': []
  'transcribe': []
  'checkHealth': []
}>()
</script>

<template>
  <section class="rounded-[34px] border border-yl-line-350/60 bg-white/88 p-5 shadow-yl-card">
    <div class="mb-3 flex items-center justify-between">
      <div class="text-base font-bold text-yl-ink-650">
        识别工作台
      </div>
      <div class="text-[11px] text-yl-muted-430">
        实时 + 文件
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppActionButton @click="emit('toggleLiveRecording')">
        {{ props.liveIsRecording ? '停止录音' : '开始录音' }}
      </AppActionButton>
      <span class="text-xs text-yl-muted-380">会话时长：{{ formatDuration(props.liveElapsedMs) }}</span>
      <span class="text-xs text-yl-muted-380">状态：{{ props.liveStatus || 'Idle' }}</span>
    </div>

    <div class="mt-3 grid grid-cols-[1fr_220px] gap-2">
      <input
        :value="props.filePath"
        class="rounded-lg border border-yl-line-180 bg-white px-3 py-2 text-sm"
        placeholder="/absolute/path/to/audio.wav"
        @input="emit('update:filePath', ($event.target as HTMLInputElement).value)"
      >
      <input
        :value="props.language"
        class="rounded-lg border border-yl-line-180 bg-white px-3 py-2 text-sm"
        placeholder="语言(可选)"
        @input="emit('update:language', ($event.target as HTMLInputElement).value)"
      >
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <AppActionButton variant="outline" size="sm" @click="emit('pickAudioFile')">
        选择音频
      </AppActionButton>
      <AppActionButton :disabled="!props.filePath" @click="emit('transcribe')">
        Transcribe
      </AppActionButton>
      <AppActionButton variant="outline" size="sm" @click="emit('checkHealth')">
        Health Check
      </AppActionButton>
      <span class="text-xs text-yl-muted-380">{{ props.status }}</span>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="rounded-xl border border-yl-line-180 bg-white p-3">
        <div class="text-xs text-yl-muted-430">
          Partial
        </div>
        <div class="mt-1 min-h-16 text-xs leading-5 whitespace-pre-wrap text-yl-ink-550 font-yl-mono">
          {{ props.livePartialText || '-' }}
        </div>
      </div>
      <div class="rounded-xl border border-yl-line-180 bg-white p-3">
        <div class="text-xs text-yl-muted-430">
          Final
        </div>
        <div class="mt-1 min-h-16 text-xs leading-5 whitespace-pre-wrap text-yl-ink-550 font-yl-mono">
          {{ props.liveFinalText || '-' }}
        </div>
      </div>
    </div>
  </section>
</template>
