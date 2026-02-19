<script setup lang="ts">
interface Props {
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
}

const props = defineProps<Props>()
</script>

<template>
  <section
    class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-6 shadow-yl-card"
  >
    <div class="text-2xl font-bold text-yl-ink-700">
      关于
    </div>
    <div class="mt-2 text-sm text-yl-muted-500">
      版本信息与反馈入口。
    </div>

    <div class="mt-5 grid grid-cols-3 gap-3">
      <div class="rounded-2xl border border-yl-line-180 bg-yl-paper-250 p-3">
        <div class="text-xs text-yl-muted-390">
          Electron
        </div>
        <div class="mt-1 text-base font-semibold text-yl-ink-650">
          {{ props.electronVersion }}
        </div>
      </div>
      <div class="rounded-2xl border border-yl-line-180 bg-yl-paper-250 p-3">
        <div class="text-xs text-yl-muted-390">
          Chrome
        </div>
        <div class="mt-1 text-base font-semibold text-yl-ink-650">
          {{ props.chromeVersion }}
        </div>
      </div>
      <div class="rounded-2xl border border-yl-line-180 bg-yl-paper-250 p-3">
        <div class="text-xs text-yl-muted-390">
          Node
        </div>
        <div class="mt-1 text-base font-semibold text-yl-ink-650">
          {{ props.nodeVersion }}
        </div>
      </div>
    </div>

    <div
      class="mt-4 rounded-2xl border border-yl-line-180 bg-white p-3 text-sm text-yl-muted-560"
    >
      反馈入口：GitHub Issue / 内部反馈群（链接待接入）
    </div>
  </section>
</template>
