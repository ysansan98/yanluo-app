<script setup lang="ts">
import { computed } from 'vue'

type HudStatus = 'arming' | 'recording' | 'finalizing' | 'success' | 'error'

const props = withDefaults(defineProps<{
  visible: boolean
  status: HudStatus
  partialText: string
  finalText: string
  elapsedMs: number
  hintText: string
  detached?: boolean
}>(), {
  detached: false,
})

const displayText = computed(() => {
  const partial = props.partialText.trim()
  const finalText = props.finalText.trim()

  if (props.status === 'success' || props.status === 'error') {
    return finalText || props.hintText || '未获得文本'
  }

  if (props.status === 'finalizing')
    return partial || '识别中'

  if (props.status === 'recording')
    return partial || '聆听中'

  return '聆听中'
})

const showTrailingDots = computed(() => {
  return false
})

const showLoading = computed(() => {
  return props.status === 'finalizing'
})

const logoClass = computed(() => {
  if (props.status === 'finalizing')
    return 'hud-logo hud-logo-finalizing'
  if (props.status === 'recording' || props.status === 'arming')
    return 'hud-logo hud-logo-listening'
  return 'hud-logo'
})

const stateClass = computed(() => {
  if (props.status === 'success')
    return 'border-[#7a9d68] bg-[#f5f7ee]'
  if (props.status === 'error')
    return 'border-[#b46b63] bg-[#fbf3f1]'
  if (props.status === 'finalizing')
    return 'border-[#b08a5a] bg-[#faf4e8]'
  return 'border-[#8a7655] bg-[#f7f0e3]'
})

const dotClass = computed(() => {
  if (props.status === 'success')
    return 'bg-[#5e7f4a]'
  if (props.status === 'error')
    return 'bg-[#a24f45]'
  if (props.status === 'finalizing')
    return 'bg-[#a97834] animate-pulse'
  return 'bg-[#6f5a3b] animate-pulse'
})

const containerClass = computed(() => {
  const base = 'pointer-events-none rounded-xl border px-3 py-2 shadow-[0_10px_26px_rgba(60,44,24,0.18)] backdrop-blur-[1px] [font-family:\'Noto_Serif_SC\',\'Songti_SC\',\'STSong\',serif]'
  if (props.detached) {
    return `mx-auto my-0 w-[min(320px,calc(100vw-24px))] ${base}`
  }
  return `fixed bottom-[78px] left-1/2 z-[1200] w-[min(320px,calc(100vw-24px))] -translate-x-1/2 ${base}`
})
</script>

<template>
  <transition
    enter-active-class="transition duration-100 ease-out"
    enter-from-class="translate-y-[-6px] opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-120 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-[-4px] opacity-0"
  >
    <div
      v-if="visible"
      :class="[containerClass, stateClass]"
    >
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#9a8460] bg-[#f2e7d4] text-[11px] font-semibold text-[#4a3a23]" :class="logoClass">
          言
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 text-[13px] leading-5 text-[#2f261a]">
            <span
              class="h-1.5 w-1.5 shrink-0 rounded-full"
              :class="dotClass"
            />
            <span class="line-clamp-1">{{ displayText }}</span>
            <span
              v-if="showLoading"
              class="hud-loading ml-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#b08a5a] border-t-transparent"
            />
            <span
              v-else-if="showTrailingDots"
              class="inline-block w-[14px] shrink-0 overflow-hidden align-middle text-left text-[#6f5a3b]"
            >
              <span class="inline-block">...</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.hud-loading {
  animation: hud-spin 0.85s linear infinite;
}

.hud-logo {
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.hud-logo-listening {
  animation: hud-breathe 1.4s ease-in-out infinite;
}

.hud-logo-finalizing {
  animation: hud-breathe-fast 0.9s ease-in-out infinite;
}

@keyframes hud-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes hud-breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 rgba(122, 105, 74, 0);
  }
  50% {
    transform: scale(1.06);
    box-shadow: 0 0 0 5px rgba(122, 105, 74, 0.1);
  }
}

@keyframes hud-breathe-fast {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 rgba(176, 138, 90, 0);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 0 6px rgba(176, 138, 90, 0.12);
  }
}
</style>
