/**
 * Voice HUD Manager
 * 统一管理 Voice HUD 的显示、隐藏和状态更新
 * 提供详细的触发源日志记录
 *
 * 这是 HUD 的唯一入口，禁止外部直接操作 VoiceHudWindowController
 */

import type {
  VoiceUiFinalPayload,
  VoiceUiShowPayload,
  VoiceUiToastPayload,
  VoiceUiUpdatePayload,
} from '~shared/voice'
import { VOICE_IPC } from '~shared/voice'
import { createLogger } from '../logging'
import { isHotkeyDisabledGlobally } from '../voice/hotkeyState'
import { VoiceHudWindowController } from '../windows/voiceHudWindow'

export type HudStatus = 'arming' | 'recording' | 'finalizing' | 'success' | 'error'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

// Options interface kept for backward compatibility
export interface VoiceHudManagerOptions {
  // No options needed currently
}

interface LogContext {
  source: string
  action: string
  details?: Record<string, unknown>
}

/**
 * Voice HUD 管理器
 *
 * 【重要】这是 HUD 的唯一控制入口，所有 HUD 操作必须通过此类：
 * - show(): 会话开始（arming）
 * - updateRecording(): 开始录音或收到识别中间结果
 * - updateFinalizing(): 松开快捷键，进入识别阶段
 * - showFinal(): 识别完成并注入文本成功
 * - showToast(): 显示提示/警告/错误
 * - hide(): 隐藏 HUD（延迟或立即）
 * - init(): 初始化 HUD 窗口（应用启动时调用）
 * - dispose(): 销毁 HUD 窗口（应用退出时调用）
 * - updateBounds(): 更新窗口位置（屏幕变化时调用）
 *
 * 禁止直接创建或操作 VoiceHudWindowController！
 */
export class VoiceHudManager {
  private readonly log = createLogger('voice-hud-manager')
  // 私有窗口控制器，外部不可访问
  private readonly windowController: VoiceHudWindowController

  // 状态追踪
  private currentSessionId: string | null = null
  private currentStatus: HudStatus | null = null
  private lastShowTime: number = 0
  private showCount: number = 0

  constructor(_options?: VoiceHudManagerOptions) {
    // 内部创建窗口控制器，外部无法直接访问
    this.windowController = new VoiceHudWindowController()
  }

  /**
   * 初始化 HUD 窗口
   * 在应用启动时调用
   */
  init(): void {
    this.log.info('init lazy mode (create on first show)')
  }

  /**
   * 销毁 HUD 资源
   * 在应用退出时调用
   */
  dispose(): void {
    this.log.info('dispose')
    this.windowController.dispose()
  }

  /**
   * 更新窗口位置
   * 屏幕配置变化时调用
   */
  updateBounds(): void {
    this.log.debug('updateBounds')
    this.windowController.updateBounds()
  }

  /**
   * 记录操作日志
   */
  private recordLog(context: LogContext): void {
    this.log.info(context.action, {
      source: context.source,
      status: context.details?.status ?? this.currentStatus,
      sessionId: this.currentSessionId?.slice(-6),
      ...context.details,
    })
  }

  /**
   * 检查是否可以显示 HUD
   * 在 onboarding 设置快捷键时禁用
   */
  private canShow(): boolean {
    if (isHotkeyDisabledGlobally()) {
      this.log.debug('blocked by global hotkey disabled flag')
      return false
    }
    return true
  }

  /**
   * 显示 HUD（会话开始）
   * 触发源：SessionOrchestrator.handleHotkeyPress()
   */
  show(payload: VoiceUiShowPayload): void {
    if (!this.canShow()) {
      return
    }

    this.currentSessionId = payload.sessionId
    this.currentStatus = payload.status
    this.lastShowTime = Date.now()
    this.showCount++

    this.recordLog({
      source: 'SessionOrchestrator.handleHotkeyPress',
      action: 'hud:show',
      details: {
        sessionId: payload.sessionId,
        status: payload.status,
        showCount: this.showCount,
      },
    })

    this.windowController.ensureVisible()
    this.broadcastToHud(VOICE_IPC.UI_SHOW, payload)
  }

  /**
   * 广播到 HUD 窗口
   */
  private broadcastToHud(channel: string, payload?: unknown): void {
    this.windowController.send(channel, payload)
  }

  /**
   * 更新 HUD 状态（录音中）
   */
  updateRecording(payload: VoiceUiUpdatePayload): void {
    if (!this.canShow()) {
      return
    }

    const previousStatus = this.currentStatus
    this.currentStatus = payload.status
    this.currentSessionId = payload.sessionId

    // 判断具体的触发源
    let source = 'SessionOrchestrator'
    let action = 'hud:update:recording'

    if (previousStatus === 'finalizing' && payload.status === 'recording') {
      source = 'SessionOrchestrator.handleHotkeyPress'
      action = 'hud:update:resumed'
    }
    else if (previousStatus === 'arming') {
      source = 'SessionOrchestrator.handleHotkeyPress'
      action = 'hud:update:started'
    }
    else if (payload.partialText) {
      source = 'SessionOrchestrator.handleFinal'
      action = 'hud:update:partial'
    }

    this.recordLog({
      source,
      action,
      details: {
        sessionId: payload.sessionId,
        previousStatus,
        currentStatus: payload.status,
        partialTextLength: payload.partialText?.length ?? 0,
        elapsedMs: payload.elapsedMs,
      },
    })

    this.windowController.ensureVisible()
    this.broadcastToHud(VOICE_IPC.UI_UPDATE, payload)
  }

  /**
   * 更新 HUD 状态（识别中）
   */
  updateFinalizing(payload: VoiceUiUpdatePayload): void {
    if (!this.canShow()) {
      return
    }

    const previousStatus = this.currentStatus
    this.currentStatus = payload.status

    this.recordLog({
      source: 'SessionOrchestrator.handleHotkeyRelease',
      action: 'hud:update:finalizing',
      details: {
        sessionId: payload.sessionId,
        previousStatus,
        partialTextLength: payload.partialText?.length ?? 0,
        elapsedMs: payload.elapsedMs,
      },
    })

    this.windowController.ensureVisible()
    this.broadcastToHud(VOICE_IPC.UI_UPDATE, payload)
  }

  /**
   * 显示最终结果
   */
  showFinal(payload: VoiceUiFinalPayload, autoHideDelayMs: number = 2200): void {
    if (!this.canShow()) {
      return
    }

    this.currentStatus = 'success'

    this.recordLog({
      source: 'SessionOrchestrator.finalizeSession',
      action: 'hud:show:final',
      details: {
        sessionId: payload.sessionId,
        finalTextLength: payload.finalText.length,
        mode: payload.mode,
        autoHideDelayMs,
      },
    })

    this.windowController.ensureVisible()
    this.broadcastToHud(VOICE_IPC.UI_FINAL, payload)
    this.windowController.scheduleHide(autoHideDelayMs)
  }

  /**
   * 显示 Toast 提示
   */
  showToast(payload: VoiceUiToastPayload, autoHideDelayMs?: number): void {
    if (!this.canShow()) {
      return
    }

    const isError = payload.type === 'error'
    const delay = autoHideDelayMs ?? (isError ? 2200 : 1600)

    // 判断触发源
    let source = 'SessionOrchestrator'
    if (payload.message.includes('模型')) {
      source = 'SessionOrchestrator.handleHotkeyPress[model]'
    }
    else if (isError) {
      source = 'SessionOrchestrator.fail'
    }

    this.currentStatus = isError ? 'error' : 'success'

    this.recordLog({
      source,
      action: 'hud:show:toast',
      details: {
        type: payload.type,
        message: payload.message,
        autoHideDelayMs: delay,
      },
    })

    this.windowController.ensureVisible()
    this.broadcastToHud(VOICE_IPC.UI_TOAST, payload)
    this.windowController.scheduleHide(delay)
  }

  /**
   * 隐藏 HUD
   */
  hide(delayMs: number = 300, reason: string = 'manual'): void {
    this.log.info('hide', { reason, delayMs })

    this.windowController.scheduleHide(delayMs)
    this.broadcastToHud(VOICE_IPC.UI_HIDE)

    // 重置状态
    if (delayMs <= 0) {
      this.resetState()
    }
    else {
      // 延迟重置状态
      setTimeout(() => this.resetState(), delayMs)
    }
  }

  /**
   * 立即隐藏 HUD（无延迟）
   */
  hideImmediately(reason: string = 'immediate'): void {
    this.hide(0, reason)
  }

  /**
   * 获取当前状态（用于调试）
   */
  getState(): {
    sessionId: string | null
    status: HudStatus | null
    lastShowTime: number
    showCount: number
  } {
    return {
      sessionId: this.currentSessionId,
      status: this.currentStatus,
      lastShowTime: this.lastShowTime,
      showCount: this.showCount,
    }
  }

  /**
   * 重置内部状态
   */
  private resetState(): void {
    this.currentSessionId = null
    this.currentStatus = null
  }
}
