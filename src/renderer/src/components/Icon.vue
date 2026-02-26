<script setup lang="ts">
import { Icon as IconifyIcon } from '@iconify/vue'

interface Props {
  /** Iconify icon name, e.g. 'lucide:home' */
  name: string
  /** Size class, default is 'w-5 h-5' */
  size?: string
  /** Additional classes for the icon */
  className?: string
}

withDefaults(defineProps<Props>(), {
  size: 'w-5 h-5',
  className: '',
})
</script>

<template>
  <IconifyIcon :icon="name" :class="`${size} ${className}`" />
</template>
