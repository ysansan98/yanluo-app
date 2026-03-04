<script setup lang="ts">
import type { StatCard } from '../types/ui'
import DashboardStatCard from './DashboardStatCard.vue'

interface Props {
  cards: StatCard[]
}

defineProps<Props>()
</script>

<template>
  <section class="grid gap-2 grid-cols-3">
    <DashboardStatCard
      v-for="card in cards"
      :key="card.label"
      :label="card.label"
      :value="card.value"
      :tone-class="card.tone"
    />
  </section>
</template>
