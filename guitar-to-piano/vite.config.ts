import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/GP_to_Piano/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@coderline/alphatab'],
  },
})
