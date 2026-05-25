import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  optimizeDeps: {
    include: ['three']
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: './index.html' },
      external: []
    }
  }
})
