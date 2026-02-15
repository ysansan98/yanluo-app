<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const filePath = ref<string>('')
const language = ref<string>('')
const status = ref<string>('')
const transcriptChars = ref<number>(0)
const transcriptElapsedMs = ref<number>(0)
const resultText = ref<string>('')
const resultLanguage = ref<string>('')
const lastResponseJson = ref<string>('')
const resultCardRef = ref<HTMLElement | null>(null)
const modelInfo = ref<{ modelId: string, modelDir: string, exists: boolean } | null>(null)
const downloadLogs = ref<string>('')
let unsubscribeLogs: (() => void) | null = null
const liveIsRecording = ref<boolean>(false)
const liveStatus = ref<string>('Idle')
const livePartialText = ref<string>('')
const liveFinalText = ref<string>('')
const liveElapsedMs = ref<number>(0)
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
    status.value = transcriptChars.value > 0
      ? `Done (chars=${transcriptChars.value}, elapsed=${transcriptElapsedMs.value}ms)`
      : 'Done (empty transcript)'
    await nextTick()
    resultCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

onMounted(async () => {
  await refreshModelInfo()
  unsubscribeLogs = window.api.asr.onDownloadLog((payload) => {
    downloadLogs.value += `[${payload.type}] ${payload.message}\n`
  })
  voiceUnsubscribers.push(window.api.voice.onShow((payload) => {
    liveStatus.value = payload.status === 'arming' ? 'Arming microphone...' : 'Recording...'
    liveIsRecording.value = true
  }))
  voiceUnsubscribers.push(window.api.voice.onUpdate((payload) => {
    liveIsRecording.value = payload.status !== 'finalizing'
    liveStatus.value = payload.status === 'finalizing' ? 'Finalizing...' : 'Recording...'
    livePartialText.value = payload.partialText
    liveElapsedMs.value = payload.elapsedMs
  }))
  voiceUnsubscribers.push(window.api.voice.onFinal((payload) => {
    liveIsRecording.value = false
    liveStatus.value = payload.mode === 'pasted' ? 'Done (pasted)' : 'Done (copied to clipboard)'
    liveFinalText.value = payload.finalText
    resultText.value = payload.finalText
  }))
  voiceUnsubscribers.push(window.api.voice.onHide(() => {
    liveIsRecording.value = false
  }))
  voiceUnsubscribers.push(window.api.voice.onToast((payload) => {
    liveStatus.value = payload.message
  }))
})

onBeforeUnmount(() => {
  unsubscribeLogs?.()
  for (const dispose of voiceUnsubscribers) {
    dispose()
  }
})
</script>

<template>
  <div
    class="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,#f5efe6,#f2f2f8_35%,#e8eff4_70%)] px-6 pt-9 pb-[60px] text-[#1b1b1b] [font-family:'IBM_Plex_Sans','Avenir_Next',sans-serif]"
  >
    <header class="mx-auto mb-6 max-w-[900px]">
      <div class="text-3xl font-bold tracking-[0.5px]">
        Yanluo ASR
      </div>
      <div class="mt-1.5 text-[#4a4a4a]">
        Offline speech-to-text (file first), with online polishing later.
      </div>
    </header>

    <section class="mx-auto mb-[18px] max-w-[900px] rounded-2xl border border-[#1b4dff]/25 bg-white/90 p-5 shadow-[0_12px_30px_rgba(20,20,40,0.08)]">
      <div class="mb-3 text-base font-bold text-[#1637b8]">
        Live Dictation
      </div>
      <div class="mb-3 flex items-center justify-start gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-[#1b4dff] px-[18px] py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          @click="toggleLiveRecording"
        >
          {{ liveIsRecording ? 'Stop Recording' : 'Start Recording' }}
        </button>
      </div>
      <div class="mt-1.5 min-h-[18px] text-[#555]">
        Status: {{ liveStatus }}
      </div>
      <div class="mt-1.5 min-h-[18px] text-[#555]">
        Live elapsed: {{ liveElapsedMs }} ms
      </div>
      <div class="mb-2 mt-3 font-semibold text-[#2f2f2f]">
        Partial
      </div>
      <div class="min-h-14 w-full break-words rounded-xl border border-[#d5d5db] bg-white p-3 text-[13px] leading-6 whitespace-pre-wrap text-[#111] [font-family:'IBM_Plex_Mono',monospace]">
        {{ livePartialText || '-' }}
      </div>
      <div class="mb-2 mt-3 font-semibold text-[#2f2f2f]">
        Final
      </div>
      <div class="min-h-14 w-full break-words rounded-xl border border-[#d5d5db] bg-white p-3 text-[13px] leading-6 whitespace-pre-wrap text-[#111] [font-family:'IBM_Plex_Mono',monospace]">
        {{ liveFinalText || '-' }}
      </div>
    </section>

    <section class="mx-auto mb-[18px] max-w-[900px] rounded-2xl border border-black/10 bg-white/85 p-5 shadow-[0_12px_30px_rgba(20,20,40,0.08)]">
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Model</label>
        <div class="flex-1 rounded-lg bg-[#f7f7fb] px-2.5 py-2 text-xs text-[#3e3e3e] [font-family:'JetBrains_Mono',monospace]">
          {{ modelInfo?.modelId || '-' }}
        </div>
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Local path</label>
        <div class="flex-1 rounded-lg bg-[#f7f7fb] px-2.5 py-2 text-xs text-[#3e3e3e] [font-family:'JetBrains_Mono',monospace]">
          {{ modelInfo?.modelDir || '-' }}
        </div>
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Status</label>
        <div class="flex-1 rounded-lg bg-[#f7f7fb] px-2.5 py-2 text-xs text-[#3e3e3e] [font-family:'JetBrains_Mono',monospace]">
          {{ modelInfo?.exists ? 'Ready' : 'Not downloaded' }}
        </div>
      </div>
      <div class="mb-3 flex items-center justify-start gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-[#1b4dff] px-[18px] py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          @click="startDownload"
        >
          Download (ModelScope)
        </button>
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-transparent px-[18px] py-2 font-semibold text-[#1b4dff] transition disabled:cursor-not-allowed disabled:opacity-50"
          @click="refreshModelInfo"
        >
          Refresh
        </button>
      </div>
      <textarea
        class="min-h-[120px] w-full rounded-xl border border-[#d5d5db] bg-[#f9f9fc] p-2.5 text-[11px] text-[#2f2f2f] [font-family:'JetBrains_Mono',monospace]"
        readonly
        :value="downloadLogs"
        placeholder="Download logs"
      />
    </section>

    <section class="mx-auto mb-[18px] max-w-[900px] rounded-2xl border border-black/10 bg-white/85 p-5 shadow-[0_12px_30px_rgba(20,20,40,0.08)]">
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Audio file</label>
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-[#1b4dff] px-[18px] py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          @click="pickAudioFile"
        >
          Choose Audio File
        </button>
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Path</label>
        <input
          v-model="filePath"
          class="flex-1 rounded-lg border border-[#d3d3d9] bg-white px-2.5 py-2"
          placeholder="/absolute/path/to/audio.wav"
        >
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Language (optional)</label>
        <input
          v-model="language"
          class="flex-1 rounded-lg border border-[#d3d3d9] bg-white px-2.5 py-2"
          placeholder="Chinese / English / French ..."
        >
      </div>
      <div class="mb-3 flex items-center justify-start gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-[#1b4dff] px-[18px] py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!filePath"
          @click="transcribe"
        >
          Transcribe
        </button>
        <button
          class="cursor-pointer rounded-full border border-[#1b4dff] bg-transparent px-[18px] py-2 font-semibold text-[#1b4dff] transition disabled:cursor-not-allowed disabled:opacity-50"
          @click="checkHealth"
        >
          Health Check
        </button>
      </div>
      <div class="mt-1.5 min-h-[18px] text-[#555]">
        {{ status }}
      </div>
      <div class="mt-1.5 min-h-[18px] text-[#555]">
        Chars: {{ transcriptChars }}
      </div>
      <div class="mt-1.5 min-h-[18px] text-[#555]">
        Elapsed: {{ transcriptElapsedMs }} ms ({{ (transcriptElapsedMs / 1000).toFixed(2) }} s)
      </div>
    </section>

    <section
      ref="resultCardRef"
      class="mx-auto mb-[18px] max-w-[900px] rounded-2xl border border-[#1b4dff]/25 bg-white/85 p-5 shadow-[0_12px_30px_rgba(20,20,40,0.08)]"
    >
      <div class="mb-3 text-base font-bold text-[#1637b8]">
        Recognition Result
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Detected language</label>
        <div class="flex-1 rounded-lg bg-[#f7f7fb] px-2.5 py-2 text-xs text-[#3e3e3e] [font-family:'JetBrains_Mono',monospace]">
          {{ resultLanguage || '-' }}
        </div>
      </div>
      <div class="mb-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Transcript (Preview)</label>
      </div>
      <div class="min-h-24 w-full break-words rounded-xl border border-[#d5d5db] bg-white p-3 text-[13px] leading-6 whitespace-pre-wrap text-[#111] [font-family:'IBM_Plex_Mono',monospace]">
        {{ resultText || 'No transcript yet' }}
      </div>
      <div class="mb-3 mt-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Transcript (Editable)</label>
      </div>
      <textarea
        v-model="resultText"
        class="min-h-[220px] w-full rounded-xl border border-[#d5d5db] bg-white p-3 text-[13px] text-[#111] [font-family:'IBM_Plex_Mono',monospace]"
        placeholder="Transcript will appear here"
      />
      <div class="mb-3 mt-3 flex items-center gap-3 max-[720px]:items-stretch max-[720px]:flex-col">
        <label class="w-40 font-semibold text-[#2f2f2f] max-[720px]:w-auto">Raw Response</label>
      </div>
      <textarea
        class="min-h-[120px] w-full rounded-xl border border-[#d5d5db] bg-[#f9f9fc] p-2.5 text-[11px] text-[#2f2f2f] [font-family:'JetBrains_Mono',monospace]"
        readonly
        :value="lastResponseJson"
        placeholder="Raw ASR JSON response"
      />
    </section>
  </div>
</template>
