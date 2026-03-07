import type { Ref } from 'vue'
import type { VadConfig } from '~shared/voice'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createRendererLogger } from '../utils/logger'

const log = createRendererLogger('asr-page')

interface UseAsrPageOptions {
  resultCardRef: Ref<HTMLElement | null>
  onTranscriptCreated?: (payload: {
    source: 'live'
    text: string
    elapsedMs: number
    audioPath?: string | null
  }) => void
}

export function useAsrPage(options: UseAsrPageOptions) {
  const liveIsRecording = ref<boolean>(false)
  const liveStatus = ref<string>('Idle')
  const livePartialText = ref<string>('')
  const liveFinalText = ref<string>('')
  const liveElapsedMs = ref<number>(0)
  const continueWindowMsInput = ref<string>('2000')
  const voiceUnsubscribers: Array<() => void> = []

  // VAD config
  const vadEnabled = ref<boolean>(true)
  const vadThresholdInput = ref<string>('0.5')
  const vadMinSpeechMsInput = ref<string>('150')
  const vadRedemptionMsInput = ref<string>('150')
  const vadMinDurationMsInput = ref<string>('300')

  async function startLiveRecording(): Promise<void> {
    liveStatus.value = 'Starting...'
    livePartialText.value = ''
    liveFinalText.value = ''
    liveElapsedMs.value = 0
    await window.api.voice.startRecording()
  }

  async function stopLiveRecording(): Promise<void> {
    liveStatus.value = 'Finalizing...'
    await window.api.voice.stopRecording()
  }

  async function toggleLiveRecording(): Promise<void> {
    if (liveIsRecording.value) {
      await stopLiveRecording()
      return
    }
    await startLiveRecording()
  }

  async function applyContinueWindowMs(): Promise<void> {
    const parsed = Number.parseInt(continueWindowMsInput.value, 10)
    if (Number.isNaN(parsed)) {
      liveStatus.value = 'Continue window must be a number'
      return
    }
    const res = await window.api.voice.setConfig({ continueWindowMs: parsed })
    continueWindowMsInput.value = String(res.continueWindowMs)
    liveStatus.value = `Continue window set to ${res.continueWindowMs}ms`
  }

  async function loadVadConfig(): Promise<void> {
    try {
      const config = await window.api.voice.getVadConfig?.()
      if (config) {
        vadEnabled.value = config.enabled
        vadThresholdInput.value = String(config.threshold)
        vadMinSpeechMsInput.value = String(config.minSpeechMs)
        vadRedemptionMsInput.value = String(config.redemptionMs)
        vadMinDurationMsInput.value = String(config.minDurationMs)
      }
    }
    catch (err) {
      log.warn('failed to load VAD config', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function applyVadConfig(): Promise<void> {
    try {
      const payload: Partial<VadConfig> = {
        enabled: vadEnabled.value,
        threshold: Number.parseFloat(vadThresholdInput.value),
        minSpeechMs: Number.parseInt(vadMinSpeechMsInput.value, 10),
        redemptionMs: Number.parseInt(vadRedemptionMsInput.value, 10),
        minDurationMs: Number.parseInt(vadMinDurationMsInput.value, 10),
      }
      const res = await window.api.voice.setVadConfig?.(payload)
      if (res) {
        vadEnabled.value = res.enabled
        vadThresholdInput.value = String(res.threshold)
        vadMinSpeechMsInput.value = String(res.minSpeechMs)
        vadRedemptionMsInput.value = String(res.redemptionMs)
        vadMinDurationMsInput.value = String(res.minDurationMs)
        liveStatus.value = 'VAD config applied'
      }
    }
    catch (err) {
      liveStatus.value = err instanceof Error ? err.message : String(err)
    }
  }

  onMounted(async () => {
    const voiceConfig = await window.api.voice.getConfig()
    continueWindowMsInput.value = String(voiceConfig.continueWindowMs)

    // Load VAD config
    await loadVadConfig()

    voiceUnsubscribers.push(
      window.api.voice.onShow((payload) => {
        log.info('voice onShow', {
          sessionId: payload.sessionId,
          status: payload.status,
        })
        livePartialText.value = ''
        liveFinalText.value = ''
        liveElapsedMs.value = 0
        liveStatus.value
          = payload.status === 'arming' ? 'Arming microphone...' : 'Recording...'
        liveIsRecording.value = true
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onUpdate((payload) => {
        log.debug('voice onUpdate', {
          sessionId: payload.sessionId,
          status: payload.status,
          partialLength: payload.partialText.length,
        })
        if (payload.status === 'recording' && !liveIsRecording.value) {
          livePartialText.value = ''
          liveFinalText.value = ''
        }
        liveIsRecording.value = payload.status !== 'finalizing'
        liveStatus.value
          = payload.status === 'finalizing' ? 'Finalizing...' : 'Recording...'
        livePartialText.value = payload.partialText
        liveElapsedMs.value = payload.elapsedMs
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onFinal((payload) => {
        log.info('voice onFinal', {
          sessionId: payload.sessionId,
          mode: payload.mode,
          finalLength: payload.finalText.length,
        })
        liveIsRecording.value = false
        liveStatus.value
          = payload.mode === 'pasted'
            ? 'Done (pasted)'
            : 'Done (copied to clipboard)'
        liveFinalText.value = payload.finalText
        options.onTranscriptCreated?.({
          source: 'live',
          text: payload.finalText,
          elapsedMs: liveElapsedMs.value,
          audioPath: payload.audioPath,
        })
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onHide(() => {
        liveIsRecording.value = false
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onToast((payload) => {
        liveStatus.value = payload.message
      }),
    )

    // Listen for VAD config updates from other windows
    const unsubscribeVadUpdate = window.api.voice.onVadConfigUpdated?.(
      (config) => {
        vadEnabled.value = config.enabled
        vadThresholdInput.value = String(config.threshold)
        vadMinSpeechMsInput.value = String(config.minSpeechMs)
        vadRedemptionMsInput.value = String(config.redemptionMs)
        vadMinDurationMsInput.value = String(config.minDurationMs)
      },
    )
    if (unsubscribeVadUpdate) {
      voiceUnsubscribers.push(unsubscribeVadUpdate)
    }
  })

  onBeforeUnmount(() => {
    for (const dispose of voiceUnsubscribers) {
      dispose()
    }
  })

  return {
    applyContinueWindowMs,
    continueWindowMsInput,
    liveElapsedMs,
    liveFinalText,
    liveIsRecording,
    livePartialText,
    liveStatus,
    toggleLiveRecording,
    // VAD
    vadEnabled,
    vadThresholdInput,
    vadMinSpeechMsInput,
    vadRedemptionMsInput,
    vadMinDurationMsInput,
    applyVadConfig,
  }
}
