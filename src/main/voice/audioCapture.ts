import type { AudioCapture, AudioChunk } from './types'

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
