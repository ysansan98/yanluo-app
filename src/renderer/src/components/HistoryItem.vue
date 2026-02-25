<script setup lang="ts">
import type { HistoryEntry } from '../types/ui'
import { ref } from 'vue'
import { formatDuration, formatTime, sourceLabel } from '../utils'
import HistoryAudioPlayer from './HistoryAudioPlayer.vue'

interface Props {
  entry: HistoryEntry
  expanded: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  toggleExpand: [id: string]
}>()

const copied = ref(false)

function entryTypeLabel(
  entryType: 'asr_only' | 'polish',
  commandName: string | null,
): string {
  if (entryType === 'polish')
    return commandName ? `润色(${commandName})` : '润色'
  return '识别'
}

function handleToggle() {
  if (props.entry.audioPath) {
    emit('toggleExpand', props.entry.id)
  }
}

async function handleCopy(event: MouseEvent) {
  event.stopPropagation()
  try {
    const result = await window.api.clipboard.writeText(props.entry.text)
    if (result.ok) {
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
      console.log('[HistoryItem] Copied:', props.entry.text.slice(0, 50) + (props.entry.text.length > 50 ? '...' : ''))
    }
    else {
      console.error('[HistoryItem] Copy failed:', result.error)
    }
  }
  catch (err) {
    console.error('[HistoryItem] Copy error:', err)
  }
}
</script>

<template>
  <article
    class="rounded-xl border border-yl-line-180 bg-white p-3 cursor-pointer transition-all duration-200 hover:border-yl-line-230 hover:shadow-sm"
    @click="handleToggle"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-2 text-xs text-yl-muted-390"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span>{{ sourceLabel(entry.source) }}</span>
        <span>{{ entryTypeLabel(entry.entryType, entry.commandName) }}</span>
        <span>{{ formatTime(entry.triggeredAt) }}</span>
        <span>{{ entry.language }}</span>
        <span>{{ formatDuration(entry.elapsedMs) }}</span>
      </div>
      <div v-if="entry.audioPath" class="flex items-center gap-1">
        <span class="text-xs text-yl-muted-380">{{
          expanded ? "收起" : "展开"
        }}</span>
        <svg
          class="h-3 w-3 transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </div>
    </div>
    <div class="group relative mt-1">
      <div
        class="line-clamp-2 pr-8 text-sm text-yl-ink-580 transition-colors group-hover:text-yl-ink-650"
      >
        {{ entry.text }}
      </div>
      <!-- 复制按钮 -->
      <button
        class="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md text-yl-muted-400 transition-all duration-200 hover:bg-yl-paper-100 hover:text-yl-brand-500"
        :class="copied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        :title="copied ? '已复制' : '复制'"
        @click.stop.prevent="handleCopy"
      >
        <!-- 复制图标 -->
        <svg
          v-if="!copied"
          class="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <!-- 勾选图标（复制成功后显示） -->
        <svg
          v-else
          class="h-4 w-4 text-yl-success-500"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
    <Transition name="collapse">
      <div v-if="entry.audioPath && expanded" class="overflow-hidden">
        <HistoryAudioPlayer :audio-path="entry.audioPath" />
      </div>
    </Transition>
  </article>
</template>

<style scoped>
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease-out;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 500px;
}
</style>
