<script setup lang="ts">
import type { PolishCommand } from '../../../shared/ai/types'
import { computed, onMounted, ref } from 'vue'
import AppActionButton from './AppActionButton.vue'

const emit = defineEmits<{
  switchMenu: [menu: string]
}>()

// Icons (SVG components)
const icons = {
  text: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7"></path></svg>',
  sparkle: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>',
  translate: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>',
  briefcase: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>',
  clipboard: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>',
  tool: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1.608.982 3.47.093 4.263-1.302zM12 15a3 3 0 100-6 3 3 0 000 6z"></path></svg>',
  plus: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>',
  check: '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
  power: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
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
  const iconMap: Record<string, string> = {
    'polish-none': icons.text,
    'polish-oral': icons.sparkle,
    'polish-concise': icons.sparkle,
    'translate-en': icons.translate,
    'work-report': icons.briefcase,
    'meeting-minutes': icons.clipboard,
  }
  return iconMap[commandId] || icons.tool
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
      icon: icons.tool,
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
            v-html="icons.power"
          />
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
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
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
            <span v-html="icons.plus" />
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
              v-html="icons.text"
            />
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
            <span class="text-white" v-html="icons.check" />
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
              v-html="getIcon(command.id)"
            />
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
