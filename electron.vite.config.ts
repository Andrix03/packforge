import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  // Sandboxed preload scripts cannot be ES modules, so force CommonJS output.
  preload: {
    build: { rolldownOptions: { output: { format: 'cjs' } } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()]
  }
})
