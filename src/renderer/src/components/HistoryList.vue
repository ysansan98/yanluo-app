<script setup lang="ts">
import type { HistoryEntry } from '../types/ui'
import { ref } from 'vue'
import HistoryItem from './HistoryItem.vue'

interface Props {
  entries: HistoryEntry[]
  emptyText?: string
}

withDefaults(defineProps<Props>(), {
  emptyText: '暂无记录',
})

const expandedId = ref<string | null>(null)

function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
  }
  else {
    expandedId.value = id
  }
}
</script>

<template>
  <div v-if="entries.length === 0" class="rounded-xl border border-dashed border-yl-line-230 bg-yl-paper-100 p-4 text-sm text-yl-muted-380">
    <slot name="empty">
      {{ emptyText }}
    </slot>
  </div>
  <div v-else class="grid min-h-[420px] content-start gap-2">
    <HistoryItem
      v-for="item in entries"
      :key="item.id"
      :entry="item"
      :expanded="expandedId === item.id"
      @toggle-expand="toggleExpand"
    />
  </div>
</template>
