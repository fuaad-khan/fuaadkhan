import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep GSAP in its own chunk so the hero renders before the animation runtime arrives
    rollupOptions: {
      output: {
        manualChunks: { gsap: ['gsap', 'gsap/ScrollTrigger'] },
      },
    },
  },
})
