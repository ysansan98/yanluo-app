<script setup lang="ts">
import type { HistoryEntry, StatCard } from '../types/ui'
import HistoryList from './HistoryList.vue'
import StatsSection from './StatsSection.vue'

interface Props {
  statCards: StatCard[]
  recentHistory: HistoryEntry[]
}

defineProps<Props>()

const emit = defineEmits<{
  clearHistory: []
}>()
</script>

<template>
  <section class="flex flex-col gap-2">
    <div class="">
      <StatsSection :cards="statCards" />
    </div>

    <section
      class="rounded-[34px] border border-yl-line-350/60 bg-white/88 p-5 shadow-yl-card "
    >
      <div class="mb-3 flex items-center justify-between">
        <div class="text-base font-bold text-yl-ink-650">
          历史记录
        </div>
        <button
          class="cursor-pointer rounded-full border border-yl-line-280 bg-white px-3 py-1 text-xs text-yl-muted-520"
          @click="emit('clearHistory')"
        >
          清空
        </button>
      </div>

      <HistoryList
        :entries="recentHistory"
        empty-text="暂无记录，完成一次识别后会自动出现在这里。"
      />
    </section>
  </section>
</template>
