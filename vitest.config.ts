import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
        'dist/',
        'public/',
        '*.config.*'
      ]
    }
  },
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
