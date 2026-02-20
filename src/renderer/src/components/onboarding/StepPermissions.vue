<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppActionButton from '../AppActionButton.vue'

type PermissionStatus = 'GRANTED' | 'DENIED' | 'NOT_DETERMINED' | 'RESTRICTED'
type PermissionKind = 'MICROPHONE' | 'ACCESSIBILITY'

interface PermissionState {
  kind: PermissionKind
  label: string
  description: string
  detail: string
  icon: string
  status: PermissionStatus
}

const emit = defineEmits<{
  complete: []
}>()

// 权限列表，初始状态为检测中
const permissions = ref<PermissionState[]>([
  {
    kind: 'MICROPHONE',
    label: '麦克风权限',
    description: '录制语音输入',
    detail:
      '需要访问麦克风来录制您的语音，所有音频处理均在本地完成，不会上传到任何服务器',
    icon: '🎤',
    status: 'NOT_DETERMINED',
  },
  {
    kind: 'ACCESSIBILITY',
    label: '辅助功能权限',
    description: '自动粘贴识别结果',
    detail:
      '需要辅助功能权限来将识别结果自动输入到当前光标位置，让语音输入更便捷',
    icon: '⌨️',
    status: 'NOT_DETERMINED',
  },
])

const isRequesting = ref<PermissionKind | null>(null)
const error = ref('')

// 只检测状态，显示给用户，不自动触发完成
onMounted(async () => {
  await checkAllPermissions()
  // 监听窗口聚焦事件，用户从系统设置返回时立即检测
  window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  window.removeEventListener('focus', handleWindowFocus)
})

// 窗口聚焦时检测权限
async function handleWindowFocus() {
  // 只检测尚未授权的权限
  const hasPending = permissions.value.some(p => p.status !== 'GRANTED')
  if (hasPending) {
    await checkAllPermissions()
    checkIfAllGranted()
  }
}

async function checkAllPermissions() {
  for (const perm of permissions.value) {
    try {
      perm.status = await window.api.permission.check(perm.kind)
    }
    catch {
      perm.status = 'NOT_DETERMINED'
    }
  }
}

async function requestPermission(kind: PermissionKind) {
  isRequesting.value = kind
  error.value = ''
  try {
    const status = await window.api.permission.request(kind)
    const perm = permissions.value.find(p => p.kind === kind)
    if (perm) {
      perm.status = status
    }

    // 检查是否全部授权完成，如果是则触发完成
    checkIfAllGranted()
  }
  catch {
    error.value = '授权请求失败，请前往系统设置手动开启'
  }
  finally {
    isRequesting.value = null
  }
}

function checkIfAllGranted() {
  const allGranted = permissions.value.every(p => p.status === 'GRANTED')
  if (allGranted) {
    // 所有权限已授权，触发完成
    emit('complete')
  }
}

function getStatusConfig(status: PermissionStatus) {
  switch (status) {
    case 'GRANTED':
      return {
        cardBg: 'bg-yl-success-50',
        border: 'border-yl-success-100',
        iconBg: 'bg-yl-success-100',
        iconColor: 'text-yl-success-600',
        badge: 'bg-yl-success-500 text-white',
        badgeText: '✓ 已授权',
      }
    case 'DENIED':
      return {
        cardBg: 'bg-gradient-to-br from-red-50 to-rose-50',
        border: 'border-red-200',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        badge: 'bg-red-500 text-white',
        badgeText: '✗ 已拒绝',
      }
    case 'RESTRICTED':
      return {
        cardBg: 'bg-gradient-to-br from-orange-50 to-amber-50',
        border: 'border-orange-200',
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-600',
        badge: 'bg-orange-500 text-white',
        badgeText: '! 受限',
      }
    default:
      return {
        cardBg: 'bg-white',
        border: 'border-yl-line-200',
        iconBg: 'bg-yl-paper-250',
        iconColor: 'text-yl-muted-400',
        badge: 'bg-yl-brand-100 text-yl-brand-600',
        badgeText: '待授权',
      }
  }
}

function getActionText(status: PermissionStatus) {
  switch (status) {
    case 'GRANTED':
      return '已完成'
    case 'DENIED':
      return '重新授权'
    case 'RESTRICTED':
      return '去系统设置'
    default:
      return '立即授权'
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 错误提示 -->
    <div
      v-if="error"
      class="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700"
    >
      <div class="flex items-center gap-2">
        <span>⚠️</span>
        {{ error }}
      </div>
    </div>

    <!-- 权限卡片列表 -->
    <div
      v-for="perm in permissions"
      :key="perm.kind"
      class="rounded-3xl border-2 p-4 transition-all"
      :class="[
        getStatusConfig(perm.status).cardBg,
        getStatusConfig(perm.status).border,
      ]"
    >
      <div class="flex items-start gap-5">
        <div
          class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shrink-0"
          :class="[
            getStatusConfig(perm.status).iconBg,
            getStatusConfig(perm.status).iconColor,
          ]"
        >
          {{ perm.icon }}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 class="font-bold text-yl-ink-700 text-lg">
                {{ perm.label }}
              </h4>
              <p class="text-sm text-yl-muted-400">
                {{ perm.description }}
              </p>
            </div>
            <span
              class="text-sm px-4 py-1.5 rounded-full font-medium shrink-0"
              :class="getStatusConfig(perm.status).badge"
            >
              {{ getStatusConfig(perm.status).badgeText }}
            </span>
          </div>

          <p class="text-yl-muted-500 mb-5 leading-relaxed">
            {{ perm.detail }}
          </p>

          <div class="flex items-center gap-4">
            <AppActionButton
              v-if="perm.status !== 'GRANTED'"
              variant="primary"
              size="md"
              :loading="isRequesting === perm.kind"
              @click="requestPermission(perm.kind)"
            >
              {{ getActionText(perm.status) }}
            </AppActionButton>

            <div
              v-else
              class="flex items-center gap-2 text-yl-success-600 font-medium"
            >
              <span
                class="w-6 h-6 rounded-full bg-yl-success-500 text-white flex items-center justify-center text-sm"
              >✓</span>
              该权限已配置完成
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动设置指引 -->
    <div class="rounded-2xl bg-yl-paper-250 border border-yl-line-200 p-6">
      <div class="flex gap-4">
        <span class="text-2xl">💡</span>
        <div>
          <p class="font-bold text-yl-ink-600 mb-2">
            无法弹出授权窗口？
          </p>
          <p class="text-yl-muted-500 text-sm leading-relaxed mb-3">
            如果系统没有显示授权弹窗，请手动前往系统设置开启权限：
          </p>
          <ol
            class="text-sm text-yl-muted-500 space-y-1 list-decimal list-inside"
          >
            <li>
              打开 <span class="font-medium text-yl-ink-600">系统设置</span>
            </li>
            <li>
              进入 <span class="font-medium text-yl-ink-600">隐私与安全</span>
            </li>
            <li>
              点击
              <span class="font-medium text-yl-ink-600">麦克风/辅助功能</span>
            </li>
            <li>
              找到并启用 <span class="font-medium text-yl-ink-600">言落</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>
