import type { NativeImage } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'

const VOICE_HUD_WIDTH = 360
const VOICE_HUD_HEIGHT = 98
const VOICE_HUD_BOTTOM_OFFSET = 88

function getVoiceHudBounds() {
  const workArea = screen.getPrimaryDisplay().workArea
  const x = Math.round(workArea.x + (workArea.width - VOICE_HUD_WIDTH) / 2)
  const y = Math.round(
    workArea.y + workArea.height - VOICE_HUD_HEIGHT - VOICE_HUD_BOTTOM_OFFSET,
  )
  return { x, y, width: VOICE_HUD_WIDTH, height: VOICE_HUD_HEIGHT }
}

interface PendingHudMessage {
  channel: string
  payload?: unknown
}

/**
 * Voice HUD 窗口控制器
 *
 * 【私有】此类仅供 VoiceHudManager 内部使用，禁止外部直接访问！
 * 所有 HUD 操作请通过 VoiceHudManager。
 */
export class VoiceHudWindowController {
  private voiceHudWindow: BrowserWindow | null = null
  private hideTimer: NodeJS.Timeout | null = null
  private isRendererReady = false
  private shouldShowWhenReady = false
  private pendingMessages: PendingHudMessage[] = []

  constructor() {
    // 空构造函数，options 不再通过外部传入
  }

  /**
   * 创建 HUD 窗口
   */
  create(): BrowserWindow {
    console.log('[HUD] create() called')

    // 如果已有窗口，先销毁
    if (this.voiceHudWindow && !this.voiceHudWindow.isDestroyed()) {
      console.log('[HUD] Destroying existing window...')
      this.voiceHudWindow.destroy()
    }
    this.isRendererReady = false
    this.shouldShowWhenReady = false
    this.pendingMessages = []

    const bounds = getVoiceHudBounds()
    console.log('[HUD] Creating window at:', bounds)

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
      ...(process.platform === 'linux' ? { icon: this.getIcon() } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    console.log('[HUD] Window created, id:', this.voiceHudWindow.webContents.id)

    this.voiceHudWindow.setAlwaysOnTop(true, 'screen-saver')
    this.voiceHudWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    })
    this.voiceHudWindow.setIgnoreMouseEvents(true, { forward: true })

    // 确保窗口初始隐藏
    if (this.voiceHudWindow.isVisible()) {
      console.log('[HUD] Window was visible, hiding it...')
      this.voiceHudWindow.hide()
    }

    // 调试：自动打开 DevTools（仅开发模式）
    // if (is.dev) {
    //   this.voiceHudWindow.webContents.openDevTools({ mode: 'detach' })
    // }

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      void this.voiceHudWindow.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}#/voice-hud`,
      )
    }
    else {
      void this.voiceHudWindow.loadFile(
        join(__dirname, '../renderer/index.html'),
        {
          hash: '/voice-hud',
        },
      )
    }

    this.voiceHudWindow.webContents.once('did-finish-load', () => {
      this.isRendererReady = true
      this.flushPendingMessages()
      if (this.shouldShowWhenReady) {
        const readyWindow = this.getWindow()
        if (readyWindow) {
          this.showWindow(readyWindow)
        }
        this.shouldShowWhenReady = false
      }
    })

    this.voiceHudWindow.on('closed', () => {
      console.log('[HUD] Window closed')
      this.clearHideTimer()
      this.isRendererReady = false
      this.shouldShowWhenReady = false
      this.pendingMessages = []
      this.voiceHudWindow = null
    })

    // 检测渲染进程崩溃
    this.voiceHudWindow.webContents.on('render-process-gone', (_event, details) => {
      console.log('[HUD] Render process gone:', details.reason)
      this.clearHideTimer()
      this.isRendererReady = false
      this.shouldShowWhenReady = false
      this.pendingMessages = []
      this.voiceHudWindow = null
    })

    return this.voiceHudWindow
  }

  private showWindow(window: BrowserWindow): void {
    if (!window.isVisible()) {
      const bounds = window.getBounds()
      const workArea = screen.getPrimaryDisplay().workArea
      console.log('[HUD] Screen workArea:', workArea)
      console.log('[HUD] Showing window at:', bounds)
      window.showInactive()
      // 强制设置层级
      window.setAlwaysOnTop(true, 'screen-saver')
      window.moveTop()
      console.log('[HUD] Window shown, isVisible:', window.isVisible())
      return
    }
    console.log('[HUD] Window already visible')
  }

  private flushPendingMessages(): void {
    if (!this.isRendererReady || this.pendingMessages.length === 0)
      return
    const window = this.getWindow()
    if (!window)
      return

    const queue = this.pendingMessages
    this.pendingMessages = []
    for (const message of queue) {
      try {
        window.webContents.send(message.channel, message.payload)
      }
      catch (err) {
        console.error('[HUD] Failed to flush message to HUD:', err)
      }
    }
  }

  /**
   * 获取图标（内部方法）
   */
  private getIcon(): NativeImage | string {
    // 动态导入资源，避免构建时问题
    try {
      // 在 Linux 上使用默认图标
      return join(process.resourcesPath || '', 'icon.png')
    }
    catch {
      return ''
    }
  }

  /**
   * 获取窗口实例
   */
  getWindow(): BrowserWindow | null {
    if (!this.voiceHudWindow || this.voiceHudWindow.isDestroyed())
      return null
    // 检查 webContents 是否可用
    try {
      if (this.voiceHudWindow.webContents.isDestroyed())
        return null
    }
    catch {
      return null
    }
    return this.voiceHudWindow
  }

  /**
   * 确保窗口可见
   */
  ensureVisible(): void {
    console.log('[HUD] ensureVisible called')
    const existingWindow = this.getWindow()
    console.log('[HUD] window exists:', !!existingWindow, 'isVisible:', existingWindow?.isVisible())
    let window = existingWindow
    // 如果窗口不存在、被销毁或 webContents 已销毁，重新创建
    if (!window) {
      console.log('[HUD] Creating new window...')
      window = this.create()
    }
    this.clearHideTimer()
    if (!this.isRendererReady) {
      this.shouldShowWhenReady = true
      console.log('[HUD] Renderer not ready, show deferred')
      return
    }
    this.showWindow(window)
  }

  /**
   * 延迟隐藏窗口
   */
  scheduleHide(delayMs: number): void {
    const debugDelayMs = is.dev ? Math.max(delayMs, 3000) : delayMs
    console.log(`[HUD] scheduleHide: ${debugDelayMs}ms`)
    this.clearHideTimer()
    this.hideTimer = setTimeout(() => {
      try {
        const nextWindow = this.getWindow()
        if (!nextWindow || nextWindow.isDestroyed())
          return
        console.log('[HUD] Hiding window')
        this.shouldShowWhenReady = false
        nextWindow.hide()
      }
      catch {
        // 忽略窗口已销毁的错误
      }
    }, debugDelayMs)
  }

  send(channel: string, payload?: unknown): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed())
      return

    if (!this.isRendererReady) {
      this.pendingMessages.push({ channel, payload })
      if (this.pendingMessages.length > 20) {
        this.pendingMessages.shift()
      }
      return
    }

    try {
      window.webContents.send(channel, payload)
    }
    catch (err) {
      console.error('[HUD] Failed to send to HUD:', err)
    }
  }

  /**
   * 清除隐藏定时器
   */
  clearHideTimer(): void {
    if (!this.hideTimer)
      return
    clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  /**
   * 更新窗口位置
   */
  updateBounds(): void {
    const window = this.getWindow()
    if (!window)
      return
    window.setBounds(getVoiceHudBounds())
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    this.clearHideTimer()
    if (this.voiceHudWindow && !this.voiceHudWindow.isDestroyed()) {
      this.voiceHudWindow.destroy()
    }
    this.isRendererReady = false
    this.shouldShowWhenReady = false
    this.pendingMessages = []
    this.voiceHudWindow = null
  }
}
