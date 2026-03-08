import { MIC_DEVICE_STORAGE_KEY } from '../constants/audio'

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

  init(): void {
    this.stopAudioStartListener = window.api.voice.onAudioStart(() => {
      void this.start()
    })
    this.stopAudioStopListener = window.api.voice.onAudioStop(() => {
      void this.stop()
    })

    window.api.voice.sendAudioState({
      state: 'stopped',
      timestampMs: Date.now(),
      phase: 'renderer-bridge-ready',
    })
  }

  private resolveSelectedMicrophoneId(): string | null {
    try {
      const selected = localStorage.getItem(MIC_DEVICE_STORAGE_KEY)
      return selected && selected.trim() ? selected : null
    }
    catch {
      return null
    }
  }

  private async createInputStream(): Promise<MediaStream> {
    const baseConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: false,
    }
    const preferredDeviceId = this.resolveSelectedMicrophoneId()

    if (!preferredDeviceId) {
      return navigator.mediaDevices.getUserMedia({
        audio: baseConstraints,
        video: false,
      })
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          ...baseConstraints,
          deviceId: { exact: preferredDeviceId },
        },
        video: false,
      })
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'OverconstrainedError') {
        localStorage.removeItem(MIC_DEVICE_STORAGE_KEY)
      }
      return navigator.mediaDevices.getUserMedia({
        audio: baseConstraints,
        video: false,
      })
    }
  }

  dispose(): void {
    this.stopAudioStartListener?.()
    this.stopAudioStopListener?.()
    this.stopAudioStartListener = null
    this.stopAudioStopListener = null
    void this.stop()
  }

  private async start(): Promise<void> {
    if (this.running)
      return

    try {
      this.stream = await this.createInputStream()

      this.audioContext = new AudioContext()
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.processorNode.onaudioprocess = (event) => {
        if (!this.running)
          return

        const input = event.inputBuffer.getChannelData(0)
        const rms = this.calculateRms(input)
        const maxAbs = this.calculateMaxAbs(input)
        const pcm16 = this.resampleTo16kPcm16(
          input,
          this.audioContext?.sampleRate ?? 48000,
        )
        if (pcm16.length === 0)
          return
        const nonZeroRatio = this.calculateNonZeroRatio(pcm16)

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
        phase: JSON.stringify(
          this.stream?.getAudioTracks()[0]?.getSettings() ?? {},
        ),
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

  private calculateRms(input: Float32Array): number {
    if (input.length === 0)
      return 0
    let sum = 0
    for (let i = 0; i < input.length; i += 1) {
      sum += input[i] * input[i]
    }
    return Math.sqrt(sum / input.length)
  }

  private resampleTo16kPcm16(
    input: Float32Array,
    inputRate: number,
  ): Int16Array {
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
    return clamped < 0
      ? Math.round(clamped * 32768)
      : Math.round(clamped * 32767)
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
