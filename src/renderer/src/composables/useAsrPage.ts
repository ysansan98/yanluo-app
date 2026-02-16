import type { Ref } from 'vue'
import type { AsrModelInfo } from '../types/asr'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface UseAsrPageOptions {
  resultCardRef: Ref<HTMLElement | null>
}

export function useAsrPage(options: UseAsrPageOptions) {
  const filePath = ref<string>('')
  const language = ref<string>('')
  const status = ref<string>('')
  const transcriptChars = ref<number>(0)
  const transcriptElapsedMs = ref<number>(0)
  const resultText = ref<string>('')
  const resultLanguage = ref<string>('')
  const lastResponseJson = ref<string>('')
  const modelInfo = ref<AsrModelInfo | null>(null)
  const downloadLogs = ref<string>('')
  let unsubscribeLogs: (() => void) | null = null
  const liveIsRecording = ref<boolean>(false)
  const liveStatus = ref<string>('Idle')
  const livePartialText = ref<string>('')
  const liveFinalText = ref<string>('')
  const liveElapsedMs = ref<number>(0)
  const continueWindowMsInput = ref<string>('2000')
  const voiceUnsubscribers: Array<() => void> = []

  async function refreshModelInfo(): Promise<void> {
    modelInfo.value = await window.api.asr.modelInfo()
  }

  async function startDownload(): Promise<void> {
    status.value = 'Starting download...'
    try {
      const res = await window.api.asr.downloadModel()
      if (res.status === 'exists') {
        status.value = 'Model already downloaded'
      }
      else if (res.status === 'running') {
        status.value = 'Download already running'
      }
      else {
        status.value = 'Downloading...'
      }
      await refreshModelInfo()
    }
    catch (err) {
      status.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function pickAudioFile(): Promise<void> {
    const selected = await window.api.asr.pickAudioFile()
    if (!selected)
      return
    filePath.value = selected
    transcriptChars.value = 0
    transcriptElapsedMs.value = 0
    resultText.value = ''
    resultLanguage.value = ''
    lastResponseJson.value = ''
  }

  async function transcribe(): Promise<void> {
    if (!filePath.value)
      return
    status.value = 'Transcribing...'
    try {
      const res = await window.api.asr.transcribeFile(
        filePath.value,
        language.value.trim() || undefined,
      )
      lastResponseJson.value = JSON.stringify(res, null, 2)
      resultText.value = typeof res.text === 'string' ? res.text : String(res.text ?? '')
      resultLanguage.value = res.language
      transcriptElapsedMs.value = Number(res.elapsed_ms ?? 0)
      transcriptChars.value = resultText.value.length
      status.value
        = transcriptChars.value > 0
          ? `Done (chars=${transcriptChars.value}, elapsed=${transcriptElapsedMs.value}ms)`
          : 'Done (empty transcript)'
      await nextTick()
      options.resultCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    catch (err) {
      lastResponseJson.value = ''
      status.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function checkHealth(): Promise<void> {
    status.value = 'Checking ASR service...'
    try {
      const res = await window.api.asr.health()
      if (res.model_loaded) {
        status.value = 'ASR service ready'
      }
      else {
        status.value = res.model_error ? `ASR error: ${res.model_error}` : 'ASR loading...'
      }
    }
    catch (err) {
      status.value = err instanceof Error ? err.message : String(err)
    }
  }

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

  onMounted(async () => {
    await refreshModelInfo()
    const voiceConfig = await window.api.voice.getConfig()
    continueWindowMsInput.value = String(voiceConfig.continueWindowMs)
    unsubscribeLogs = window.api.asr.onDownloadLog((payload) => {
      downloadLogs.value += `[${payload.type}] ${payload.message}\n`
    })
    voiceUnsubscribers.push(
      window.api.voice.onShow((payload) => {
        livePartialText.value = ''
        liveFinalText.value = ''
        liveElapsedMs.value = 0
        liveStatus.value = payload.status === 'arming' ? 'Arming microphone...' : 'Recording...'
        liveIsRecording.value = true
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onUpdate((payload) => {
        if (payload.status === 'recording' && !liveIsRecording.value) {
          livePartialText.value = ''
          liveFinalText.value = ''
        }
        liveIsRecording.value = payload.status !== 'finalizing'
        liveStatus.value = payload.status === 'finalizing' ? 'Finalizing...' : 'Recording...'
        livePartialText.value = payload.partialText
        liveElapsedMs.value = payload.elapsedMs
      }),
    )
    voiceUnsubscribers.push(
      window.api.voice.onFinal((payload) => {
        liveIsRecording.value = false
        liveStatus.value = payload.mode === 'pasted' ? 'Done (pasted)' : 'Done (copied to clipboard)'
        liveFinalText.value = payload.finalText
        resultText.value = payload.finalText
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
  })

  onBeforeUnmount(() => {
    unsubscribeLogs?.()
    for (const dispose of voiceUnsubscribers) {
      dispose()
    }
  })

  return {
    applyContinueWindowMs,
    checkHealth,
    continueWindowMsInput,
    downloadLogs,
    filePath,
    language,
    lastResponseJson,
    liveElapsedMs,
    liveFinalText,
    liveIsRecording,
    livePartialText,
    liveStatus,
    modelInfo,
    pickAudioFile,
    refreshModelInfo,
    resultLanguage,
    resultText,
    startDownload,
    status,
    toggleLiveRecording,
    transcribe,
    transcriptChars,
    transcriptElapsedMs,
  }
}
