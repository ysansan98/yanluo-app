<script setup lang="ts">
import { reactive } from 'vue'

const versions = reactive({ ...window.electron.process.versions })
</script>

<template>
  <ul
    class="mt-3 flex flex-wrap gap-2 text-xs text-[#3e3e3e] [font-family:'JetBrains_Mono',monospace]"
  >
    <li class="rounded-full border border-black/10 bg-white/80 px-3 py-1">
      Electron v{{ versions.electron }}
    </li>
    <li class="rounded-full border border-black/10 bg-white/80 px-3 py-1">
      Chromium v{{ versions.chrome }}
    </li>
    <li class="rounded-full border border-black/10 bg-white/80 px-3 py-1">
      Node v{{ versions.node }}
    </li>
  </ul>
</template>
