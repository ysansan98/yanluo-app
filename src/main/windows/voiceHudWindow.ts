import type { NativeImage } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'

interface CreateVoiceHudWindowOptions {
  icon: NativeImage | string
}

const VOICE_HUD_WIDTH = 360
const VOICE_HUD_HEIGHT = 98
const VOICE_HUD_BOTTOM_OFFSET = 88

function getVoiceHudBounds() {
  const workArea = screen.getPrimaryDisplay().workArea
  const x = Math.round(workArea.x + (workArea.width - VOICE_HUD_WIDTH) / 2)
  const y = Math.round(workArea.y + workArea.height - VOICE_HUD_HEIGHT - VOICE_HUD_BOTTOM_OFFSET)
  return { x, y, width: VOICE_HUD_WIDTH, height: VOICE_HUD_HEIGHT }
}

export class VoiceHudWindowController {
  private voiceHudWindow: BrowserWindow | null = null
  private hideTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: CreateVoiceHudWindowOptions) {}

  create(): BrowserWindow {
    const bounds = getVoiceHudBounds()
    this.voiceHudWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      ...(process.platform === 'linux' ? { icon: this.options.icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    this.voiceHudWindow.setAlwaysOnTop(true, 'screen-saver')
    this.voiceHudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.voiceHudWindow.setIgnoreMouseEvents(true, { forward: true })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      void this.voiceHudWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/voice-hud`)
    }
    else {
      void this.voiceHudWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/voice-hud',
      })
    }

    this.voiceHudWindow.on('closed', () => {
      this.clearHideTimer()
      this.voiceHudWindow = null
    })

    return this.voiceHudWindow
  }

  getWindow(): BrowserWindow | null {
    if (!this.voiceHudWindow || this.voiceHudWindow.isDestroyed())
      return null
    return this.voiceHudWindow
  }

  ensureVisible(): void {
    const window = this.getWindow()
    if (!window)
      return
    this.clearHideTimer()
    if (!window.isVisible()) {
      window.showInactive()
    }
  }

  scheduleHide(delayMs: number): void {
    const window = this.getWindow()
    if (!window)
      return
    this.clearHideTimer()
    this.hideTimer = setTimeout(() => {
      const nextWindow = this.getWindow()
      if (!nextWindow)
        return
      nextWindow.hide()
    }, delayMs)
  }

  clearHideTimer(): void {
    if (!this.hideTimer)
      return
    clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  updateBounds(): void {
    const window = this.getWindow()
    if (!window)
      return
    window.setBounds(getVoiceHudBounds())
  }

  dispose(): void {
    this.clearHideTimer()
  }
}
