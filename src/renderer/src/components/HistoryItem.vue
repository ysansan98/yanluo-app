<script setup lang="ts">
import type { HistoryEntry } from '../types/ui'
import { ref } from 'vue'
import { formatTime, sourceLabel } from '../utils'
import { createRendererLogger } from '../utils/logger'
import HistoryAudioPlayer from './HistoryAudioPlayer.vue'
import Icon from './Icon.vue'

interface Props {
  entry: HistoryEntry
  expanded: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  toggleExpand: [id: string]
}>()
const log = createRendererLogger('history-item')

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
      log.info('copied history text', {
        entryId: props.entry.id,
        textPreview: props.entry.text.slice(0, 50) + (props.entry.text.length > 50 ? '...' : ''),
      })
    }
    else {
      log.error('copy history text failed', {
        entryId: props.entry.id,
        error: result.error,
      })
    }
  }
  catch (err) {
    log.error('copy history text error', {
      entryId: props.entry.id,
      error: err instanceof Error ? err.message : String(err),
    })
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
      </div>
      <div v-if="entry.audioPath" class="flex items-center gap-1">
        <span class="text-xs text-yl-muted-380">{{
          expanded ? "收起" : "展开"
        }}</span>
        <Icon
          name="lucide:chevron-down"
          size="w-3 h-3"
          :class="`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`"
        />
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
        <Icon
          v-if="!copied"
          name="lucide:copy"
          size="w-4 h-4"
        />
        <!-- 勾选图标（复制成功后显示） -->
        <Icon
          v-else
          name="lucide:check"
          size="w-4 h-4"
          class-name="text-yl-success-500"
        />
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
