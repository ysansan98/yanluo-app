import { ipcRenderer } from 'electron'

const IPC_AUDIO_START = 'voice:audio:start'
const IPC_AUDIO_STOP = 'voice:audio:stop'
const IPC_AUDIO_CHUNK = 'voice:audio:chunk'
const IPC_AUDIO_ERROR = 'voice:audio:error'
const IPC_AUDIO_STATE = 'voice:audio:state'

const TARGET_SAMPLE_RATE = 16000

class MicCaptureBridge {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private running = false

  bind(): void {
    ipcRenderer.send(IPC_AUDIO_STATE, { state: 'stopped', timestampMs: Date.now(), phase: 'bridge-bound' })
    ipcRenderer.on(IPC_AUDIO_START, () => {
      void this.start()
    })
    ipcRenderer.on(IPC_AUDIO_STOP, () => {
      void this.stop()
    })
  }

  private async start(): Promise<void> {
    if (this.running)
      return

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is unavailable in preload context')
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: false,
          autoGainControl: true,
        },
        video: false,
      })

      this.audioContext = new AudioContext()
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.processorNode.onaudioprocess = (event) => {
        if (!this.running)
          return
        const floatData = event.inputBuffer.getChannelData(0)
        const pcm16 = this.resampleTo16kPcm16(floatData, this.audioContext?.sampleRate ?? 48000)
        if (pcm16.length === 0)
          return

        const payload = {
          pcm16leBase64: Buffer.from(pcm16.buffer).toString('base64'),
          sampleRate: TARGET_SAMPLE_RATE,
          channels: 1,
          timestampMs: Date.now(),
        }
        ipcRenderer.send(IPC_AUDIO_CHUNK, payload)
      }

      this.sourceNode.connect(this.processorNode)
      this.processorNode.connect(this.audioContext.destination)
      this.running = true
      ipcRenderer.send(IPC_AUDIO_STATE, { state: 'started', timestampMs: Date.now() })
    }
    catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError'
      const message = error instanceof Error ? error.message : String(error)
      ipcRenderer.send(IPC_AUDIO_ERROR, { message: `${name}: ${message}` })
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

    ipcRenderer.send(IPC_AUDIO_STATE, { state: 'stopped', timestampMs: Date.now() })
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

  private floatToInt16(sample: number): number {
    const clamped = Math.max(-1, Math.min(1, sample))
    return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
  }
}

export function bindMicCaptureBridge(): void {
  if (typeof window === 'undefined' || !('navigator' in window))
    return

  const bridge = new MicCaptureBridge()
  bridge.bind()
}
