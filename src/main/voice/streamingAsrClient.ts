import type { Buffer } from 'node:buffer'

import type {
  AsrFinalResponse,
  AsrPartialResponse,
  AsrStartRequest,
  StreamingAsrClient,
  VoiceError,
} from './types'

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
