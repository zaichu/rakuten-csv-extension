import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import packageJson from './package.json'

// package.jsonのバージョンをmanifest.jsonに反映
const manifestWithVersion = {
  ...manifest,
  version: packageJson.version
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifestWithVersion })
  ],
  define: {
    // package.jsonのバージョンをグローバル変数として注入
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  build: {
    outDir: 'dist',
    minify: false, // デバッグ用に一時的に無効化
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    hmr: {
      port: 5174
    }
  }
})
