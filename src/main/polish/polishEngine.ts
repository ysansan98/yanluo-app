import type { LanguageModel } from 'ai'
import type { ProviderKey } from '~shared/ai'
import { generateText } from 'ai'
// Load AI registry
import aiRegistry from '../../../models.dev/api.json'
import { BUILT_IN_POLISH_COMMANDS, settingsStore } from '../settingsStore'

export interface PolishOptions {
  text: string
  commandId: string
  temperature?: number
  maxTokens?: number
}

export interface PolishResult {
  success: boolean
  text: string
  originalText: string
  commandId: string
  commandName: string
  providerId: string
  modelId: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  error?: string
}

export class PolishEngine {
  private abortController: AbortController | null = null

  private isCustomProvider(providerId: string): boolean {
    return providerId.startsWith('custom-')
  }

  /**
   * Get the API endpoint for a provider
   * Priority: custom > registry > sdk default
   */
  private getApiEndpoint(providerId: ProviderKey): string | undefined {
    const userConfig = settingsStore.get().ai.providers[providerId]
    const registry = (aiRegistry as Record<string, { api?: string | null }>)[providerId]

    // Priority 1: User custom endpoint
    if (userConfig?.customApiEndpoint?.trim()) {
      return userConfig.customApiEndpoint.trim()
    }

    // Priority 2: Registry official endpoint
    if (registry?.api) {
      return registry.api
    }

    // Priority 3: SDK default (undefined)
    return undefined
  }

  /**
   * Create a language model instance for the given provider
   */
  private async createLanguageModel(
    providerId: ProviderKey,
    modelId: string,
    apiKey: string,
  ): Promise<LanguageModel> {
    const registry = (aiRegistry as Record<string, { npm?: string }>)[providerId]
    const npmPackage
      = registry?.npm
        ?? (this.isCustomProvider(providerId) ? '@ai-sdk/openai-compatible' : undefined)

    if (!npmPackage) {
      throw new Error(`Unknown provider: ${providerId}`)
    }

    const baseURL = this.getApiEndpoint(providerId)

    switch (npmPackage) {
      case '@ai-sdk/openai': {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const config: { apiKey: string, baseURL?: string } = { apiKey }
        if (baseURL)
          config.baseURL = baseURL
        return createOpenAI(config)(modelId)
      }

      case '@ai-sdk/google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
        const config: { apiKey: string, baseURL?: string } = { apiKey }
        if (baseURL)
          config.baseURL = baseURL
        return createGoogleGenerativeAI(config)(modelId)
      }

      case '@ai-sdk/anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic')
        const config: { apiKey: string, baseURL?: string } = { apiKey }
        if (baseURL)
          config.baseURL = baseURL
        return createAnthropic(config)(modelId)
      }

      case '@ai-sdk/openai-compatible': {
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
        if (!baseURL) {
          throw new Error(`Provider ${providerId} requires an API endpoint`)
        }
        return createOpenAICompatible({
          name: providerId,
          apiKey,
          baseURL,
        })(modelId)
      }

      default:
        throw new Error(`Unsupported ai-sdk package: ${npmPackage}`)
    }
  }

  /**
   * Get the prompt template for a command
   */
  private getPromptTemplate(commandId: string): string {
    // Check built-in commands
    const builtIn = BUILT_IN_POLISH_COMMANDS.find(c => c.id === commandId)
    if (builtIn)
      return builtIn.promptTemplate

    // Check custom commands
    const custom = settingsStore.get().polish.customCommands.find(c => c.id === commandId)
    if (custom)
      return custom.promptTemplate

    // Fallback: return text as-is
    return '{{text}}'
  }

  /**
   * Get the command name for display
   */
  private getCommandName(commandId: string): string {
    const builtIn = BUILT_IN_POLISH_COMMANDS.find(c => c.id === commandId)
    if (builtIn)
      return builtIn.name

    const custom = settingsStore.get().polish.customCommands.find(c => c.id === commandId)
    if (custom)
      return custom.name

    return '未知指令'
  }

  /**
   * Check if polish can be performed
   */
  canPolish(): { ok: boolean, reason?: string } {
    const settings = settingsStore.get()

    // Check if polish is enabled
    if (!settings.polish.enabled) {
      return { ok: false, reason: '润色功能未启用' }
    }

    // Check if a command is selected
    if (!settings.polish.selectedCommandId) {
      return { ok: false, reason: '未选择润色指令' }
    }

    // Check if active provider is configured
    if (!settings.ai.activeProviderId || !settings.ai.activeModelId) {
      return { ok: false, reason: '未配置 AI 服务商' }
    }

    const provider = settings.ai.providers[settings.ai.activeProviderId]
    if (!provider?.enabled || !provider.apiKey) {
      return { ok: false, reason: '当前服务商未配置或已禁用' }
    }

    return { ok: true }
  }

  /**
   * Perform polish on the given text
   */
  async polish(options: PolishOptions): Promise<PolishResult> {
    const { text, commandId, temperature, maxTokens } = options

    // Abort any ongoing request
    this.abort()
    this.abortController = new AbortController()

    try {
      // Get settings
      const settings = settingsStore.get()
      const providerId = settings.ai.activeProviderId
      const modelId = settings.ai.activeModelId

      if (!providerId || !modelId) {
        throw new Error('未配置 AI 服务商')
      }

      const provider = settings.ai.providers[providerId]
      if (!provider?.enabled || !provider.apiKey) {
        throw new Error('当前服务商未配置或已禁用')
      }

      // Get prompt template
      const template = this.getPromptTemplate(commandId)
      const prompt = template.replace(/\{\{text\}\}/g, text)

      // Create model
      const model = await this.createLanguageModel(providerId, modelId, provider.apiKey)

      // Generate
      const result = await generateText({
        model,
        prompt,
        temperature: temperature ?? settings.polish.temperature,
        maxOutputTokens: maxTokens ?? settings.polish.maxTokens,
        // abortSignal is not supported in this version
      })

      return {
        success: true,
        text: result.text,
        originalText: text,
        commandId,
        commandName: this.getCommandName(commandId),
        providerId,
        modelId,
        usage: result.usage
          ? {
              promptTokens: (result.usage as unknown as { inputTokens?: number }).inputTokens ?? 0,
              completionTokens: (result.usage as unknown as { outputTokens?: number }).outputTokens ?? 0,
              totalTokens: ((result.usage as unknown as { inputTokens?: number }).inputTokens ?? 0) + ((result.usage as unknown as { outputTokens?: number }).outputTokens ?? 0),
            }
          : undefined,
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        success: false,
        text, // Return original text on failure
        originalText: text,
        commandId,
        commandName: this.getCommandName(commandId),
        providerId: settingsStore.get().ai.activeProviderId || '',
        modelId: settingsStore.get().ai.activeModelId || '',
        error: errorMessage,
      }
    }
    finally {
      this.abortController = null
    }
  }

  /**
   * Validate provider configuration with a test request
   */
  async validateProvider(providerId: ProviderKey, modelId: string): Promise<{ ok: boolean, message: string }> {
    try {
      const provider = settingsStore.get().ai.providers[providerId]
      if (!provider?.apiKey) {
        return { ok: false, message: '未配置 API Key' }
      }

      const model = await this.createLanguageModel(providerId, modelId, provider.apiKey)

      const result = await generateText({
        model,
        prompt: 'Hi, this is a connection test. Reply "OK" only.',
        maxOutputTokens: 10,
        temperature: 0.1,
      })

      if (result.text.trim()) {
        return { ok: true, message: '连接成功' }
      }
      else {
        return { ok: false, message: '返回结果为空' }
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // User-friendly error messages
      if (message.includes('401') || message.includes('Unauthorized')) {
        return { ok: false, message: 'API Key 无效或未授权' }
      }
      if (message.includes('404')) {
        return { ok: false, message: '模型不存在或无法访问' }
      }
      if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
        return { ok: false, message: '连接失败，请检查网络或 API 地址' }
      }
      if (message.includes('429')) {
        return { ok: false, message: '请求过于频繁或额度不足' }
      }

      return { ok: false, message: `验证失败: ${message}` }
    }
  }

  /**
   * Abort ongoing request
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }
}

// Export singleton instance
export const polishEngine = new PolishEngine()
