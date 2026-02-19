<script setup lang="ts">
import type { Component } from 'vue'
import LogoSvg from '@renderer/assets/logo.svg'
import { computed, ref } from 'vue'
import AppActionButton from '../AppActionButton.vue'
import StepDownloadModel from './StepDownloadModel.vue'
import StepPermissions from './StepPermissions.vue'
import StepShortcut from './StepShortcut.vue'
import StepTestVoice from './StepTestVoice.vue'

interface Step {
  id: string
  title: string
  subtitle: string
  description: string
  icon: string
  component: Component
}

const emit = defineEmits<{
  close: []
}>()

const steps: Step[] = [
  {
    id: 'model',
    title: '下载语音模型',
    subtitle: '离线识别，随开随用',
    description:
      '下载约 300MB 的语音识别模型，支持中英粤日韩多语言，无需联网即可使用',
    icon: '📦',
    component: StepDownloadModel,
  },
  {
    id: 'permission',
    title: '授权系统权限',
    subtitle: '安全可控，本地处理',
    description: '需要麦克风和辅助功能权限，所有处理均在本地完成，保护您的隐私',
    icon: '🔐',
    component: StepPermissions,
  },
  {
    id: 'shortcut',
    title: '设置快捷键',
    subtitle: '一键启动，高效输入',
    description: '选择一个顺手的快捷键组合，按住说话，松开发送，让输入更高效',
    icon: '⌨️',
    component: StepShortcut,
  },
  {
    id: 'test',
    title: '测试语音输入',
    subtitle: '立即体验，畅快输入',
    description: '按下快捷键说几句话，体验语音输入带来的便捷',
    icon: '🎤',
    component: StepTestVoice,
  },
]

const currentStepIndex = ref(0)
const completedSteps = ref<string[]>([])

const currentStep = computed(() => steps[currentStepIndex.value])

function markStepComplete(stepId: string) {
  if (!completedSteps.value.includes(stepId)) {
    completedSteps.value.push(stepId)
  }
}

async function completeOnboarding() {
  await window.api.onboarding.complete()
  emit('close')
}

function nextStep() {
  if (currentStepIndex.value < steps.length - 1) {
    currentStepIndex.value++
  }
  else {
    completeOnboarding()
  }
}

function prevStep() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
  }
}

function goToStep(index: number) {
  // 只能跳转到已完成或当前步骤
  if (
    index <= currentStepIndex.value
    || completedSteps.value.includes(steps[index].id)
  ) {
    currentStepIndex.value = index
  }
}

function getStepStatus(index: number): 'pending' | 'current' | 'completed' {
  const stepId = steps[index].id
  if (completedSteps.value.includes(stepId))
    return 'completed'
  if (index === currentStepIndex.value)
    return 'current'
  if (index < currentStepIndex.value)
    return 'completed'
  return 'pending'
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex">
    <!-- 左侧导航栏 -->
    <div class="w-80 bg-yl-paper-300 border-r border-yl-line-200 flex flex-col">
      <!-- Logo 区域 -->
      <div class="h-16 flex items-center border-b border-yl-line-200">
        <div class="flex items-center gap-3 ml-20">
          <div
            class="w-10 h-10 rounded-xl bg-linear-to-br from-yl-brand-500 to-yl-accent-600 flex items-center justify-center text-white text-xl font-bold"
          >
            <img :src="LogoSvg">
          </div>
          <div>
            <div class="font-bold text-yl-ink-700 text-base">
              言落
            </div>
            <div class="text-xs text-yl-muted-400">
              语音输入助手
            </div>
          </div>
        </div>
      </div>

      <!-- 步骤导航 -->
      <div class="flex-1 py-8 px-4 space-y-2 overflow-y-auto">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="flex items-start gap-4 p-4 rounded-2xl transition-all cursor-pointer group"
          :class="{
            'bg-white shadow-yl-card border border-yl-line-200':
              getStepStatus(index) === 'current',
            'hover:bg-yl-paper-250': getStepStatus(index) !== 'current',
          }"
          @click="goToStep(index)"
        >
          <!-- 步骤编号/图标 -->
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all"
            :class="{
              'bg-gradient-to-br from-yl-brand-500 to-yl-accent-600 text-white shadow-lg':
                getStepStatus(index) === 'current',
              'bg-yl-success-500 text-white': getStepStatus(index) === 'completed',
              'bg-yl-line-200 text-yl-muted-500':
                getStepStatus(index) === 'pending',
            }"
          >
            <span v-if="getStepStatus(index) === 'completed'">✓</span>
            <span v-else>{{ step.icon }}</span>
          </div>

          <!-- 步骤信息 -->
          <div class="flex-1 min-w-0">
            <div
              class="font-medium mb-0.5"
              :class="{
                'text-yl-ink-700': getStepStatus(index) === 'current',
                'text-yl-muted-500': getStepStatus(index) !== 'current',
              }"
            >
              {{ step.title }}
            </div>
            <div class="text-xs text-yl-muted-400 truncate">
              {{ step.subtitle }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div
      class="flex-1 bg-[radial-gradient(circle_at_20%_20%,var(--color-yl-paper-400)_0,var(--color-yl-paper-300)_50%,var(--color-yl-paper-500)_100%)] flex flex-col"
    >
      <!-- 顶部栏 -->
      <div
        class="h-16 flex items-center justify-between px-8 border-b border-yl-line-200/50"
      >
        <div class="flex items-center gap-3">
          <span class="text-xl">{{ currentStep.icon }}</span>
          <div>
            <h1 class="font-bold text-yl-ink-700">
              {{ currentStep.title }}
            </h1>
            <p class="text-xs text-yl-muted-400">
              {{ currentStep.subtitle }}
            </p>
          </div>
        </div>

        <!-- 跳过按钮区域已移除 -->
        <div />
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 overflow-y-auto p-8">
        <div class="max-w-2xl mx-auto">
          <!-- 步骤描述 -->
          <p class="text-yl-muted-500 mb-8 text-base leading-relaxed">
            {{ currentStep.description }}
          </p>

          <!-- 步骤组件 -->
          <component
            :is="currentStep.component"
            @complete="
              markStepComplete(currentStep.id);
              nextStep();
            "
          />
        </div>
      </div>

      <!-- 底部导航栏 -->
      <div
        class="h-16 border-t border-yl-line-200/50 bg-yl-paper-100/50 px-8 flex items-center justify-between"
      >
        <AppActionButton
          v-if="currentStepIndex > 0"
          variant="outline"
          @click="prevStep"
        >
          ← 上一步
        </AppActionButton>
        <div v-else />

        <div class="flex items-center gap-3">
          <AppActionButton
            v-if="currentStepIndex < steps.length - 1"
            variant="primary"
            @click="nextStep"
          >
            下一步 →
          </AppActionButton>

          <AppActionButton v-else variant="primary" @click="completeOnboarding">
            ✓ 完成设置
          </AppActionButton>
        </div>
      </div>
    </div>
  </div>
</template>
