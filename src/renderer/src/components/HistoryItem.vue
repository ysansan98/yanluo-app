<script setup lang="ts">
import type { HistoryEntry } from '../types/ui'
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
    <div class="mt-1 line-clamp-2 text-sm text-yl-ink-580">
      {{ entry.text }}
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
