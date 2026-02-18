import type { WebContents } from 'electron'
import type { AudioCapture, AudioChunk } from './types'
import { Buffer } from 'node:buffer'
import { ipcMain } from 'electron'
import { AUDIO_IPC } from '~shared/voice'

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
  state: 'started' | 'stopped' | 'running'
  timestampMs: number
  phase?: string
  rms?: number
  maxAbs?: number
  nonZeroRatio?: number
  audioContextState?: string
  inputDeviceLabel?: string
}

interface AudioErrorPayload {
  message: string
}

export class RendererAudioCapture implements AudioCapture {
  private readonly getTargetWebContents: () => WebContents | null
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  private chunkHandler: ((chunk: AudioChunk) => void) | null = null
  private silentCancelHandlers: Array<() => void> = []
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

    target.send(AUDIO_IPC.START)
    this.running = true
    this.log('requested renderer microphone start')
  }

  async stop(): Promise<void> {
    const target = this.getTargetWebContents()
    if (target) {
      target.send(AUDIO_IPC.STOP)
    }

    if (this.running) {
      this.log('requested renderer microphone stop')
    }
    this.running = false
  }

  onChunk(cb: (chunk: AudioChunk) => void): void {
    this.chunkHandler = cb
  }

  onSilentCancel(cb: () => void): void {
    this.silentCancelHandlers.push(cb)
  }

  private bindIpcListeners(): void {
    if (this.listenersBound)
      return

    ipcMain.on(AUDIO_IPC.CHUNK, (_event, payload: AudioChunkPayload) => {
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

    ipcMain.on(AUDIO_IPC.STATE, (_event, payload: AudioStatePayload) => {
      this.log('renderer capture state', payload ? { ...payload } : {})
    })

    ipcMain.on(AUDIO_IPC.ERROR, (_event, payload: AudioErrorPayload) => {
      this.log('renderer capture error', { message: payload?.message ?? 'unknown' })
    })

    ipcMain.on(AUDIO_IPC.VAD_SILENT_CANCEL, () => {
      this.log('silent cancel requested by VAD')
      this.silentCancelHandlers.forEach(cb => cb())
    })

    this.listenersBound = true
  }
}

export class StubAudioCapture implements AudioCapture {
  private chunkHandler: ((chunk: AudioChunk) => void) | null = null
  private silentCancelHandlers: Array<() => void> = []

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  onChunk(cb: (chunk: AudioChunk) => void): void {
    this.chunkHandler = cb
  }

  onSilentCancel(cb: () => void): void {
    this.silentCancelHandlers.push(cb)
  }

  emitChunk(chunk: AudioChunk): void {
    this.chunkHandler?.(chunk)
  }

  emitSilentCancel(): void {
    this.silentCancelHandlers.forEach(cb => cb())
  }
}
