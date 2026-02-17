<script setup lang="ts">
import type { MenuItem, MenuKey } from '../types/ui'

interface Props {
  menuItems: MenuItem[]
  activeMenu: MenuKey
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:activeMenu': [value: MenuKey]
}>()

function menuIcon(key: MenuKey): string {
  if (key === 'home')
    return '⌂'
  if (key === 'workbench')
    return '⦿'
  if (key === 'polish')
    return '✦'
  if (key === 'provider')
    return '☁'
  if (key === 'settings')
    return '⚙'
  return 'ℹ'
}
</script>

<template>
  <header class="rounded-3xl border border-yl-line-400/50 bg-white/72 px-4 py-3 shadow-yl-panel backdrop-blur [-webkit-app-region:no-drag]">
    <div class="grid grid-cols-[220px_1fr] items-center gap-3">
      <div class="rounded-2xl bg-[linear-gradient(135deg,var(--color-yl-ink-700),var(--color-yl-brand-600))] px-3 py-2.5 text-white">
        <div class="text-[10px] tracking-[1.1px] uppercase opacity-75">
          Yanluo
        </div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-xl leading-none font-bold">
            言落
          </div>
          <div class="text-[11px] leading-none opacity-88">
            声起言落，字自成章
          </div>
        </div>
      </div>

      <nav class="overflow-x-auto rounded-2xl border border-yl-line-250 bg-yl-paper-250/86 p-1.5 [scrollbar-width:none] [-webkit-app-region:no-drag]">
        <div class="flex min-w-max items-center gap-1.5">
          <button
            v-for="item in props.menuItems"
            :key="item.key"
            class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm transition [-webkit-app-region:no-drag]"
            :class="props.activeMenu === item.key
              ? 'border-yl-brand-500/30 bg-yl-brand-100 text-yl-ink-700'
              : 'border-transparent bg-transparent text-yl-ink-500 hover:border-yl-line-300 hover:bg-white/80'"
            @click="emit('update:activeMenu', item.key)"
          >
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/70 text-[12px] leading-none">{{ menuIcon(item.key) }}</span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </nav>
    </div>
  </header>
</template>
