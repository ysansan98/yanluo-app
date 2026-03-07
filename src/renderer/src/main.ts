import { createApp } from 'vue'
import App from './App.vue'
import { loadIcons } from './utils/icons'
import { createRendererLogger } from './utils/logger'
import { initRendererMicCapture } from './voice/rendererMicCapture'
import VoiceHudWindow from './VoiceHudWindow.vue'
import VoiceWorkerWindow from './VoiceWorkerWindow.vue'
import './assets/main.css'

const log = createRendererLogger('app')

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

window.addEventListener('error', (event) => {
  log.error('window error captured', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  log.error('window unhandled rejection captured', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
  })
})

createApp(RootComponent).mount('#app')
log.info('renderer app mounted', {
  route: hash,
  isVoiceHudRoute,
  isVoiceWorkerRoute,
})
