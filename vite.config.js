import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3017',
      '/ws': { target: 'ws://localhost:3017', ws: true },
    },
  },
  plugins: [react()],
})
