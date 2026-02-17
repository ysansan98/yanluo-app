<script setup lang="ts">
import type { HistoryEntry } from '../types/ui'
import { formatDuration, formatTime, sourceLabel } from '../utils'
import HistoryAudioPlayer from './HistoryAudioPlayer.vue'

interface Props {
  entry: HistoryEntry
}

defineProps<Props>()

function entryTypeLabel(entryType: 'asr_only' | 'polish', commandName: string | null): string {
  if (entryType === 'polish')
    return commandName ? `润色(${commandName})` : '润色'
  return '识别'
}
</script>

<template>
  <article class="rounded-xl border border-yl-line-180 bg-white p-3">
    <div class="flex flex-wrap items-center gap-2 text-xs text-yl-muted-390">
      <span>{{ sourceLabel(entry.source) }}</span>
      <span>{{ entryTypeLabel(entry.entryType, entry.commandName) }}</span>
      <span>{{ formatTime(entry.triggeredAt) }}</span>
      <span>{{ entry.language }}</span>
      <span>{{ formatDuration(entry.elapsedMs) }}</span>
    </div>
    <div class="mt-1 line-clamp-2 text-sm text-yl-ink-580">
      {{ entry.text }}
    </div>
    <HistoryAudioPlayer v-if="entry.audioPath" :audio-path="entry.audioPath" />
  </article>
</template>
