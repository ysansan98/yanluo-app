<script setup lang="ts">
import AppActionButton from './AppActionButton.vue'

interface Props {
  globalShortcut: string
  micPermissionHint: string
  accessibilityPermissionHint: string
  liveStatus: string
  continueWindowMsInput: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:continueWindowMsInput': [value: string]
  'applyContinueWindowMs': []
}>()
</script>

<template>
  <section class="space-y-4">
    <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
      <div class="text-2xl font-bold text-yl-ink-700">
        设置
      </div>
      <div class="mt-1 text-sm text-yl-muted-500">
        全局快捷键、麦克风选择、权限检测。
      </div>
    </section>

    <section class="grid grid-cols-2 gap-4">
      <article class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
        <div class="text-base font-bold text-yl-ink-650">
          全局快捷键
        </div>
        <div class="mt-2 rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3 text-sm text-yl-ink-450">
          当前监听组合：{{ props.globalShortcut }}
        </div>
        <div class="mt-2 text-xs text-yl-muted-390">
          快捷键自定义入口待接入。
        </div>
      </article>

      <article class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
        <div class="text-base font-bold text-yl-ink-650">
          麦克风选择
        </div>
        <select class="mt-2 w-full rounded-lg border border-yl-line-300 bg-white px-3 py-2 text-sm text-yl-ink-450" disabled>
          <option>默认输入设备（待接入设备列表）</option>
        </select>
        <div class="mt-2 text-xs text-yl-muted-390">
          设备枚举和切换逻辑待接入。
        </div>
      </article>
    </section>

    <section class="grid grid-cols-2 gap-4">
      <article class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
        <div class="text-base font-bold text-yl-ink-650">
          权限检测
        </div>
        <div class="mt-2 space-y-2 text-sm text-yl-ink-450">
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3">
            麦克风：{{ props.micPermissionHint }}
          </div>
          <div class="rounded-xl border border-yl-line-180 bg-yl-paper-250 p-3">
            辅助功能（用于粘贴识别结果）：{{ props.accessibilityPermissionHint }}
          </div>
        </div>
      </article>

      <article class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-5 shadow-yl-card">
        <div class="text-base font-bold text-yl-ink-650">
          录音参数
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <label class="text-sm text-yl-ink-450">Continue Window(ms)</label>
          <input
            :value="props.continueWindowMsInput"
            class="w-32 rounded-lg border border-yl-line-300 bg-white px-2.5 py-1.5 text-sm"
            @input="emit('update:continueWindowMsInput', ($event.target as HTMLInputElement).value)"
          >
          <AppActionButton variant="outline" size="sm" @click="emit('applyContinueWindowMs')">
            应用
          </AppActionButton>
        </div>
        <div class="mt-2 text-xs text-yl-muted-390">
          当前状态：{{ props.liveStatus }}
        </div>
      </article>
    </section>
  </section>
</template>
