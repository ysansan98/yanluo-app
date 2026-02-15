import type { PermissionChecker, PermissionKind, PermissionStatus } from './types'

export class StubPermissionChecker implements PermissionChecker {
  async check(_kind: PermissionKind): Promise<PermissionStatus> {
    return 'NOT_DETERMINED'
  }

  async ensureOrPrompt(kind: PermissionKind): Promise<PermissionStatus> {
    return this.check(kind)
  }
}
