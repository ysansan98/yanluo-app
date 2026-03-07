<script setup lang="ts">
import type { AiProviderInfo, AiProviderUserConfig } from '../../../shared/ai/types'
import { computed, onMounted, ref } from 'vue'
import { createRendererLogger } from '../utils/logger'
import AppActionButton from './AppActionButton.vue'
import Icon from './Icon.vue'

const log = createRendererLogger('ai-provider-panel')

// State
const registry = ref<Record<string, AiProviderInfo> | null>(null)
const userConfig = ref<{
  providers: Record<string, AiProviderUserConfig>
  activeProviderId: string | null
  activeModelId: string | null
} | null>(null)

const expandedProvider = ref<string | null>(null)
const isLoading = ref(false)
const isValidating = ref<string | null>(null)
const validationResult = ref<{
  providerId: string
  ok: boolean
  message?: string
} | null>(null)

// Custom provider modal
const showCustomModal = ref(false)
const customForm = ref({
  id: '',
  name: '',
  apiKey: '',
  apiEndpoint: '',
  modelId: '',
  modelName: '',
})

// Form state for editing
const editForm = ref<{
  apiKey: string
  apiEndpoint: string
  selectedModelId: string
}>({
  apiKey: '',
  apiEndpoint: '',
  selectedModelId: '',
})

// Load data on mount
onMounted(async () => {
  await loadData()
})

async function loadData() {
  isLoading.value = true
  try {
    const [registryData, configData] = await Promise.all([
      window.api.ai.getRegistry(),
      window.api.ai.getConfig(),
    ])
    registry.value = registryData.providers
    userConfig.value = configData
  }
  catch (error) {
    log.error('failed to load AI provider data', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    isLoading.value = false
  }
}

// Computed
const providerList = computed(() => {
  const list: Array<AiProviderInfo & { userConfig?: AiProviderUserConfig, isActive: boolean }> = []

  // Add registry providers
  if (registry.value) {
    for (const [id, info] of Object.entries(registry.value)) {
      list.push({
        ...info,
        id,
        userConfig: userConfig.value?.providers[id],
        isActive: userConfig.value?.activeProviderId === id,
      })
    }
  }

  // Add custom providers from user config (those not in registry)
  if (userConfig.value?.providers) {
    for (const [id, config] of Object.entries(userConfig.value.providers)) {
      if (!registry.value?.[id] && config.enabled) {
        list.push({
          id,
          name: id.startsWith('custom-') ? id.slice(7) : id,
          npm: '@ai-sdk/openai-compatible',
          api: config.customApiEndpoint || null,
          env: ['API_KEY'],
          doc: '',
          models: {
            [config.selectedModelId || 'default']: {
              id: config.selectedModelId || 'default',
              name: config.selectedModelId || 'default',
              limit: {},
            },
          },
          userConfig: config,
          isActive: userConfig.value.activeProviderId === id,
        })
      }
    }
  }

  return list
})

const configuredProviders = computed(() =>
  providerList.value.filter(p => p.userConfig?.enabled),
)

// Actions
function expandProvider(providerId: string) {
  if (expandedProvider.value === providerId) {
    expandedProvider.value = null
    return
  }

  expandedProvider.value = providerId
  const provider = registry.value?.[providerId]
  const config = userConfig.value?.providers[providerId]

  // Reset form - use custom endpoint if set, otherwise use default
  editForm.value = {
    apiKey: config?.apiKey || '',
    apiEndpoint: config?.customApiEndpoint || provider?.api || '',
    selectedModelId: config?.selectedModelId || Object.keys(provider?.models || {})[0] || '',
  }
}

async function saveProviderConfig(providerId: string) {
  try {
    await window.api.ai.setProviderConfig(providerId, {
      apiKey: editForm.value.apiKey,
      customApiEndpoint: editForm.value.apiEndpoint || undefined,
      selectedModelId: editForm.value.selectedModelId,
    })

    // If this is the first configured provider, auto-set as active
    if (configuredProviders.value.length === 0) {
      await window.api.ai.setActiveProvider(providerId, editForm.value.selectedModelId)
    }

    await loadData()
    expandedProvider.value = null
  }
  catch (error) {
    log.error('failed to save provider config', {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function removeProviderConfig(providerId: string) {
  try {
    await window.api.ai.removeProviderConfig(providerId)
    await loadData()
    expandedProvider.value = null
  }
  catch (error) {
    log.error('failed to remove provider config', {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function setActiveProvider(providerId: string, modelId: string) {
  try {
    await window.api.ai.setActiveProvider(providerId, modelId)
    await loadData()
  }
  catch (error) {
    log.error('failed to set active provider', {
      providerId,
      modelId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function validateProvider(providerId: string) {
  const config = userConfig.value?.providers[providerId]
  if (!config?.selectedModelId)
    return

  isValidating.value = providerId
  validationResult.value = null

  try {
    const result = await window.api.ai.validateProvider(providerId, config.selectedModelId)
    validationResult.value = {
      providerId,
      ok: result.ok,
      message: result.ok ? result.message : (result.error || '验证失败'),
    }
  }
  catch (error) {
    validationResult.value = {
      providerId,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
  finally {
    isValidating.value = null
  }
}

// Custom provider
function openCustomModal() {
  customForm.value = {
    id: '',
    name: '',
    apiKey: '',
    apiEndpoint: '',
    modelId: '',
    modelName: '',
  }
  showCustomModal.value = true
}

async function saveCustomProvider() {
  if (!customForm.value.id.trim() || !customForm.value.name.trim())
    return

  const providerId = `custom-${customForm.value.id.trim()}`

  try {
    // Save as a custom provider using openai-compatible format
    await window.api.ai.setProviderConfig(providerId, {
      apiKey: customForm.value.apiKey,
      customApiEndpoint: customForm.value.apiEndpoint,
      selectedModelId: customForm.value.modelId || 'default',
    })

    // Set as active
    await window.api.ai.setActiveProvider(providerId, customForm.value.modelId || 'default')

    showCustomModal.value = false
    await loadData()
  }
  catch (error) {
    log.error('failed to save custom provider', {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-2xl font-bold text-yl-ink-700">
            AI 服务商配置
          </div>
          <div class="mt-1 text-sm text-yl-muted-500">
            配置云端大模型服务商，用于语音润色功能。
          </div>
        </div>
        <AppActionButton size="sm" @click="openCustomModal">
          <span class="flex items-center gap-1">
            <Icon name="lucide:plus" size="w-4 h-4" />
            自定义服务商
          </span>
        </AppActionButton>
      </div>
    </section>

    <!-- Cloud Providers Section -->
    <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
      <div class="mb-4 flex items-center justify-between">
        <div class="text-base font-bold text-yl-ink-650">
          云端模型
        </div>
        <span class="text-xs text-yl-muted-400">
          {{ configuredProviders.length }} 个已配置
        </span>
      </div>

      <!-- Provider List -->
      <div v-if="isLoading" class="py-8 text-center text-yl-muted-400">
        加载中...
      </div>

      <div v-else-if="!registry" class="py-8 text-center text-yl-muted-400">
        加载失败，请重试
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="provider in providerList"
          :key="provider.id"
          class="rounded-xl border border-yl-line-180 bg-yl-paper-250 overflow-hidden"
          :class="{
            'border-yl-brand-400': provider.isActive,
            'ring-1 ring-yl-brand-100': provider.isActive,
          }"
        >
          <!-- Provider Header -->
          <div
            class="flex items-center justify-between p-3 cursor-pointer hover:bg-yl-paper-300 transition-colors"
            @click="expandProvider(provider.id)"
          >
            <div class="flex items-center gap-3">
              <div
                class="h-2 w-2 rounded-full"
                :class="provider.userConfig?.enabled ? 'bg-green-500' : 'bg-gray-300'"
              />
              <span class="font-medium text-yl-ink-550">{{ provider.name }}</span>
              <span
                v-if="provider.isActive"
                class="text-xs px-2 py-0.5 rounded-full bg-yl-brand-100 text-yl-brand-600"
              >
                当前使用
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="provider.userConfig?.enabled" class="text-xs text-yl-muted-400">
                {{ provider.models?.[provider.userConfig.selectedModelId || '']?.name || provider.userConfig.selectedModelId || '未选择模型' }}
              </span>
              <span v-else class="text-xs text-yl-muted-400">未配置</span>
              <Icon
                name="lucide:chevron-down"
                size="w-4 h-4"
                :class="`text-yl-muted-400 transition-transform ${expandedProvider === provider.id ? 'rotate-180' : ''}`"
              />
            </div>
          </div>

          <!-- Expanded Configuration -->
          <div
            v-if="expandedProvider === provider.id"
            class="border-t border-yl-line-180 p-4 space-y-4"
          >
            <!-- API Key -->
            <div>
              <label class="block text-sm text-yl-ink-450 mb-1.5">
                API Key
                <span class="text-xs text-yl-muted-400">({{ provider.env?.join?.(' 或 ') || '必填' }})</span>
              </label>
              <input
                v-model="editForm.apiKey"
                type="password"
                class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm text-yl-ink-550"
                placeholder="输入 API Key"
              >
              <p class="mt-1 text-xs text-yl-muted-400">
                您的 API Key 将被加密存储在本地
              </p>
            </div>

            <!-- API Endpoint -->
            <div>
              <label class="block text-sm text-yl-ink-450 mb-1.5">API 地址</label>
              <input
                v-model="editForm.apiEndpoint"
                type="text"
                class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm text-yl-ink-550"
                placeholder="https://api.example.com/v1"
              >
              <p class="mt-1 text-xs text-yl-muted-400">
                默认为官方地址，可修改为自定义代理地址
              </p>
            </div>

            <!-- Model Selection -->
            <div v-if="Object.keys(provider.models || {}).length > 0">
              <label class="block text-sm text-yl-ink-450 mb-1.5">选择模型</label>
              <select
                v-model="editForm.selectedModelId"
                class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm text-yl-ink-550"
              >
                <option
                  v-for="model in Object.values(provider.models)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </option>
              </select>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap items-center gap-2 pt-2">
              <AppActionButton
                size="sm"
                :loading="isValidating === provider.id"
                @click="validateProvider(provider.id)"
              >
                验证配置
              </AppActionButton>
              <AppActionButton
                variant="primary"
                size="sm"
                @click="saveProviderConfig(provider.id)"
              >
                保存并启用
              </AppActionButton>
              <AppActionButton
                v-if="provider.userConfig?.enabled"
                variant="outline"
                size="sm"
                @click="removeProviderConfig(provider.id)"
              >
                删除配置
              </AppActionButton>
              <AppActionButton
                v-if="provider.userConfig?.enabled && !provider.isActive"
                variant="outline"
                size="sm"
                @click="setActiveProvider(provider.id, provider.userConfig.selectedModelId || '')"
              >
                设为当前
              </AppActionButton>

              <!-- Validation Result -->
              <span
                v-if="validationResult?.providerId === provider.id"
                class="text-xs px-2 py-1 rounded-full max-w-50 truncate"
                :class="validationResult.ok
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'"
                :title="validationResult.message || ''"
              >
                <Icon
                  :name="validationResult.ok ? 'lucide:check' : 'lucide:x'"
                  size="w-3 h-3"
                  class-name="inline mr-1"
                />
                {{ validationResult.message }}
              </span>
            </div>

            <!-- Doc Link -->
            <div v-if="provider.doc" class="pt-2 border-t border-yl-line-180">
              <a
                :href="provider.doc"
                target="_blank"
                class="text-xs text-yl-brand-500 hover:underline inline-flex items-center gap-1"
              >
                查看官方文档
                <Icon name="lucide:external-link" size="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Custom Provider Modal -->
    <div
      v-if="showCustomModal"
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      @click.self="showCustomModal = false"
    >
      <div class="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-yl-ink-700 mb-4">
          添加自定义服务商
        </h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              服务商 ID
              <span class="text-xs text-yl-muted-400">(英文，用于标识)</span>
            </label>
            <input
              v-model="customForm.id"
              type="text"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
              placeholder="例如：my-provider"
            >
          </div>

          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              显示名称
            </label>
            <input
              v-model="customForm.name"
              type="text"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
              placeholder="例如：我的 OpenAI 代理"
            >
          </div>

          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              API 地址
            </label>
            <input
              v-model="customForm.apiEndpoint"
              type="text"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
              placeholder="https://api.example.com/v1"
            >
          </div>

          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              API Key
            </label>
            <input
              v-model="customForm.apiKey"
              type="password"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
              placeholder="sk-..."
            >
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-yl-ink-450 mb-1.5">
                模型 ID
              </label>
              <input
                v-model="customForm.modelId"
                type="text"
                class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
                placeholder="gpt-4"
              >
            </div>
            <div>
              <label class="block text-sm text-yl-ink-450 mb-1.5">
                模型显示名称
              </label>
              <input
                v-model="customForm.modelName"
                type="text"
                class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
                placeholder="GPT-4"
              >
            </div>
          </div>

          <div class="p-3 bg-yl-paper-250 rounded-lg text-xs text-yl-muted-400">
            <p class="font-medium text-yl-ink-450 mb-1">
              说明：
            </p>
            <p>自定义服务商使用 OpenAI 兼容格式。支持任意兼容 OpenAI API 的服务商，包括代理服务、私有化部署等。</p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <AppActionButton variant="outline" @click="showCustomModal = false">
            取消
          </AppActionButton>
          <AppActionButton variant="primary" @click="saveCustomProvider">
            添加
          </AppActionButton>
        </div>
      </div>
    </div>
  </section>
</template>
