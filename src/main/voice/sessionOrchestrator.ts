import type {
  AudioCapture,
  HotkeyManager,
  PermissionChecker,
  SessionOrchestrator,
  StreamingAsrClient,
  TextInjector,
  VoiceSessionState,
} from './types'

interface SessionOrchestratorDeps {
  hotkeyManager: HotkeyManager
  audioCapture: AudioCapture
  asrClient: StreamingAsrClient
  textInjector: TextInjector
  permissionChecker: PermissionChecker
}

export class DefaultSessionOrchestrator implements SessionOrchestrator {
  private state: VoiceSessionState = 'IDLE'

  constructor(private readonly deps: SessionOrchestratorDeps) {}

  async init(): Promise<void> {
    await this.deps.hotkeyManager.start()
    this.deps.hotkeyManager.onPress(() => {
      void this.handleHotkeyPress()
    })
    this.deps.hotkeyManager.onRelease(() => {
      void this.handleHotkeyRelease()
    })
  }

  async dispose(): Promise<void> {
    await this.deps.hotkeyManager.stop()
    this.state = 'IDLE'
  }

  async handleHotkeyPress(): Promise<void> {
    this.state = 'ARMING'
  }

  async handleHotkeyRelease(): Promise<void> {
    if (this.state === 'STREAMING') {
      this.state = 'FINALIZING'
      return
    }
    if (this.state === 'ARMING') {
      this.state = 'IDLE'
    }
  }
}
