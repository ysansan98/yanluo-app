<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const capturing = ref(false)
const currentShortcut = ref<string | null>(null)
const pressedKeys = ref<string[]>([])
const isLoading = ref(true)

onMounted(async () => {
  console.log('[StepShortcut] Mounted, loading current shortcut...')
  currentShortcut.value = await window.api.shortcut.get()
  isLoading.value = false
  // 进入快捷键设置步骤时立即禁用全局快捷键
  console.log('[StepShortcut] Disabling global shortcut...')
  await window.api.shortcut.disableGlobal()
  console.log('[StepShortcut] Global shortcut disabled')
})

function startCapture() {
  capturing.value = true
  pressedKeys.value = []
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
}

function stopCapture() {
  capturing.value = false
  pressedKeys.value = []
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
}

function handleKeyDown(event: KeyboardEvent) {
  event.preventDefault()

  const keys: string[] = []

  if (event.ctrlKey)
    keys.push('Ctrl')
  if (event.altKey)
    keys.push('Alt')
  if (event.shiftKey)
    keys.push('Shift')
  if (event.metaKey)
    keys.push('Cmd')

  const key = event.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': '↵',
      'Tab': 'Tab',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    }
    keys.push(keyMap[key] || key.toUpperCase())
  }

  if (keys.length > 0) {
    pressedKeys.value = keys
  }
}

async function handleKeyUp(event: KeyboardEvent) {
  event.preventDefault()

  if (
    pressedKeys.value.length > 0
    && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)
  ) {
    setTimeout(async () => {
      if (pressedKeys.value.length >= 1) {
        const shortcut = pressedKeys.value.join(' + ')
        currentShortcut.value = shortcut
        stopCapture()
        // 直接保存快捷键
        await window.api.shortcut.set(shortcut)
      }
    }, 100)
  }
}

onUnmounted(async () => {
  // 清理事件监听
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  // 重新启用全局快捷键
  console.log('[StepShortcut] Re-enabling global shortcut...')
  await window.api.shortcut.enableGlobal()
  console.log('[StepShortcut] Global shortcut re-enabled')
})
</script>

<template>
  <div class="space-y-8">
    <!-- 加载中 -->
    <div v-if="isLoading" class="text-center py-12">
      <div
        class="inline-block w-8 h-8 border-2 border-yl-brand-500 border-t-transparent rounded-full animate-spin"
      />
    </div>

    <template v-else>
      <!-- 快捷键捕获区域 -->
      <div
        class="rounded-3xl border-3 p-10 text-center transition-all cursor-pointer select-none"
        :class="
          capturing
            ? 'border-yl-brand-500 bg-yl-brand-50 shadow-xl ring-4 ring-yl-brand-100'
            : 'border-yl-line-200 bg-white shadow-yl-card hover:border-yl-brand-300'
        "
        @click="!capturing && startCapture()"
      >
        <!-- 捕获中状态 -->
        <div v-if="capturing" class="space-y-6">
          <div class="text-4xl animate-bounce">
            ⌨️
          </div>
          <div class="text-yl-brand-600 font-bold text-xl">
            按下快捷键组合...
          </div>
          <div class="h-20 flex items-center justify-center gap-3">
            <kbd
              v-for="key in pressedKeys"
              :key="key"
              class="px-6 py-3 bg-white border-2 border-yl-brand-400 rounded-xl text-xl font-mono shadow-lg animate-pulse"
            >
              {{ key }}
            </kbd>
            <span
              v-if="pressedKeys.length === 0"
              class="text-yl-muted-400 text-xl"
            >
              等待按键...
            </span>
          </div>
          <p class="text-sm text-yl-muted-400">
            按住组合键后松开即可确认
          </p>
        </div>

        <!-- 已设置状态 -->
        <div v-else-if="currentShortcut" class="space-y-6">
          <div class="text-4xl">
            ✅
          </div>
          <div class="text-yl-muted-400 font-medium">
            当前快捷键
          </div>
          <div class="flex items-center justify-center gap-3">
            <kbd
              v-for="key in currentShortcut.split(' + ')"
              :key="key"
              class="px-8 py-4 bg-yl-paper-100 border-2 border-yl-line-200 rounded-2xl text-2xl font-mono shadow-sm"
            >
              {{ key }}
            </kbd>
          </div>
          <p class="text-sm text-yl-brand-500 font-medium">
            点击此处重新设置
          </p>
        </div>

        <!-- 未设置状态 -->
        <div v-else class="space-y-6">
          <div class="text-5xl">
            ⌨️
          </div>
          <div class="text-yl-ink-700 text-xl font-bold">
            点击设置快捷键
          </div>
          <div class="text-yl-muted-500">
            设置一个顺手的组合键，按住开始录音，松开发送
          </div>
          <div
            class="flex items-center justify-center gap-2 text-sm text-yl-muted-400"
          >
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Ctrl</kbd>
            <span>+</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Z</kbd>
            <span class="mx-2">或</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Alt</kbd>
            <span>+</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Space</kbd>
          </div>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="rounded-2xl bg-yl-brand-50 border border-yl-brand-100 p-6">
        <div class="flex gap-4">
          <span class="text-xl">💡</span>
          <div class="text-sm text-yl-brand-800 space-y-1">
            <p class="font-bold">
              使用提示
            </p>
            <p>• 按住快捷键 → 开始录音</p>
            <p>• 说话时不要松开按键</p>
            <p>• 松开快捷键 → 结束录音并自动输入</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
