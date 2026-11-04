import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const bundleWorkspace = { exclude: ['@mjolnir/core'] }

export default defineConfig({
  main: {
    build: { externalizeDeps: bundleWorkspace },
  },
  preload: {
    build: { externalizeDeps: bundleWorkspace },
  },
  renderer: {
    plugins: [react()],
  },
})
