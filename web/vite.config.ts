/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,              // set to true to auto-open the report
      gzipSize: true,
      brotliSize: true,
      emitFile: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }
          // NOTE: @phosphor-icons is intentionally NOT in a manual chunk.
          // The app uses ~200 icons across 89 files but only a handful on the
          // landing page (entry chunk). Forcing them all into one manual chunk
          // put 443KB raw / ~96KB gzip on every page's critical path via
          // modulepreload. Letting Rollup tree-shake + co-locate means the
          // landing page only downloads the icons it renders; the rest load
          // with the lazy pages that use them.
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query'
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts'
          }
          if (id.includes('node_modules/d3-')) {
            return 'vendor-d3'
          }
          // NOTE: @babylonjs/core is intentionally NOT split into per-subfolder
          // chunks — its modules have heavy internal circular imports, and
          // splitting them across chunks throws TDZ ReferenceErrors at runtime
          // ("Cannot access 'X' before initialization"). Rollup's automatic
          // co-location keeps the circular graph in one chunk.
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    css: true,
    testTimeout: 15000,
  },
})
