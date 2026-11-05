import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const bundleWorkspace = { exclude: ['@mjolnir/core', '@mjolnir/plugin-sdk'] }
const monacoVs = path.resolve(path.dirname(createRequire(import.meta.url).resolve('monaco-editor/editor/editor.api.js')), '..')

export default defineConfig({
  main: {
    build: { externalizeDeps: bundleWorkspace },
  },
  preload: {
    build: { externalizeDeps: bundleWorkspace },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: { minify: true },
    resolve: {
      alias: {
        'monaco-editor-codicons.css': path.join(monacoVs, 'base/browser/ui/codicons/codicon/codicon.css'),
      },
    },
  },
})
