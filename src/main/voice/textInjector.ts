import type { InjectResult, TextInjector } from './types'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { clipboard, nativeImage, systemPreferences } from 'electron'

interface ClipboardSnapshot {
  hasData: boolean
  text: string
  html: string
  rtf: string
  bookmarkTitle: string
  bookmarkUrl: string
  findText: string
  imageDataUrl: string
}

const RESTORE_CLIPBOARD_DELAY_MS = 180
const RESTORE_CLIPBOARD_RETRY = 3
const RESTORE_RETRY_INTERVAL_MS = 80

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function captureClipboard(): ClipboardSnapshot {
  const text = clipboard.readText()
  const html = clipboard.readHTML()
  const rtf = clipboard.readRTF()
  const findText = clipboard.readFindText()
  const bookmark = clipboard.readBookmark()
  const imageDataUrl = clipboard.readImage().toDataURL()
  const hasData = clipboard.availableFormats().length > 0
    || text.length > 0
    || html.length > 0
    || rtf.length > 0
    || findText.length > 0
    || bookmark.title.length > 0
    || bookmark.url.length > 0
    || imageDataUrl.length > 0

  return {
    hasData,
    text,
    html,
    rtf,
    bookmarkTitle: bookmark.title,
    bookmarkUrl: bookmark.url,
    findText,
    imageDataUrl,
  }
}

function restoreClipboard(snapshot: ClipboardSnapshot): void {
  clipboard.clear()
  if (!snapshot.hasData) {
    return
  }

  const writeData: {
    text?: string
    html?: string
    rtf?: string
    bookmark?: string
    image?: Electron.NativeImage
  } = {}

  if (snapshot.text.length > 0)
    writeData.text = snapshot.text
  if (snapshot.html.length > 0)
    writeData.html = snapshot.html
  if (snapshot.rtf.length > 0)
    writeData.rtf = snapshot.rtf
  if (snapshot.bookmarkUrl.length > 0)
    writeData.bookmark = snapshot.bookmarkUrl
  if (snapshot.imageDataUrl.length > 0)
    writeData.image = nativeImage.createFromDataURL(snapshot.imageDataUrl)

  if (Object.keys(writeData).length > 0) {
    clipboard.write(writeData)
  }
  if (snapshot.bookmarkTitle.length > 0 && snapshot.bookmarkUrl.length > 0) {
    clipboard.writeBookmark(snapshot.bookmarkTitle, snapshot.bookmarkUrl)
  }
  if (snapshot.findText.length > 0) {
    clipboard.writeFindText(snapshot.findText)
  }
}

function isClipboardRestored(snapshot: ClipboardSnapshot): boolean {
  const currentBookmark = clipboard.readBookmark()
  return clipboard.readText() === snapshot.text
    && clipboard.readHTML() === snapshot.html
    && clipboard.readRTF() === snapshot.rtf
    && clipboard.readFindText() === snapshot.findText
    && currentBookmark.title === snapshot.bookmarkTitle
    && currentBookmark.url === snapshot.bookmarkUrl
}

async function restoreClipboardWithRetry(snapshot: ClipboardSnapshot): Promise<void> {
  for (let i = 0; i < RESTORE_CLIPBOARD_RETRY; i += 1) {
    restoreClipboard(snapshot)
    if (isClipboardRestored(snapshot)) {
      return
    }
    await delay(RESTORE_RETRY_INTERVAL_MS)
  }
}

export class StubTextInjector implements TextInjector {
  async inject(text: string): Promise<InjectResult> {
    if (!text.trim()) {
      return {
        ok: false,
        mode: 'CLIPBOARD_ONLY',
        reason: 'Empty text cannot be injected',
      }
    }

    return {
      ok: true,
      mode: 'CLIPBOARD_ONLY',
      reason: 'Stub injector currently uses clipboard fallback semantics',
    }
  }
}

export class MacTextInjector implements TextInjector {
  async inject(text: string): Promise<InjectResult> {
    const normalizedText = text.trim()
    if (!normalizedText) {
      return {
        ok: false,
        mode: 'CLIPBOARD_ONLY',
        reason: 'Empty text cannot be injected',
      }
    }

    const clipboardSnapshot = captureClipboard()
    clipboard.writeText(normalizedText)

    if (process.platform !== 'darwin') {
      return {
        ok: true,
        mode: 'CLIPBOARD_ONLY',
        reason: 'Clipboard updated (paste shortcut is only implemented on macOS)',
      }
    }

    const accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(false)
    if (!accessibilityGranted) {
      return {
        ok: true,
        mode: 'CLIPBOARD_ONLY',
        reason: 'Clipboard updated (Accessibility permission is required for auto paste)',
      }
    }

    try {
      await execFileAsync('/usr/bin/osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using command down',
      ])
      await delay(RESTORE_CLIPBOARD_DELAY_MS)
      await restoreClipboardWithRetry(clipboardSnapshot)
      return {
        ok: true,
        mode: 'PASTE',
      }
    }
    catch (error) {
      return {
        ok: true,
        mode: 'CLIPBOARD_ONLY',
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
