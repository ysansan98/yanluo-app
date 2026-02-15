import { ipcMain, type WebContents } from 'electron'
import type { AudioCapture, AudioChunk } from './types'

const IPC_AUDIO_START = 'voice:audio:start'
const IPC_AUDIO_STOP = 'voice:audio:stop'
const IPC_AUDIO_CHUNK = 'voice:audio:chunk'
const IPC_AUDIO_ERROR = 'voice:audio:error'
const IPC_AUDIO_STATE = 'voice:audio:state'

interface RendererAudioCaptureOptions {
  getTargetWebContents: () => WebContents | null
  log?: (message: string, extra?: Record<string, unknown>) => void
}

interface AudioChunkPayload {
  pcm16leBase64: string
  sampleRate: number
  channels: number
  timestampMs: number
}

interface AudioStatePayload {
  state: 'started' | 'stopped'
  timestampMs: number
}

interface AudioErrorPayload {
  message: string
}

export class RendererAudioCapture implements AudioCapture {
  private readonly getTargetWebContents: () => WebContents | null
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  private chunkHandler: ((chunk: AudioChunk) => void) | null = null
  private running = false
  private listenersBound = false

  constructor(options: RendererAudioCaptureOptions) {
    this.getTargetWebContents = options.getTargetWebContents
    this.log = options.log ?? ((message, extra) => console.info(`[audio-capture] ${message}`, extra ?? {}))
  }

  async start(): Promise<void> {
    if (this.running)
      return

    this.bindIpcListeners()
    const target = this.getTargetWebContents()
    if (!target) {
      throw new Error('Renderer is not ready for microphone capture')
    }

    target.send(IPC_AUDIO_START)
    this.running = true
    this.log('requested renderer microphone start')
  }

  async stop(): Promise<void> {
    const target = this.getTargetWebContents()
    if (target) {
      target.send(IPC_AUDIO_STOP)
    }

    if (this.running) {
      this.log('requested renderer microphone stop')
    }
    this.running = false
  }

  onChunk(cb: (chunk: AudioChunk) => void): void {
    this.chunkHandler = cb
  }

  private bindIpcListeners(): void {
    if (this.listenersBound)
      return

    ipcMain.on(IPC_AUDIO_CHUNK, (_event, payload: AudioChunkPayload) => {
      if (!this.running)
        return
      if (!payload?.pcm16leBase64)
        return

      const pcm16le = Buffer.from(payload.pcm16leBase64, 'base64')
      this.chunkHandler?.({
        pcm16le,
        sampleRate: 16000,
        channels: 1,
        timestampMs: payload.timestampMs ?? Date.now(),
      })
    })

    ipcMain.on(IPC_AUDIO_STATE, (_event, payload: AudioStatePayload) => {
      this.log('renderer capture state', payload ? { ...payload } : {})
    })

    ipcMain.on(IPC_AUDIO_ERROR, (_event, payload: AudioErrorPayload) => {
      this.log('renderer capture error', { message: payload?.message ?? 'unknown' })
    })

    this.listenersBound = true
  }
}

export class StubAudioCapture implements AudioCapture {
  private chunkHandler: ((chunk: AudioChunk) => void) | null = null

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  onChunk(cb: (chunk: AudioChunk) => void): void {
    this.chunkHandler = cb
  }

  emitChunk(chunk: AudioChunk): void {
    this.chunkHandler?.(chunk)
  }
}
