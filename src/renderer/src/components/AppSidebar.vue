<script setup lang="ts">
import type { MenuItem, MenuKey } from '../types/ui'
import Icon from './Icon.vue'

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
    return 'lucide:home'
  if (key === 'polish')
    return 'lucide:sparkles'
  if (key === 'provider')
    return 'lucide:cloud'
  if (key === 'settings')
    return 'lucide:settings'
  return 'lucide:info'
}
</script>

<template>
  <aside
    class="flex h-full flex-col overflow-hidden rounded-[20px] border border-yl-line-350/60 bg-white/82 shadow-yl-panel"
  >
    <div class="h-8 shrink-0 [-webkit-app-region:drag]" />

    <div
      class="mx-3 rounded-2xl bg-[linear-gradient(135deg,var(--color-yl-ink-700),var(--color-yl-brand-600))] px-4 py-3 text-white [-webkit-app-region:no-drag]"
    >
      <div class="text-[10px] tracking-[1.1px] uppercase opacity-75">
        Yanluo
      </div>
      <div class="mt-1 text-xl leading-none font-bold">
        言落
      </div>
      <div class="mt-1 text-[11px] leading-none opacity-88">
        声起言落，字自成章
      </div>
    </div>

    <nav
      class="mt-3 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3 pr-2 [-webkit-app-region:no-drag]"
    >
      <button
        v-for="item in props.menuItems"
        :key="item.key"
        class="flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition"
        :class="
          props.activeMenu === item.key
            ? 'border-yl-brand-500/30 bg-yl-brand-100 text-yl-ink-700'
            : 'border-transparent bg-transparent text-yl-ink-500 hover:border-yl-line-300 hover:bg-white/85'
        "
        @click="emit('update:activeMenu', item.key)"
      >
        <span
          class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/70 text-[12px] leading-none"
        >
          <Icon :name="menuIcon(item.key)" size="w-4 h-4" />
        </span>
        <span class="truncate">{{ item.label }}</span>
      </button>
    </nav>
  </aside>
</template>
