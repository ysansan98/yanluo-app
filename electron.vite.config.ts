import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'electron-vite'

export default defineConfig(({ command }) => {
  return {
    main: {},
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
        },
      },
      plugins: [
        vue(),
        tailwindcss(),
        ...(command === 'build'
          ? []
          : [codeInspectorPlugin({ bundler: 'vite' })]),
      ],
    },
  }
})
