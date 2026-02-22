<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const shortcut = ref('快捷键')
const testStatus = ref<'idle' | 'recording' | 'success'>('idle')
const recognizedText = ref('')
const isLoading = ref(true)
const inputRef = ref<HTMLInputElement | null>(null)

let unsubscribeShow: (() => void) | null = null
let unsubscribeFinal: (() => void) | null = null
let unsubscribeUpdate: (() => void) | null = null

onMounted(async () => {
  const s = await window.api.shortcut.get()
  if (s)
    shortcut.value = s
  isLoading.value = false

  // 组件加载后自动聚焦输入框
  nextTick(() => {
    inputRef.value?.focus()
  })

  unsubscribeShow = window.api.voice.onShow((payload) => {
    console.log('onShow')
    if (payload.status === 'recording') {
      testStatus.value = 'recording'
      recognizedText.value = ''
    }
  })

  unsubscribeFinal = window.api.voice.onFinal((payload) => {
    console.log('onFinal')
    testStatus.value = 'success'
    recognizedText.value = payload.finalText
  })

  unsubscribeUpdate = window.api.voice.onUpdate((payload) => {
    // 实时更新识别中的文本
    if (payload.partialText) {
      recognizedText.value = payload.partialText
    }
  })
})

onUnmounted(() => {
  unsubscribeShow?.()
  unsubscribeFinal?.()
  unsubscribeUpdate?.()
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
      <!-- 模拟输入框 -->
      <div class="relative">
        <label class="block text-sm font-medium text-yl-muted-500 mb-2 ml-1">
          在这里测试语音输入
        </label>
        <div class="relative">
          <input
            ref="inputRef"
            v-model="recognizedText"
            type="text"
            placeholder="按住快捷键开始说话，识别结果将显示在这里..."
            class="w-full px-4 py-3 rounded-2xl border-2 bg-white text-yl-ink-700 placeholder:text-yl-muted-300 transition-all pr-24 focus:border-yl-brand-400 focus:ring-2 focus:ring-yl-brand-100"
            :class="{
              'border-yl-line-200': testStatus === 'idle',
              'border-yl-accent-400': testStatus === 'recording',
              'border-yl-success-400': testStatus === 'success',
            }"
          >
          <!-- 录音中指示器 -->
          <div
            v-if="testStatus === 'recording'"
            class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-yl-accent-600"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yl-accent-400 opacity-75"
              />
              <span
                class="relative inline-flex rounded-full h-2 w-2 bg-yl-accent-500"
              />
            </span>
            <span class="text-xs font-medium">识别中</span>
          </div>
        </div>
      </div>

      <!-- 操作指引卡片 -->
      <div
        class="rounded-3xl border-2 p-6 text-center transition-all"
        :class="{
          'border-yl-line-200 bg-white shadow-yl-card': testStatus === 'idle',
          'border-yl-accent-600 bg-linear-to-br from-orange-50 to-red-50 shadow-xl ring-4 ring-orange-100':
            testStatus === 'recording',
          'border-yl-success-500 bg-yl-success-50 shadow-xl ring-4 ring-yl-success-100':
            testStatus === 'success',
        }"
      >
        <!-- 等待测试状态 -->
        <div v-if="testStatus === 'idle'" class="space-y-6">
          <div
            class="w-24 h-24 mx-auto rounded-2xl bg-yl-paper-200 flex items-center justify-center text-4xl"
          >
            👆
          </div>
          <div>
            <h3 class="font-bold text-yl-ink-700 text-xl mb-3">
              准备开始测试
            </h3>
            <p class="text-yl-muted-500 text-base">
              按下
              <kbd
                class="mx-2 px-4 py-2 bg-yl-paper-100 rounded-xl border-2 border-yl-line-200 font-mono text-yl-brand-600 font-bold"
              >
                {{ shortcut }}
              </kbd>
              开始录音
            </p>
          </div>
          <div class="text-sm text-yl-muted-400 max-w-md mx-auto">
            按住快捷键开始说话，松开即可查看识别结果
          </div>
        </div>

        <!-- 录音中状态 -->
        <div v-else-if="testStatus === 'recording'" class="space-y-6">
          <div
            class="w-24 h-24 mx-auto rounded-full bg-red-100 flex items-center justify-center relative"
          >
            <div
              class="absolute inset-0 rounded-full bg-yl-accent-500 animate-ping opacity-20"
            />
            <div
              class="w-12 h-12 bg-yl-accent-600 rounded-full animate-pulse relative z-10"
            />
          </div>
          <div>
            <h3 class="font-bold text-yl-accent-700 text-xl mb-2">
              正在录音...
            </h3>
            <p class="text-yl-accent-600">
              请说话，松开发送
            </p>
          </div>
          <!-- 音波动画 -->
          <div class="flex items-center justify-center gap-1.5 h-16">
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.5s; height: 30%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.4s; height: 70%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.6s; height: 50%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.3s; height: 90%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.5s; height: 40%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.35s; height: 80%"
            />
            <div
              class="w-2 bg-yl-accent-500 rounded-full animate-pulse"
              style="animation-duration: 0.45s; height: 60%"
            />
          </div>
        </div>

        <!-- 成功状态 -->
        <div v-else-if="testStatus === 'success'" class="space-y-3">
          <div
            class="size-20 mx-auto rounded-full bg-yl-success-100 flex items-center justify-center text-4xl text-yl-success-600"
          >
            ✓
          </div>
          <h3 class="font-bold text-yl-success-600 text-xl">
            识别成功！
          </h3>
          <p class="text-yl-success-600">
            内容已填入上方输入框，实际使用时会自动粘贴到光标位置
          </p>
        </div>
      </div>

      <!-- 使用技巧 -->
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-2xl bg-yl-paper-250 border border-yl-line-200 p-5">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-xl">🎯</span>
            <span class="font-bold text-yl-ink-600">最佳距离</span>
          </div>
          <p class="text-sm text-yl-muted-500">
            距离麦克风 10-30 厘米，说话清晰，语速适中
          </p>
        </div>
        <div class="rounded-2xl bg-yl-paper-250 border border-yl-line-200 p-5">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-xl">⚡</span>
            <span class="font-bold text-yl-ink-600">快捷输入</span>
          </div>
          <p class="text-sm text-yl-muted-500">
            识别结果会自动粘贴到当前光标位置
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
