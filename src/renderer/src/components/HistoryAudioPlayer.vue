<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'

interface Props {
  audioPath: string
}

const props = defineProps<Props>()

const audioRef = ref<HTMLAudioElement | null>(null)
const progressContainerRef = ref<HTMLDivElement | null>(null)
const playing = ref(false)
const duration = ref(0)
const currentTime = ref(0)
const seeking = ref(false)
const seekValue = ref(0)
const showHoverTime = ref(false)
const hoverTime = ref(0)
const hoverLeft = ref(0)
const audioSrc = ref('')
let objectUrl: string | null = null

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

const progressValue = computed(() =>
  seeking.value ? seekValue.value : currentTime.value,
)
const progressPercent = computed(() => {
  if (duration.value <= 0)
    return 0
  return Math.min(
    100,
    Math.max(0, (progressValue.value / duration.value) * 100),
  )
})

async function togglePlay(): Promise<void> {
  const audio = audioRef.value
  if (!audio)
    return
  if (audio.paused) {
    await audio.play().catch(() => {})
  }
  else {
    audio.pause()
  }
}

function seekBy(offset: number): void {
  const audio = audioRef.value
  if (!audio || !Number.isFinite(audio.duration))
    return
  const next = Math.min(
    audio.duration,
    Math.max(0, audio.currentTime + offset),
  )
  audio.currentTime = next
  currentTime.value = next
}

function onLoadedMetadata(): void {
  const audio = audioRef.value
  if (!audio)
    return
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
}

function onTimeUpdate(): void {
  const audio = audioRef.value
  if (!audio || seeking.value)
    return
  currentTime.value = audio.currentTime
}

function onPlay(): void {
  playing.value = true
}

function onPause(): void {
  playing.value = false
}

function onEnded(): void {
  playing.value = false
}

function seekFromPosition(clientX: number): void {
  const container = progressContainerRef.value
  if (!container || duration.value <= 0)
    return
  const rect = container.getBoundingClientRect()
  const relative = (clientX - rect.left) / rect.width
  const clamped = Math.min(1, Math.max(0, relative))
  const newTime = duration.value * clamped
  seeking.value = true
  seekValue.value = newTime
  currentTime.value = newTime
  hoverTime.value = newTime
  hoverLeft.value = clamped * 100
  showHoverTime.value = true
}

function onProgressMouseDown(event: MouseEvent): void {
  seekFromPosition(event.clientX)
  const onMouseMove = (e: MouseEvent): void => {
    seekFromPosition(e.clientX)
  }
  const onMouseUp = (): void => {
    const audio = audioRef.value
    if (audio) {
      audio.currentTime = currentTime.value
    }
    seeking.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onProgressHover(event: MouseEvent): void {
  const target = event.currentTarget as HTMLInputElement | null
  if (!target || duration.value <= 0)
    return
  const rect = target.getBoundingClientRect()
  const relative = (event.clientX - rect.left) / rect.width
  const clamped = Math.min(1, Math.max(0, relative))
  hoverLeft.value = clamped * 100
  hoverTime.value = duration.value * clamped
  showHoverTime.value = true
}

function onProgressLeave(): void {
  if (!seeking.value) {
    showHoverTime.value = false
  }
}

async function loadAudio(): Promise<void> {
  const path = props.audioPath?.trim()
  if (!path)
    return
  const res = await window.api.history.readAudio({ path })
  if (!res.ok) {
    console.warn('readAudio failed', res.message, path)
    return
  }

  const binary = atob(res.base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: res.mime })
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
  }
  objectUrl = URL.createObjectURL(blob)
  audioSrc.value = objectUrl
}

watch(
  () => props.audioPath,
  () => {
    void loadAudio()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  audioRef.value?.pause()
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
})
</script>

<template>
  <div
    class="mt-2 rounded-xl border border-yl-line-230 bg-yl-paper-150/80 px-3 py-2.5"
    @click.stop
  >
    <audio
      ref="audioRef"
      :src="audioSrc"
      preload="metadata"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
    />

    <div class="flex items-center gap-2">
      <button
        class="cursor-pointer rounded-lg border border-yl-line-280 bg-white px-2.5 py-1 text-xs text-yl-ink-650"
        :aria-label="playing ? '暂停' : '播放'"
        :title="playing ? '暂停' : '播放'"
        @click="togglePlay"
      >
        <Icon
          :name="playing ? 'lucide:pause' : 'lucide:play'"
          size="w-4 h-4"
        />
      </button>
      <button
        class="cursor-pointer rounded-lg border border-yl-line-280 bg-white px-2 py-1 text-xs text-yl-ink-650"
        aria-label="后退5秒"
        title="后退5秒"
        @click="seekBy(-5)"
      >
        <Icon name="lucide:skip-back" size="w-4 h-4" />
      </button>
      <button
        class="cursor-pointer rounded-lg border border-yl-line-280 bg-white px-2 py-1 text-xs text-yl-ink-650"
        aria-label="前进5秒"
        title="前进5秒"
        @click="seekBy(5)"
      >
        <Icon name="lucide:skip-forward" size="w-4 h-4" />
      </button>
      <div class="ml-auto text-[11px] text-yl-muted-430">
        {{ formatTime(progressValue) }} / {{ formatTime(duration) }}
      </div>
    </div>

    <div class="relative mt-2">
      <div
        v-if="showHoverTime"
        class="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded-md border border-yl-line-250 bg-white px-1.5 py-0.5 text-[10px] text-yl-ink-650"
        :style="{ left: `${hoverLeft}%` }"
      >
        {{ formatTime(hoverTime) }}
      </div>
      <!-- 自定义进度条：背景轨道 + 进度填充 + 可拖拽滑块 -->
      <div
        ref="progressContainerRef"
        class="group relative h-2 w-full cursor-pointer rounded-full bg-yl-line-230"
        @mousemove="onProgressHover"
        @mouseleave="onProgressLeave"
        @mousedown="onProgressMouseDown"
      >
        <!-- 进度填充 -->
        <div
          class="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-yl-accent-600 transition-[width]"
          :style="{ width: `${progressPercent}%` }"
        />
        <!-- 滑块（仅在悬停或拖拽时显示） -->
        <div
          class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-yl-accent-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          :style="{ left: `calc(${progressPercent}% - 6px)` }"
          :class="{ 'opacity-100': seeking }"
        />
      </div>
    </div>
  </div>
</template>
