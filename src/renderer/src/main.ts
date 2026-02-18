import { createApp } from 'vue'
import App from './App.vue'
import { initRendererMicCapture } from './voice/rendererMicCapture'
import VoiceHudWindow from './VoiceHudWindow.vue'
import './assets/main.css'

initRendererMicCapture()
const isVoiceHudRoute = window.location.hash.startsWith('#/voice-hud')
createApp(isVoiceHudRoute ? VoiceHudWindow : App).mount('#app')
