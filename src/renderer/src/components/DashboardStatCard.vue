<script setup lang="ts">
interface Props {
  label: string
  value: string
  toneClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  toneClass: 'from-yl-stat-1-from to-yl-stat-1-to',
})
</script>

<template>
  <article
    class="rounded-2xl border border-yl-line-180 bg-gradient-to-br p-3"
    :class="props.toneClass"
  >
    <div class="text-xs text-yl-muted-420">
      {{ props.label }}
    </div>
    <div class="mt-1 text-2xl font-bold text-yl-ink-600">
      {{ props.value }}
    </div>
  </article>
</template>
