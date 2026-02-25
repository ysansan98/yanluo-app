<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const capturing = ref(false)
const currentShortcut = ref<string | null>(null)
const pressedKeys = ref<string[]>([])
const isLoading = ref(true)
// 记录完整的快捷键组合（用于在keyup时保存）
const pendingShortcut = ref<string | null>(null)
// 捕获区域的 DOM 引用
const captureAreaRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  currentShortcut.value = await window.api.shortcut.get()
  isLoading.value = false
  // 进入快捷键设置步骤时立即禁用全局快捷键
  await window.api.shortcut.disableGlobal()
})

function startCapture() {
  capturing.value = true
  pressedKeys.value = []
  pendingShortcut.value = null
  // 聚焦到捕获区域，确保能接收键盘事件
  captureAreaRef.value?.focus()
  // 使用 capture 阶段确保能捕获到系统快捷键
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
}

function stopCapture() {
  capturing.value = false
  pressedKeys.value = []
  pendingShortcut.value = null
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
}

// 保存待定的快捷键（在 keyup 不可靠时作为备选）
async function savePendingShortcut() {
  if (pendingShortcut.value) {
    const shortcut = pendingShortcut.value
    currentShortcut.value = shortcut
    console.log('[StepShortcut] Saving pending shortcut:', shortcut)
    await window.api.shortcut.set(shortcut)
    pendingShortcut.value = null
  }
}

// 从键盘事件获取当前按下的键列表
function getPressedKeysFromEvent(event: KeyboardEvent): string[] {
  const keys: string[] = []

  if (event.ctrlKey)
    keys.push('Ctrl')
  if (event.altKey)
    keys.push('Alt')
  if (event.shiftKey)
    keys.push('Shift')
  if (event.metaKey)
    keys.push('Cmd')

  // 注意：event.key 是当前触发事件的键，不一定是修饰键
  // 对于keydown事件，如果key是普通键（非修饰键），添加到列表
  const key = event.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': 'Return',
      'Tab': 'Tab',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    }
    keys.push(keyMap[key] || key.toUpperCase())
  }

  return keys
}

function handleKeyDown(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  const keys = getPressedKeysFromEvent(event)

  if (keys.length > 0) {
    pressedKeys.value = keys
    // 记录完整的快捷键组合（用于后续保存）
    pendingShortcut.value = keys.join(' + ')
  }
}

async function handleKeyUp(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  // 获取被松开的键名
  const releasedKey = event.key

  // 将 event.key 映射到我们的键名
  const keyMapping: Record<string, string> = {
    Control: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Meta: 'Cmd',
  }

  const mappedKey = keyMapping[releasedKey]
  console.log('[StepShortcut] mappedKey:', mappedKey)

  // 从 pressedKeys 中移除被松开的键
  if (mappedKey) {
    const before = [...pressedKeys.value]
    pressedKeys.value = pressedKeys.value.filter(k => k !== mappedKey)
    console.log('[StepShortcut] Removed modifier. Before:', before, 'After:', [...pressedKeys.value])
  }
  else {
    // 普通键被松开（非修饰键）
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': 'Return',
      'Tab': 'Tab',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
    }
    const normalizedKey = keyMap[releasedKey] || releasedKey.toUpperCase()
    pressedKeys.value = pressedKeys.value.filter(k => k !== normalizedKey)
    console.log('[StepShortcut] Removed normal key:', normalizedKey)
  }

  // 当所有键都松开时，保存快捷键
  if (pressedKeys.value.length === 0 && pendingShortcut.value) {
    const shortcut = pendingShortcut.value
    currentShortcut.value = shortcut
    stopCapture()
    // 保存快捷键
    await window.api.shortcut.set(shortcut)
  }
}

onUnmounted(async () => {
  // 如果有待保存的快捷键，先保存（keyup 事件可能没有被触发）
  await savePendingShortcut()
  // 清理事件监听（必须与添加时使用相同的参数）
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
  // 重新启用全局快捷键
  await window.api.shortcut.enableGlobal()
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
        ref="captureAreaRef"
        tabindex="-1"
        class="rounded-3xl border-3 p-10 text-center transition-all cursor-pointer select-none outline-none"
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
            class="flex items-center justify-center gap-2 text-sm text-yl-muted-400 flex-wrap"
          >
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Ctrl</kbd>
            <span>+</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Z</kbd>
            <span class="mx-1">或</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Alt</kbd>
            <span>+</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Space</kbd>
            <span class="mx-1">或</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Ctrl</kbd>
            <span>+</span>
            <kbd class="px-2 py-1 bg-yl-paper-100 rounded border">Alt</kbd>
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
