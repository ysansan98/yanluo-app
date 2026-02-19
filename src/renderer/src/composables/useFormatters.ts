import type { HistoryEntry } from '../types/ui'
import { computed } from 'vue'
import { formatDuration, formatTime, isToday, sourceLabel } from '../utils'

export function useFormatters(historyEntries: { value: HistoryEntry[] }) {
  // Computed stats based on history entries
  const todayUsageCount = computed(
    () =>
      historyEntries.value.filter(item => isToday(item.triggeredAt)).length,
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

  return {
    // Re-export standalone functions for convenience
    formatDuration,
    formatTime,
    sourceLabel,
    isToday,
    // Computed stats
    todayUsageCount,
    todayChars,
    todayAudioDurationMs,
    totalChars,
    totalAudioDurationMs,
    recentHistory,
  }
}
