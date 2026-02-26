import { createApp } from 'vue'
import App from './App.vue'
import { loadIcons } from './utils/icons'
import { initRendererMicCapture } from './voice/rendererMicCapture'
import VoiceHudWindow from './VoiceHudWindow.vue'
import './assets/main.css'

// Load offline icons
loadIcons()

initRendererMicCapture()
const isVoiceHudRoute = window.location.hash.startsWith('#/voice-hud')
createApp(isVoiceHudRoute ? VoiceHudWindow : App).mount('#app')
