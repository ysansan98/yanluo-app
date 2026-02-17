<script setup lang="ts">
import type { HistoryEntry, StatCard, TranscriptSource } from '../types/ui'
import DashboardStatCard from './DashboardStatCard.vue'
import HistoryAudioPlayer from './HistoryAudioPlayer.vue'

interface Props {
  statCards: StatCard[]
  recentHistory: HistoryEntry[]
  formatDuration: (ms: number) => string
  formatTime: (timestamp: number) => string
  sourceLabel: (source: TranscriptSource) => string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  clearHistory: []
}>()

function entryTypeLabel(entryType: 'asr_only' | 'polish', commandName: string | null): string {
  if (entryType === 'polish')
    return commandName ? `润色(${commandName})` : '润色'
  return '识别'
}
</script>

<template>
  <section class="space-y-4">
    <section class="grid grid-cols-5 gap-3">
      <DashboardStatCard
        v-for="card in props.statCards"
        :key="card.label"
        :label="card.label"
        :value="card.value"
        :tone-class="card.tone"
      />
    </section>

    <section class="rounded-[34px] border border-yl-line-350/60 bg-white/88 p-5 shadow-yl-card">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-base font-bold text-yl-ink-650">
          最近历史记录
        </div>
        <button
          class="cursor-pointer rounded-full border border-yl-line-280 bg-white px-3 py-1 text-xs text-yl-muted-520"
          @click="emit('clearHistory')"
        >
          清空
        </button>
      </div>

      <div v-if="props.recentHistory.length === 0" class="rounded-xl border border-dashed border-yl-line-230 bg-yl-paper-100 p-4 text-sm text-yl-muted-380">
        暂无记录，完成一次识别后会自动出现在这里。
      </div>
      <div v-else class="grid min-h-[420px] content-start gap-2">
        <article
          v-for="item in props.recentHistory"
          :key="item.id"
          class="rounded-xl border border-yl-line-180 bg-white p-3"
        >
          <div class="flex flex-wrap items-center gap-2 text-xs text-yl-muted-390">
            <span>{{ props.sourceLabel(item.source) }}</span>
            <span>{{ entryTypeLabel(item.entryType, item.commandName) }}</span>
            <span>{{ props.formatTime(item.triggeredAt) }}</span>
            <span>{{ item.language }}</span>
            <span>{{ props.formatDuration(item.elapsedMs) }}</span>
          </div>
          <div class="mt-1 line-clamp-2 text-sm text-yl-ink-580">
            {{ item.text }}
          </div>
          <HistoryAudioPlayer v-if="item.audioPath" :audio-path="item.audioPath" />
        </article>
      </div>
    </section>
  </section>
</template>
