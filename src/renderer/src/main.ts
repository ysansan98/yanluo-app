import { createApp } from 'vue'
import App from './App.vue'
import { loadIcons } from './utils/icons'
import { initRendererMicCapture } from './voice/rendererMicCapture'
import VoiceHudWindow from './VoiceHudWindow.vue'
import VoiceWorkerWindow from './VoiceWorkerWindow.vue'
import './assets/main.css'

// Load offline icons
loadIcons()

const hash = window.location.hash
const isVoiceHudRoute = hash.startsWith('#/voice-hud')
const isVoiceWorkerRoute = hash.startsWith('#/voice-worker')

if (isVoiceWorkerRoute) {
  initRendererMicCapture()
}

if (isVoiceHudRoute) {
  document.documentElement.classList.add('voice-hud-route')
  document.body.classList.add('voice-hud-route')
}

const RootComponent = isVoiceHudRoute
  ? VoiceHudWindow
  : isVoiceWorkerRoute
    ? VoiceWorkerWindow
    : App

createApp(RootComponent).mount('#app')
