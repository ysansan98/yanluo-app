import { createApp } from 'vue'

import App from './App.vue'
import './assets/main.css'
import { initRendererMicCapture } from './voice/rendererMicCapture'

initRendererMicCapture()
createApp(App).mount('#app')
