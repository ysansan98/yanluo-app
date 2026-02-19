<script setup lang="ts">
import { onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue'
import VoiceHud from './components/VoiceHud.vue'

// 错误捕获
onErrorCaptured((err, _instance, info) => {
  console.error('[VoiceHudWindow] Error captured:', err, info)
  return false
})

const visible = ref<boolean>(false)
const status = ref<'arming' | 'recording' | 'finalizing' | 'success' | 'error'>(
  'arming',
)
const partialText = ref<string>('')
const finalText = ref<string>('')
const elapsedMs = ref<number>(0)
const hintText = ref<string>('')
let hideTimer: number | null = null

const unsubscribers: Array<() => void> = []

function clearHideTimer(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide(delayMs: number): void {
  clearHideTimer()
  hideTimer = window.setTimeout(() => {
    visible.value = false
  }, delayMs)
}

onMounted(() => {
  console.log('[VoiceHudWindow] Mounted')
  // 全局错误监听
  window.addEventListener('error', (e) => {
    console.error('[VoiceHudWindow] Global error:', e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[VoiceHudWindow] Unhandled rejection:', e.reason)
  })
  unsubscribers.push(
    window.api.voice.onShow((payload) => {
      console.log('[VoiceHudWindow] onShow received:', payload)
      clearHideTimer()
      visible.value = true
      status.value = payload.status
      partialText.value = ''
      finalText.value = ''
      elapsedMs.value = 0
      hintText.value
        = payload.status === 'arming' ? 'Preparing microphone...' : 'Speak now'
    }),
  )

  unsubscribers.push(
    window.api.voice.onUpdate((payload) => {
      console.log('[VoiceHudWindow] onUpdate received:', payload)
      clearHideTimer()
      visible.value = true
      status.value = payload.status
      partialText.value = payload.partialText
      elapsedMs.value = payload.elapsedMs
      hintText.value
        = payload.status === 'finalizing'
          ? 'Processing final result...'
          : 'Listening...'
    }),
  )

  unsubscribers.push(
    window.api.voice.onFinal((payload) => {
      console.log('[VoiceHudWindow] onFinal received:', payload)
      clearHideTimer()
      visible.value = true
      status.value = 'success'
      finalText.value = payload.finalText
      hintText.value
        = payload.mode === 'pasted'
          ? 'Inserted into focused app'
          : 'Copied to clipboard'
      scheduleHide(1200)
    }),
  )

  unsubscribers.push(
    window.api.voice.onToast((payload) => {
      console.log('[VoiceHudWindow] onToast received:', payload)
      clearHideTimer()
      visible.value = true
      status.value = payload.type === 'error' ? 'error' : 'success'
      hintText.value = payload.message
      if (payload.type === 'error' || payload.type === 'warning') {
        scheduleHide(1600)
      }
    }),
  )

  unsubscribers.push(
    window.api.voice.onHide(() => {
      console.log('[VoiceHudWindow] onHide received')
      scheduleHide(200)
    }),
  )
})

onBeforeUnmount(() => {
  clearHideTimer()
  for (const dispose of unsubscribers) {
    dispose()
  }
  window.removeEventListener('error', () => {})
  window.removeEventListener('unhandledrejection', () => {})
})
</script>

<template>
  <div class="min-h-screen bg-transparent">
    <VoiceHud
      :visible="visible"
      :status="status"
      :partial-text="partialText"
      :final-text="finalText"
      :elapsed-ms="elapsedMs"
      :hint-text="hintText"
      detached
    />
  </div>
</template>
