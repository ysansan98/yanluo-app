import type { Buffer } from 'node:buffer'
import type {
  AsrFinalResponse,
  AsrPartialResponse,
  AsrStartRequest,
  StreamingAsrClient,
  VoiceError,
  VoiceErrorCode,
} from './types'

interface StreamingAsrClientOptions {
  wsUrl: string
  log?: (message: string, extra?: Record<string, unknown>) => void
}

interface ServerMessage {
  type?: string
  sessionId?: string
  text?: string
  isFinal?: boolean
  code?: string
  message?: string
}

export class WsStreamingAsrClient implements StreamingAsrClient {
  private ws: WebSocket | null = null
  private connecting: Promise<void> | null = null

  private partialHandler: ((msg: AsrPartialResponse) => void) | null = null
  private finalHandler: ((msg: AsrFinalResponse) => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null
  private activeSessionId: string | null = null
  private acceptingAudio = false

  private readonly wsUrl: string
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  constructor(options: StreamingAsrClientOptions) {
    this.wsUrl = options.wsUrl
    this.log = options.log ?? ((message, extra) => console.info(`[voice-asr] ${message}`, extra ?? {}))
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      return
    if (this.connecting)
      return this.connecting

    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws

      ws.addEventListener('open', () => {
        if (this.ws !== ws)
          return
        this.log('connected', { wsUrl: this.wsUrl })
        this.connecting = null
        resolve()
      })

      ws.addEventListener('message', (event) => {
        if (this.ws !== ws)
          return
        this.handleMessage(event.data)
      })

      ws.addEventListener('error', () => {
        if (this.ws !== ws)
          return
        const err: VoiceError = {
          code: 'E_ASR_CONNECT',
          message: 'WebSocket connection error',
          recoverable: true,
        }
        this.emitError(err)
      })

      ws.addEventListener('close', (event) => {
        if (this.ws !== ws)
          return
        this.log('disconnected', { code: event.code, reason: event.reason })
        this.acceptingAudio = false
        this.activeSessionId = null
        this.ws = null
        this.connecting = null
      })

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN)
          return
        try {
          ws.close()
        }
        catch {}
        const err = new Error('Timed out while connecting streaming ASR websocket')
        this.connecting = null
        reject(err)
      }, 3000)
    })

    return this.connecting
  }

  async start(req: AsrStartRequest): Promise<void> {
    await this.ensureConnected()
    this.activeSessionId = req.sessionId
    this.acceptingAudio = true
    this.sendJson({
      type: 'start',
      sessionId: req.sessionId,
      sampleRate: req.sampleRate,
      language: req.language,
    })
  }

  async sendAudio(chunk: Buffer): Promise<void> {
    await this.ensureConnected()
    if (!this.acceptingAudio || !this.activeSessionId)
      return
    this.sendJson({
      type: 'audio',
      sessionId: this.activeSessionId,
      pcm16leBase64: chunk.toString('base64'),
    })
  }

  async end(sessionId: string): Promise<void> {
    await this.ensureConnected()
    if (!this.acceptingAudio || this.activeSessionId !== sessionId)
      return
    this.acceptingAudio = false
    this.sendJson({ type: 'end', sessionId })
  }

  async close(): Promise<void> {
    this.acceptingAudio = false
    this.activeSessionId = null
    if (!this.ws)
      return

    const ws = this.ws
    this.ws = null
    this.connecting = null

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }

  onPartial(cb: (msg: AsrPartialResponse) => void): void {
    this.partialHandler = cb
  }

  onFinal(cb: (msg: AsrFinalResponse) => void): void {
    this.finalHandler = cb
  }

  onError(cb: (err: VoiceError) => void): void {
    this.errorHandler = cb
  }

  private async ensureConnected(): Promise<void> {
    await this.connect()
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('ASR websocket is not open')
    }
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('ASR websocket is not open')
    }
    this.ws.send(JSON.stringify(payload))
  }

  private handleMessage(raw: unknown): void {
    try {
      const text = typeof raw === 'string' ? raw : String(raw)
      const msg = JSON.parse(text) as ServerMessage

      if (msg.type === 'partial' && msg.sessionId && typeof msg.text === 'string') {
        this.partialHandler?.({
          sessionId: msg.sessionId,
          text: msg.text,
          isFinal: false,
        })
        return
      }

      if (msg.type === 'final' && msg.sessionId && typeof msg.text === 'string') {
        this.finalHandler?.({
          sessionId: msg.sessionId,
          text: msg.text,
          isFinal: true,
        })
        return
      }

      if (msg.type === 'error') {
        const code = this.mapErrorCode(msg.code)
        const err: VoiceError = {
          code,
          message: msg.message ?? 'Unknown ASR stream error',
          recoverable: true,
        }
        this.emitError(err)
        return
      }

      this.log('ignored unknown server message', { raw: text })
    }
    catch (error) {
      this.emitError({
        code: 'E_ASR_CONNECT',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      })
    }
  }

  private mapErrorCode(serverCode?: string): VoiceErrorCode {
    switch (serverCode) {
      case 'E_EMPTY_RESULT':
        return 'E_EMPTY_RESULT'
      case 'E_ASR_TIMEOUT':
        return 'E_ASR_TIMEOUT'
      default:
        return 'E_ASR_CONNECT'
    }
  }

  private emitError(err: VoiceError): void {
    this.log('error', { code: err.code, message: err.message })
    this.errorHandler?.(err)
  }
}

export class StubStreamingAsrClient implements StreamingAsrClient {
  private partialHandler: ((msg: AsrPartialResponse) => void) | null = null
  private finalHandler: ((msg: AsrFinalResponse) => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  async connect(): Promise<void> {}

  async start(_req: AsrStartRequest): Promise<void> {}

  async sendAudio(_chunk: Buffer): Promise<void> {}

  async end(_sessionId: string): Promise<void> {}

  async close(): Promise<void> {}

  onPartial(cb: (msg: AsrPartialResponse) => void): void {
    this.partialHandler = cb
  }

  onFinal(cb: (msg: AsrFinalResponse) => void): void {
    this.finalHandler = cb
  }

  onError(cb: (err: VoiceError) => void): void {
    this.errorHandler = cb
  }

  emitPartial(msg: AsrPartialResponse): void {
    this.partialHandler?.(msg)
  }

  emitFinal(msg: AsrFinalResponse): void {
    this.finalHandler?.(msg)
  }

  emitError(err: VoiceError): void {
    this.errorHandler?.(err)
  }
}
