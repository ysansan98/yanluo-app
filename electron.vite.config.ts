import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const sharedAlias = {
  '~shared': resolve('src/shared'),
}

export default defineConfig(({ command }) => {
  return {
    main: {
      resolve: { alias: sharedAlias },
      plugins: [externalizeDepsPlugin()],
    },
    preload: {
      resolve: { alias: sharedAlias },
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          ...sharedAlias,
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
