<script setup lang="ts">
import type { MenuItem, MenuKey } from '../types/ui'
import { computed, ref } from 'vue'
import { useStickyHeader } from '../composables/useStickyHeader'
import Icon from './Icon.vue'

interface Props {
  menuItems: MenuItem[]
  activeMenu: MenuKey
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:activeMenu': [value: MenuKey]
}>()

// 吸顶检测锚点
const sentinelRef = ref<HTMLElement | null>(null)
const { isSticky } = useStickyHeader(sentinelRef, { offset: 44 })

// 动态类名计算
const headerClasses = computed(() => {
  // 使用 transform 方案实现平滑过渡
  // 始终使用 fixed 定位，通过 transform 控制位置和大小变化
  const base = [
    'fixed',
    'left-6',
    'z-50',
    'border',
    'border-yl-line-400/50',
    'bg-white/72',
    'backdrop-blur',
    '[-webkit-app-region:no-drag]',
    'transition-all',
    'duration-300',
    'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'will-change-transform',
  ]

  if (isSticky.value) {
    // 吸顶状态：右移避开交通灯，上移减少空白，Logo区域缩小
    // 同时增加右边距以补偿右移，避免溢出
    return [
      ...base,
      'top-3',
      'translate-x-[var(--yl-sticky-offset,80px)]',
      'right-24',
      'rounded-2xl',
      'px-3',
      'py-2',
      'shadow-lg',
    ]
  }
  else {
    // 普通状态：原始位置，正常大小
    return [
      ...base,
      'top-12',
      'translate-x-0',
      'right-6',
      'rounded-3xl',
      'px-4',
      'py-3',
      'shadow-yl-panel',
    ]
  }
})

// Logo 区域类名
const logoClasses = computed(() => {
  const base = [
    'rounded-2xl',
    'bg-[linear-gradient(135deg,var(--color-yl-ink-700),var(--color-yl-brand-600))]',
    'text-white',
    'transition-[width,height,padding,opacity]',
    'duration-300',
    'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'overflow-hidden',
  ]

  if (isSticky.value) {
    return [
      ...base,
      'w-20', // 宽度从 220px 缩小到 80px
      'h-10', // 固定高度
      'px-2',
      'py-1.5',
    ]
  }
  else {
    return [
      ...base,
      'px-3',
      'py-2.5',
    ]
  }
})

// 网格布局类名
const gridClasses = computed(() => {
  if (isSticky.value) {
    return 'grid grid-cols-[80px_1fr] items-center gap-2'
  }
  return 'grid grid-cols-[220px_1fr] items-center gap-3'
})

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
  <!-- 吸顶检测锚点：位于菜单栏顶部，高度为 1px，透明不可见 -->
  <div
    ref="sentinelRef"
    class="pointer-events-none absolute top-0 left-0 right-0 h-px"
    aria-hidden="true"
  />

  <header :class="headerClasses">
    <div :class="gridClasses">
      <!-- Logo 区域 -->
      <div :class="logoClasses">
        <!-- 吸顶状态：只显示"言"字 -->
        <template v-if="isSticky">
          <div class="flex h-full items-center justify-center">
            <span class="text-lg font-bold">言</span>
          </div>
        </template>

        <!-- 普通状态：完整 Logo -->
        <template v-else>
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
        </template>
      </div>

      <nav
        class="overflow-x-auto rounded-2xl border border-yl-line-250 bg-yl-paper-250/86 p-1.5 [scrollbar-width:none] [-webkit-app-region:no-drag]"
      >
        <div class="flex min-w-max items-center gap-1.5">
          <button
            v-for="item in props.menuItems"
            :key="item.key"
            class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm transition [-webkit-app-region:no-drag]"
            :class="
              props.activeMenu === item.key
                ? 'border-yl-brand-500/30 bg-yl-brand-100 text-yl-ink-700'
                : 'border-transparent bg-transparent text-yl-ink-500 hover:border-yl-line-300 hover:bg-white/80'
            "
            @click="emit('update:activeMenu', item.key)"
          >
            <span
              class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/70 text-[12px] leading-none"
            >
              <Icon :name="menuIcon(item.key)" size="w-4 h-4" />
            </span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </nav>
    </div>
  </header>

  <!-- 占位元素，防止内容被 fixed 菜单遮挡 -->
  <div
    class="transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
    :class="isSticky ? 'h-16' : 'h-24'"
    aria-hidden="true"
  />
</template>
