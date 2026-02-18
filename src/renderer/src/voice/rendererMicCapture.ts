import type { VadConfig } from '~shared/voice'
import { DEFAULT_VAD_CONFIG, VAD_ENERGY_THRESHOLDS } from '~shared/voice'

const TARGET_SAMPLE_RATE = 16000

class RendererMicCaptureManager {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private running = false
  private chunkCounter = 0
  private lastRmsReportAt = 0
  private stopAudioStartListener: (() => void) | null = null
  private stopAudioStopListener: (() => void) | null = null
  private stopVadConfigUpdatedListener: (() => void) | null = null

  // VAD related
  private vadConfig: VadConfig = { ...DEFAULT_VAD_CONFIG }
  private fullAudioSamples: Float32Array[] = []
  private activityWindow: boolean[] = []
  private hasValidSpeech = false

  init(): void {
    this.stopAudioStartListener = window.api.voice.onAudioStart(() => {
      void this.start()
    })
    this.stopAudioStopListener = window.api.voice.onAudioStop(() => {
      void this.stop()
    })

    // Load VAD config
    void this.loadVadConfig()

    // Listen for VAD config updates
    this.stopVadConfigUpdatedListener = window.api.voice.onVadConfigUpdated?.((config) => {
      this.vadConfig = { ...this.vadConfig, ...config }
      console.log('[VAD] Config updated', this.vadConfig)
    })

    window.api.voice.sendAudioState({
      state: 'stopped',
      timestampMs: Date.now(),
      phase: 'renderer-bridge-ready',
    })
  }

  private async loadVadConfig(): Promise<void> {
    try {
      const config = await window.api.voice.getVadConfig?.()
      if (config) {
        this.vadConfig = config
      }
    }
    catch (err) {
      console.warn('[VAD] Failed to load config', err)
    }
  }

  dispose(): void {
    this.stopAudioStartListener?.()
    this.stopAudioStopListener?.()
    this.stopVadConfigUpdatedListener?.()
    this.stopAudioStartListener = null
    this.stopAudioStopListener = null
    this.stopVadConfigUpdatedListener = null
    void this.stop()
  }

  private async start(): Promise<void> {
    if (this.running)
      return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
        },
        video: false,
      })

      this.audioContext = new AudioContext()
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

      // Reset VAD state
      this.hasValidSpeech = false
      this.fullAudioSamples = []
      this.activityWindow = []

      this.processorNode.onaudioprocess = (event) => {
        if (!this.running)
          return

        const input = event.inputBuffer.getChannelData(0)
        const rms = this.calculateRms(input)
        const maxAbs = this.calculateMaxAbs(input)
        const pcm16 = this.resampleTo16kPcm16(input, this.audioContext?.sampleRate ?? 48000)
        if (pcm16.length === 0)
          return
        const nonZeroRatio = this.calculateNonZeroRatio(pcm16)

        // Save full audio for final VAD analysis
        const float32ForVad = new Float32Array(pcm16.length)
        for (let i = 0; i < pcm16.length; i++) {
          float32ForVad[i] = pcm16[i] < 0 ? pcm16[i] / 32768 : pcm16[i] / 32767
        }
        this.fullAudioSamples.push(float32ForVad)

        // Energy-based detection for real-time UI feedback
        if (this.vadConfig.enabled) {
          const isActive = rms > VAD_ENERGY_THRESHOLDS.MIN_RMS || maxAbs > VAD_ENERGY_THRESHOLDS.ACTIVE_ABS_THRESHOLD
          this.activityWindow.push(isActive)
          if (this.activityWindow.length > VAD_ENERGY_THRESHOLDS.ACTIVITY_WINDOW_SIZE) {
            this.activityWindow.shift()
          }

          // If enough active frames in the window, mark as potentially valid
          const activeCount = this.activityWindow.filter(Boolean).length
          if (activeCount >= VAD_ENERGY_THRESHOLDS.MIN_ACTIVE_FRAMES) {
            this.hasValidSpeech = true
          }
        }

        this.chunkCounter += 1
        window.api.voice.sendAudioChunk({
          pcm16leBase64: this.int16ToBase64(pcm16),
          sampleRate: TARGET_SAMPLE_RATE,
          channels: 1,
          timestampMs: Date.now(),
        })

        const now = Date.now()
        if (now - this.lastRmsReportAt >= 1000) {
          this.lastRmsReportAt = now
          const track = this.stream?.getAudioTracks()[0]
          window.api.voice.sendAudioState({
            state: 'running',
            timestampMs: now,
            rms: Number(rms.toFixed(6)),
            maxAbs: Number(maxAbs.toFixed(6)),
            nonZeroRatio: Number(nonZeroRatio.toFixed(6)),
            audioContextState: this.audioContext?.state,
            inputDeviceLabel: this.stream?.getAudioTracks()[0]?.label ?? '',
            phase: JSON.stringify({
              enabled: track?.enabled,
              muted: track?.muted,
              readyState: track?.readyState,
              vadEnabled: this.vadConfig.enabled,
              hasValidSpeech: this.hasValidSpeech,
            }),
          })
        }
      }

      this.sourceNode.connect(this.processorNode)
      this.processorNode.connect(this.audioContext.destination)
      this.running = true
      this.chunkCounter = 0
      this.lastRmsReportAt = 0

      window.api.voice.sendAudioState({
        state: 'started',
        timestampMs: Date.now(),
        audioContextState: this.audioContext.state,
        inputDeviceLabel: this.stream?.getAudioTracks()[0]?.label ?? '',
        phase: JSON.stringify(this.stream?.getAudioTracks()[0]?.getSettings() ?? {}),
      })
    }
    catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError'
      const message = error instanceof Error ? error.message : String(error)
      window.api.voice.sendAudioError({ message: `${name}: ${message}` })
      await this.stop()
    }
  }

  private async stop(): Promise<void> {
    if (!this.running && !this.stream && !this.audioContext)
      return

    this.running = false

    // Analyze full audio with energy-based VAD
    if (this.vadConfig.enabled) {
      // Concatenate full audio
      const totalLength = this.fullAudioSamples.reduce((sum, arr) => sum + arr.length, 0)
      const fullAudio = new Float32Array(totalLength)
      let offset = 0
      for (const chunk of this.fullAudioSamples) {
        fullAudio.set(chunk, offset)
        offset += chunk.length
      }

      const durationMs = (fullAudio.length / TARGET_SAMPLE_RATE) * 1000
      let shouldCancel = false

      // Check minimum duration first
      if (durationMs < this.vadConfig.minDurationMs) {
        console.log('[VAD] Audio too short, canceling', { durationMs })
        shouldCancel = true
      }
      else {
        // Energy-based check
        shouldCancel = this.energyCheck(fullAudio)
      }

      if (shouldCancel) {
        console.log('[VAD] No valid speech detected, requesting silent cancel', { durationMs })
        window.api.voice.requestSilentCancel?.()
      }
      else {
        console.log('[VAD] Valid speech detected, proceeding')
      }
    }

    this.fullAudioSamples = []
    this.activityWindow = []

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null
      this.processorNode.disconnect()
      this.processorNode = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    window.api.voice.sendAudioState({
      state: 'stopped',
      timestampMs: Date.now(),
    })
  }

  private energyCheck(samples: Float32Array): boolean {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      sum += s * s
    }

    const rms = Math.sqrt(sum / samples.length)
    const hasEnoughRms = rms >= VAD_ENERGY_THRESHOLDS.MIN_RMS

    return !hasEnoughRms || !this.hasValidSpeech
  }

  private calculateRms(input: Float32Array): number {
    if (input.length === 0)
      return 0
    let sum = 0
    for (let i = 0; i < input.length; i += 1) {
      sum += input[i] * input[i]
    }
    return Math.sqrt(sum / input.length)
  }

  private resampleTo16kPcm16(input: Float32Array, inputRate: number): Int16Array {
    if (input.length === 0 || inputRate <= 0)
      return new Int16Array(0)

    if (inputRate === TARGET_SAMPLE_RATE) {
      const pcm = new Int16Array(input.length)
      for (let i = 0; i < input.length; i += 1) {
        pcm[i] = this.floatToInt16(input[i])
      }
      return pcm
    }

    const ratio = inputRate / TARGET_SAMPLE_RATE
    const outputLength = Math.max(1, Math.floor(input.length / ratio))
    const output = new Int16Array(outputLength)
    for (let i = 0; i < outputLength; i += 1) {
      const index = i * ratio
      const low = Math.floor(index)
      const high = Math.min(low + 1, input.length - 1)
      const weight = index - low
      const sample = input[low] * (1 - weight) + input[high] * weight
      output[i] = this.floatToInt16(sample)
    }
    return output
  }

  private calculateMaxAbs(input: Float32Array): number {
    if (input.length === 0)
      return 0
    let maxAbs = 0
    for (let i = 0; i < input.length; i += 1) {
      const abs = Math.abs(input[i])
      if (abs > maxAbs)
        maxAbs = abs
    }
    return maxAbs
  }

  private calculateNonZeroRatio(input: Int16Array): number {
    if (input.length === 0)
      return 0
    let count = 0
    for (let i = 0; i < input.length; i += 1) {
      if (input[i] !== 0)
        count += 1
    }
    return count / input.length
  }

  private floatToInt16(sample: number): number {
    const clamped = Math.max(-1, Math.min(1, sample))
    return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
  }

  private int16ToBase64(data: Int16Array): string {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}

let singleton: RendererMicCaptureManager | null = null

export function initRendererMicCapture(): void {
  if (singleton)
    return
  singleton = new RendererMicCaptureManager()
  singleton.init()
}
