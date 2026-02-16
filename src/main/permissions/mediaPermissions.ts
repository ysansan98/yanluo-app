import { session } from 'electron'

export function setupMediaPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === 'media') {
      const mediaType = (details as { mediaType?: string } | undefined)?.mediaType
      return mediaType === 'audio' || mediaType === undefined
    }
    return false
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') {
      const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? []
      callback(mediaTypes.length === 0 || mediaTypes.includes('audio'))
      return
    }
    callback(false)
  })
}
