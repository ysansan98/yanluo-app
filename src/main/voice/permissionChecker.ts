import type {
  PermissionChecker,
  PermissionKind,
  PermissionStatus,
} from './types'
import process from 'node:process'
import { systemPreferences } from 'electron'

export class MacPermissionChecker implements PermissionChecker {
  async check(kind: PermissionKind): Promise<PermissionStatus> {
    if (process.platform !== 'darwin')
      return 'GRANTED'

    if (kind === 'MICROPHONE') {
      return this.fromMediaStatus(
        systemPreferences.getMediaAccessStatus('microphone'),
      )
    }

    if (kind === 'ACCESSIBILITY') {
      return systemPreferences.isTrustedAccessibilityClient(false)
        ? 'GRANTED'
        : 'DENIED'
    }

    return 'NOT_DETERMINED'
  }

  async ensureOrPrompt(kind: PermissionKind): Promise<PermissionStatus> {
    if (process.platform !== 'darwin')
      return 'GRANTED'

    if (kind === 'MICROPHONE') {
      const status = await this.check(kind)
      if (status === 'GRANTED')
        return status

      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (granted)
        return 'GRANTED'

      return status
    }

    if (kind === 'ACCESSIBILITY') {
      return systemPreferences.isTrustedAccessibilityClient(true)
        ? 'GRANTED'
        : 'DENIED'
    }

    return this.check(kind)
  }

  private fromMediaStatus(
    status: ReturnType<typeof systemPreferences.getMediaAccessStatus>,
  ): PermissionStatus {
    if (status === 'granted')
      return 'GRANTED'
    if (status === 'denied')
      return 'DENIED'
    if (status === 'restricted')
      return 'RESTRICTED'
    return 'NOT_DETERMINED'
  }
}

export class StubPermissionChecker implements PermissionChecker {
  async check(_kind: PermissionKind): Promise<PermissionStatus> {
    return 'NOT_DETERMINED'
  }

  async ensureOrPrompt(kind: PermissionKind): Promise<PermissionStatus> {
    return this.check(kind)
  }
}
