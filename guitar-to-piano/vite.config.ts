import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/claudebot/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@coderline/alphatab'],
  },
})
