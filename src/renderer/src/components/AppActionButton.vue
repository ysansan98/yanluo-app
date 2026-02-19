<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'outline' | 'primary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  size: 'md',
  disabled: false,
  loading: false,
})

const classes = computed(() => {
  const base
    = 'cursor-pointer rounded-full border font-semibold transition disabled:cursor-not-allowed disabled:opacity-55'

  let variantClass = ''
  switch (props.variant) {
    case 'solid':
    case 'primary':
      variantClass
        = 'bg-yl-accent-600 border-yl-accent-600 text-white hover:bg-yl-accent-700'
      break
    case 'outline':
      variantClass
        = 'bg-transparent border-yl-accent-600 text-yl-accent-600 hover:bg-yl-accent-50'
      break
    case 'ghost':
      variantClass
        = 'bg-transparent border-transparent text-yl-ink-600 hover:bg-yl-paper-200'
      break
  }

  const size
    = props.size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'

  return `${base} ${variantClass} ${size}`
})
</script>

<template>
  <button
    type="button"
    :class="classes"
    :disabled="props.disabled || props.loading"
  >
    <span
      v-if="props.loading"
      class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"
    />
    <slot />
  </button>
</template>
