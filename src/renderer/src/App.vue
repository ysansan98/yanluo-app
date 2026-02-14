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

onMounted(async () => {
  await refreshModelInfo()
  unsubscribeLogs = window.api.asr.onDownloadLog((payload) => {
    downloadLogs.value += `[${payload.type}] ${payload.message}\n`
  })
})

onBeforeUnmount(() => {
  unsubscribeLogs?.()
})
</script>

<template>
  <div class="page">
    <header class="hero">
      <div class="title">
        Yanluo ASR
      </div>
      <div class="subtitle">
        Offline speech-to-text (file first), with online polishing later.
      </div>
    </header>

    <section class="card">
      <div class="row">
        <label class="label">Model</label>
        <div class="path">
          {{ modelInfo?.modelId || '-' }}
        </div>
      </div>
      <div class="row">
        <label class="label">Local path</label>
        <div class="path">
          {{ modelInfo?.modelDir || '-' }}
        </div>
      </div>
      <div class="row">
        <label class="label">Status</label>
        <div class="path">
          {{ modelInfo?.exists ? 'Ready' : 'Not downloaded' }}
        </div>
      </div>
      <div class="row actions">
        <button class="btn" @click="startDownload">
          Download (ModelScope)
        </button>
        <button class="btn ghost" @click="refreshModelInfo">
          Refresh
        </button>
      </div>
      <textarea class="log" readonly :value="downloadLogs" placeholder="Download logs" />
    </section>

    <section class="card">
      <div class="row">
        <label class="label">Audio file</label>
        <button class="btn" @click="pickAudioFile">
          Choose Audio File
        </button>
      </div>
      <div class="row">
        <label class="label">Path</label>
        <input v-model="filePath" class="input" placeholder="/absolute/path/to/audio.wav">
      </div>
      <div class="row">
        <label class="label">Language (optional)</label>
        <input
          v-model="language"
          class="input"
          placeholder="Chinese / English / French ..."
        >
      </div>
      <div class="row actions">
        <button class="btn" :disabled="!filePath" @click="transcribe">
          Transcribe
        </button>
        <button class="btn ghost" @click="checkHealth">
          Health Check
        </button>
      </div>
      <div class="status">
        {{ status }}
      </div>
      <div class="status">
        Chars: {{ transcriptChars }}
      </div>
      <div class="status">
        Elapsed: {{ transcriptElapsedMs }} ms ({{ (transcriptElapsedMs / 1000).toFixed(2) }} s)
      </div>
    </section>

    <section ref="resultCardRef" class="card result-card">
      <div class="result-title">
        Recognition Result
      </div>
      <div class="row">
        <label class="label">Detected language</label>
        <div class="path">
          {{ resultLanguage || '-' }}
        </div>
      </div>
      <div class="row">
        <label class="label">Transcript (Preview)</label>
      </div>
      <div class="result-box">
        {{ resultText || 'No transcript yet' }}
      </div>
      <div class="row">
        <label class="label">Transcript (Editable)</label>
      </div>
      <textarea v-model="resultText" class="output" placeholder="Transcript will appear here" />
      <div class="row">
        <label class="label">Raw Response</label>
      </div>
      <textarea class="log" readonly :value="lastResponseJson" placeholder="Raw ASR JSON response" />
    </section>
  </div>
</template>

<style scoped>
:root {
  color-scheme: light;
}

.page {
  min-height: 100vh;
  padding: 36px 24px 60px;
  overflow-y: auto;
  background: radial-gradient(circle at 20% 20%, #f5efe6, #f2f2f8 35%, #e8eff4 70%);
  font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
  color: #1b1b1b;
}

.hero {
  max-width: 900px;
  margin: 0 auto 24px;
}

.title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.subtitle {
  margin-top: 6px;
  color: #4a4a4a;
}

.card {
  max-width: 900px;
  margin: 0 auto 18px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: 0 12px 30px rgba(20, 20, 40, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.result-card {
  border: 1px solid rgba(27, 77, 255, 0.25);
}

.result-title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 700;
  color: #1637b8;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.label {
  width: 160px;
  font-weight: 600;
  color: #2f2f2f;
}

.file {
  flex: 1;
}

.path {
  flex: 1;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: #3e3e3e;
  padding: 8px 10px;
  background: #f7f7fb;
  border-radius: 8px;
}

.input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d3d3d9;
}

.actions {
  justify-content: flex-start;
}

.btn {
  padding: 8px 18px;
  border-radius: 999px;
  border: none;
  background: #1b4dff;
  color: white;
  cursor: pointer;
  font-weight: 600;
}

.btn.ghost {
  background: transparent;
  color: #1b4dff;
  border: 1px solid #1b4dff;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  margin-top: 6px;
  color: #555;
  min-height: 18px;
}

.output {
  width: 100%;
  min-height: 220px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #d5d5db;
  background: #fff;
  color: #111;
  font-family: "IBM Plex Mono", monospace;
  font-size: 13px;
}

.result-box {
  width: 100%;
  min-height: 96px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #d5d5db;
  background: #fff;
  color: #111;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "IBM Plex Mono", monospace;
  font-size: 13px;
  line-height: 1.5;
}

.log {
  width: 100%;
  min-height: 120px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #d5d5db;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  background: #f9f9fc;
  color: #2f2f2f;
}

@media (max-width: 720px) {
  .row {
    flex-direction: column;
    align-items: stretch;
  }

  .label {
    width: auto;
  }
}
</style>
