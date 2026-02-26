// AI Provider Types - Shared between main and renderer

export type ProviderKey
  = | 'openai'
    | 'google'
    | 'anthropic'
    | 'deepseek'
    | 'zhipuai'
    | 'zai-coding-plan'
    | 'minimax'
    | 'minimax-coding-plan'

export interface AiProviderUserConfig {
  enabled: boolean
  apiKey: string // encrypted in storage, masked in UI
  customApiEndpoint?: string
  selectedModelId?: string
}

export interface AiProviderInfo {
  id: string // Use string instead of ProviderKey for flexibility
  name: string
  npm: string
  api: string | null
  env: string[]
  doc: string
  models: Record<
    string,
    {
      id: string
      name: string
      limit: {
        context?: number
        output?: number
        input?: number
      }
    }
  >
}

export interface AiRegistry {
  providers: Record<ProviderKey, AiProviderInfo>
}

export interface PolishCommand {
  id: string
  name: string
  icon?: string
  promptTemplate: string
  isBuiltIn: boolean
  order: number
}
