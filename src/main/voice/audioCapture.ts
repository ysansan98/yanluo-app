import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AudioCapture, AudioChunk } from './types'

interface CommandCandidate {
  cmd: string
  args: string[]
}

interface AudioCaptureOptions {
  sampleRate?: 16000
  chunkMs?: number
  commandCandidates?: CommandCandidate[]
  log?: (message: string, extra?: Record<string, unknown>) => void
}

const DEFAULT_SAMPLE_RATE = 16000 as const
const DEFAULT_CHUNK_MS = 40

const DEFAULT_COMMAND_CANDIDATES: CommandCandidate[] = [
  {
    cmd: 'rec',
    args: ['-q', '-t', 'raw', '-b', '16', '-e', 'signed-integer', '-c', '1', '-r', '16000', '-'],
  },
  {
    cmd: 'sox',
    args: ['-q', '-d', '-t', 'raw', '-b', '16', '-e', 'signed-integer', '-c', '1', '-r', '16000', '-'],
  },
]

export class CommandAudioCapture implements AudioCapture {
  private readonly sampleRate: 16000
  private readonly chunkMs: number
  private readonly chunkBytes: number
  private readonly commandCandidates: CommandCandidate[]
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  private audioProcess: ChildProcessWithoutNullStreams | null = null
  private chunkHandler: ((chunk: AudioChunk) => void) | null = null
  private buffered = Buffer.alloc(0)
  private running = false
  private chunkCount = 0

  constructor(options: AudioCaptureOptions = {}) {
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE
    this.chunkMs = options.chunkMs ?? DEFAULT_CHUNK_MS
    this.chunkBytes = Math.floor((this.sampleRate * 2 * this.chunkMs) / 1000)
    this.commandCandidates = options.commandCandidates ?? DEFAULT_COMMAND_CANDIDATES
    this.log = options.log ?? ((message, extra) => console.info(`[audio-capture] ${message}`, extra ?? {}))
  }

  async start(): Promise<void> {
    if (this.running)
      return

    const candidate = this.findAvailableCommand()
    if (!candidate) {
      throw new Error(
        'No audio capture command found. Install sox (`brew install sox`) or provide commandCandidates.',
      )
    }

    this.buffered = Buffer.alloc(0)
    this.chunkCount = 0

    this.audioProcess = spawn(candidate.cmd, candidate.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })
    const proc = this.audioProcess
    proc.stdin.end()

    proc.on('error', (error) => {
      this.log('capture process error', { error: error.message })
    })

    proc.on('exit', (code, signal) => {
      this.log('capture process exited', { code, signal })
      this.running = false
      this.audioProcess = null
    })

    proc.stderr.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line)
        this.log('capture stderr', { line })
    })

    proc.stdout.on('data', (data: Buffer) => {
      this.handleData(data)
    })

    this.running = true
    this.log('capture started', {
      cmd: candidate.cmd,
      args: candidate.args.join(' '),
      sampleRate: this.sampleRate,
      chunkMs: this.chunkMs,
      chunkBytes: this.chunkBytes,
    })
  }

  async stop(): Promise<void> {
    if (!this.audioProcess && !this.running)
      return

    const processRef = this.audioProcess
    this.running = false
    this.audioProcess = null
    this.buffered = Buffer.alloc(0)

    if (processRef && !processRef.killed) {
      processRef.kill('SIGTERM')
    }

    this.log('capture stopped', { emittedChunks: this.chunkCount })
  }

  onChunk(cb: (chunk: AudioChunk) => void): void {
    this.chunkHandler = cb
  }

  private handleData(data: Buffer): void {
    if (!this.running)
      return

    this.buffered = Buffer.concat([this.buffered, data])

    while (this.buffered.length >= this.chunkBytes) {
      const pcm16le = this.buffered.subarray(0, this.chunkBytes)
      this.buffered = this.buffered.subarray(this.chunkBytes)
      this.chunkCount += 1
      this.chunkHandler?.({
        pcm16le,
        sampleRate: DEFAULT_SAMPLE_RATE,
        channels: 1,
        timestampMs: Date.now(),
      })
    }
  }

  private findAvailableCommand(): CommandCandidate | null {
    for (const candidate of this.commandCandidates) {
      const result = spawnSync('which', [candidate.cmd], {
        stdio: 'ignore',
        env: process.env,
      })
      if (result.status === 0)
        return candidate
    }
    return null
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
