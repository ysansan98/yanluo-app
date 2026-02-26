<script setup lang="ts">
import type { PolishCommand } from '../../../shared/ai/types'
import { computed, onMounted, ref } from 'vue'
import AppActionButton from './AppActionButton.vue'
import Icon from './Icon.vue'

const emit = defineEmits<{
  switchMenu: [menu: string]
}>()

// Icon mapping using Iconify icons
const iconMap: Record<string, string> = {
  'polish-none': 'lucide:align-left',
  'polish-oral': 'lucide:sparkles',
  'polish-concise': 'lucide:sparkles',
  'translate-en': 'lucide:languages',
  'work-report': 'lucide:briefcase',
  'meeting-minutes': 'lucide:clipboard-list',
}

// State
const isLoading = ref(false)
const commands = ref<PolishCommand[]>([])
const config = ref<{
  enabled: boolean
  selectedCommandId: string | null
} | null>(null)
const aiStatus = ref<{
  hasEnabledProvider: boolean
  isActiveProviderValid: boolean
} | null>(null)

// UI State
const showEnablePrompt = ref(false)
const showAddModal = ref(false)
const editingCommand = ref<PolishCommand | null>(null)
const showRulePreview = ref<string | null>(null)

// Form for add/edit
const form = ref({
  name: '',
  promptTemplate: '',
})

// Load data
onMounted(async () => {
  await loadData()
})

async function loadData() {
  isLoading.value = true
  try {
    const [commandsData, configData, statusData] = await Promise.all([
      window.api.polish.getCommands(),
      window.api.polish.getConfig(),
      window.api.ai.checkConfigured(),
    ])
    commands.value = commandsData
    config.value = configData
    aiStatus.value = statusData

    if (!configData.enabled && !statusData.hasEnabledProvider) {
      showEnablePrompt.value = true
    }
  }
  catch (error) {
    console.error('Failed to load polish data:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Computed - all commands sorted
const allCommands = computed(() => commands.value)

// Get icon by command id
function getIcon(commandId: string): string {
  return iconMap[commandId] || 'lucide:wrench'
}

// Actions
async function setCommand(commandId: string) {
  if (commandId !== 'polish-none') {
    if (!aiStatus.value?.hasEnabledProvider) {
      console.warn('请先配置 AI 服务商')
      return
    }
    if (!aiStatus.value?.isActiveProviderValid) {
      console.warn('当前 AI 服务商配置无效，请检查配置')
      return
    }
  }

  try {
    await window.api.polish.setCommand(commandId)
    // Update local state without reloading entire list
    if (config.value) {
      config.value.selectedCommandId = commandId
    }
  }
  catch (error) {
    console.error('Failed to set command:', error)
  }
}

async function toggleEnabled() {
  if (!config.value)
    return

  const newEnabled = !config.value.enabled

  if (newEnabled) {
    if (!aiStatus.value?.hasEnabledProvider) {
      console.warn('请先配置 AI 服务商')
      return
    }
    if (!aiStatus.value?.isActiveProviderValid) {
      console.warn('当前 AI 服务商配置无效，请检查配置')
      return
    }
  }

  try {
    await window.api.polish.setEnabled(newEnabled)
    // Update local state without reloading
    config.value.enabled = newEnabled
  }
  catch (error) {
    console.error('Failed to toggle enabled:', error)
  }
}

function openAddModal() {
  editingCommand.value = null
  form.value = {
    name: '',
    promptTemplate: '请对以下内容进行处理：\n\n{{' + 'text' + '}}',
  }
  showAddModal.value = true
}

function openEditCommand(command: PolishCommand, event: Event) {
  event.stopPropagation()
  editingCommand.value = command
  form.value = {
    name: command.name,
    promptTemplate: command.promptTemplate,
  }
  showAddModal.value = true
}

async function saveCommand() {
  if (!form.value.name.trim() || !form.value.promptTemplate.trim())
    return

  try {
    const newCommand: PolishCommand = {
      id: editingCommand.value?.id || `custom-${Date.now()}`,
      name: form.value.name.trim(),
      promptTemplate: form.value.promptTemplate.trim(),
      icon: 'lucide:wrench',
      isBuiltIn: false,
      order: 100,
    }

    if (editingCommand.value) {
      await window.api.polish.removeCommand?.(editingCommand.value.id)
      // Update local list
      const index = commands.value.findIndex(c => c.id === editingCommand.value!.id)
      if (index !== -1) {
        commands.value[index] = newCommand
      }
    }
    else {
      await window.api.polish.addCommand?.(newCommand)
      // Add to local list
      commands.value.push(newCommand)
    }

    showAddModal.value = false
  }
  catch (error) {
    console.error('Failed to save command:', error)
  }
}

async function deleteCommand(commandId: string, event: Event) {
  event.stopPropagation()
  try {
    await window.api.polish.removeCommand?.(commandId)
    // Remove from local list without full reload
    commands.value = commands.value.filter(c => c.id !== commandId)
    // If deleted command was selected, reset to none
    if (config.value?.selectedCommandId === commandId) {
      config.value.selectedCommandId = 'polish-none'
    }
  }
  catch (error) {
    console.error('Failed to delete command:', error)
  }
}

function toggleRulePreview(commandId: string, event: Event) {
  event.stopPropagation()
  if (showRulePreview.value === commandId) {
    showRulePreview.value = null
  }
  else {
    showRulePreview.value = commandId
  }
}

function goToProviderConfig() {
  emit('switchMenu', 'provider')
}
</script>

<template>
  <section class="space-y-4">
    <!-- Enable Toggle & Status -->
    <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-4 shadow-yl-card">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            :class="config?.enabled ? 'bg-yl-brand-100 text-yl-brand-600' : 'bg-yl-paper-300 text-yl-muted-400'"
          >
            <Icon name="lucide:zap" size="w-5 h-5" />
          </div>
          <div>
            <div class="font-medium text-yl-ink-550">
              {{ config?.enabled ? '润色已启用' : '润色已关闭' }}
            </div>
            <div class="text-xs text-yl-muted-400">
              {{ config?.enabled ? '语音输入后将自动处理' : '直接输出语音识别原文' }}
            </div>
          </div>
        </div>
        <button
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="config?.enabled ? 'bg-yl-brand-500' : 'bg-yl-line-300'"
          @click="toggleEnabled"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="config?.enabled ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <!-- Not Configured Warning -->
      <div
        v-if="showEnablePrompt"
        class="mt-3 pt-3 border-t border-yl-line-180 flex items-center gap-2 text-sm text-orange-600"
      >
        <Icon name="lucide:alert-triangle" size="w-4 h-4" />
        <span class="flex-1">未配置 AI 服务商</span>
        <button class="text-yl-brand-600 hover:underline" @click="goToProviderConfig">
          去配置
        </button>
      </div>
    </section>

    <!-- All Commands Grid -->
    <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
      <div class="mb-4 flex items-center justify-between">
        <div class="text-base font-bold text-yl-ink-650">
          润色指令
        </div>
        <AppActionButton size="sm" @click="openAddModal">
          <span class="flex items-center gap-1">
            <Icon name="lucide:plus" size="w-4 h-4" />
            添加
          </span>
        </AppActionButton>
      </div>

      <div v-if="isLoading" class="py-8 text-center text-yl-muted-400">
        加载中...
      </div>

      <div v-else class="grid grid-cols-2 gap-3">
        <!-- No Polish Card -->
        <button
          class="group rounded-xl border p-4 text-left transition-all relative"
          :class="config?.selectedCommandId === 'polish-none' || !config?.selectedCommandId
            ? 'border-yl-brand-400 bg-yl-brand-50 ring-1 ring-yl-brand-100'
            : 'border-yl-line-180 bg-yl-paper-250 hover:border-yl-brand-300 hover:bg-yl-paper-300'"
          @click="setCommand('polish-none')"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              :class="config?.selectedCommandId === 'polish-none' || !config?.selectedCommandId
                ? 'bg-yl-brand-200 text-yl-brand-700'
                : 'bg-yl-paper-300 text-yl-muted-400 group-hover:bg-yl-paper-200'"
            >
              <Icon name="lucide:align-left" size="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-yl-ink-550">
                不润色
              </div>
              <div class="text-xs text-yl-muted-400 mt-0.5">
                直接输出原文
              </div>
            </div>
          </div>
          <!-- Selected Indicator -->
          <div
            v-if="config?.selectedCommandId === 'polish-none' || !config?.selectedCommandId"
            class="absolute top-2 right-2 w-5 h-5 rounded-full bg-yl-brand-500 flex items-center justify-center"
          >
            <Icon name="lucide:check" size="w-3.5 h-3.5" class-name="text-white" />
          </div>
        </button>

        <!-- Command Cards -->
        <button
          v-for="command in allCommands.filter(c => c.id !== 'polish-none')"
          :key="command.id"
          class="group rounded-xl border p-4 text-left transition-all relative overflow-hidden"
          :class="config?.selectedCommandId === command.id
            ? 'border-yl-brand-400 bg-yl-brand-50 ring-1 ring-yl-brand-100'
            : 'border-yl-line-180 bg-yl-paper-250 hover:border-yl-brand-300 hover:bg-yl-paper-300'"
          @click="setCommand(command.id)"
        >
          <!-- Type Badge -->
          <div class="absolute top-0 right-0">
            <div
              class="text-[10px] px-1.5 py-0.5 rounded-bl-lg"
              :class="command.isBuiltIn
                ? 'bg-yl-line-200 text-yl-muted-500'
                : 'bg-yl-brand-100 text-yl-brand-600'"
            >
              {{ command.isBuiltIn ? '内置' : '自定义' }}
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              :class="config?.selectedCommandId === command.id
                ? 'bg-yl-brand-200 text-yl-brand-700'
                : 'bg-yl-paper-300 text-yl-muted-400 group-hover:bg-yl-paper-200'"
            >
              <Icon :name="getIcon(command.id)" size="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0 pr-4">
              <div class="font-medium text-yl-ink-550">
                {{ command.name }}
              </div>
              <div class="text-xs text-yl-muted-400 mt-0.5 line-clamp-1">
                {{ command.promptTemplate.slice(0, 30) }}...
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="mt-2 pt-2 border-t border-yl-line-180/50 flex items-center gap-2">
            <!-- Selected Indicator -->
            <span
              v-if="config?.selectedCommandId === command.id"
              class="text-xs text-yl-brand-600 flex items-center gap-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-yl-brand-500" />
              已选择
            </span>

            <!-- View Rule Button -->
            <button
              class="text-xs text-yl-muted-400 hover:text-yl-brand-500 transition-colors"
              @click="toggleRulePreview(command.id, $event)"
            >
              {{ showRulePreview === command.id ? '隐藏规则' : '查看规则' }}
            </button>

            <!-- Edit/Delete for custom commands -->
            <template v-if="!command.isBuiltIn">
              <span class="text-yl-line-300">|</span>
              <button
                class="text-xs text-yl-muted-400 hover:text-yl-brand-500 transition-colors"
                @click="openEditCommand(command, $event)"
              >
                编辑
              </button>
              <button
                class="text-xs text-yl-muted-400 hover:text-red-500 transition-colors"
                @click="deleteCommand(command.id, $event)"
              >
                删除
              </button>
            </template>
          </div>

          <!-- Rule Preview -->
          <div
            v-if="showRulePreview === command.id"
            class="mt-2 p-2 bg-white/70 rounded text-xs font-mono text-yl-ink-450 whitespace-pre-wrap break-all"
            @click="$event.stopPropagation()"
          >
            {{ command.promptTemplate }}
          </div>
        </button>
      </div>
    </section>

    <!-- Add/Edit Modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      @click.self="showAddModal = false"
    >
      <div class="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
        <h3 class="text-lg font-bold text-yl-ink-700 mb-4">
          {{ editingCommand ? '编辑指令' : '添加自定义指令' }}
        </h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              指令名称
            </label>
            <input
              v-model="form.name"
              type="text"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm"
              placeholder="例如：邮件格式"
            >
          </div>

          <div>
            <label class="block text-sm text-yl-ink-450 mb-1.5">
              处理规则（Prompt）
            </label>
            <textarea
              v-model="form.promptTemplate"
              rows="6"
              class="w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm font-mono"
              placeholder="请输入处理规则"
            />
            <p class="mt-1 text-xs text-yl-muted-400">
              使用 <code v-pre class="bg-yl-paper-300 px-1 rounded">{{text}}</code> 作为原文占位符
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <AppActionButton variant="outline" @click="showAddModal = false">
            取消
          </AppActionButton>
          <AppActionButton variant="primary" @click="saveCommand">
            {{ editingCommand ? '保存' : '添加' }}
          </AppActionButton>
        </div>
      </div>
    </div>
  </section>
</template>
