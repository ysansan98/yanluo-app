<script setup lang="ts">
interface Props {
  title: string
  description: string
  note: string
}

const props = defineProps<Props>()
</script>

<template>
  <section class="rounded-3xl border border-yl-line-350/50 bg-white/88 p-6 shadow-yl-card">
    <div class="text-2xl font-bold text-yl-ink-700">
      {{ props.title }}
    </div>
    <div class="mt-2 text-sm text-yl-muted-500">
      {{ props.description }}
    </div>
    <div class="mt-5 rounded-2xl border border-dashed border-yl-line-260 bg-yl-paper-250 p-4 text-sm text-yl-muted-410">
      {{ props.note }}
    </div>
  </section>
</template>
