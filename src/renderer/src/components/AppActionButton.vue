<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'outline'
  size?: 'sm' | 'md'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  size: 'md',
  disabled: false,
})

const classes = computed(() => {
  const base
    = 'cursor-pointer rounded-full border border-yl-accent-600 font-semibold transition disabled:cursor-not-allowed disabled:opacity-55'
  const variant = props.variant === 'solid'
    ? 'bg-yl-accent-600 text-white'
    : 'bg-transparent text-yl-accent-600'
  const size = props.size === 'sm'
    ? 'px-3 py-1.5 text-xs'
    : 'px-4 py-2 text-sm'
  return `${base} ${variant} ${size}`
})
</script>

<template>
  <button type="button" :class="classes" :disabled="props.disabled">
    <slot />
  </button>
</template>
