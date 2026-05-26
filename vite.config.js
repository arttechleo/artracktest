import { defineConfig } from 'vite'
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: './index.html' },
      external: ['three', 'mind-ar']
    }
  }
})
