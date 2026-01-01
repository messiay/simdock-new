import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Include WASM files as assets
  assetsInclude: ['**/*.wasm'],
  // Exclude vina modules from dependency optimization
  optimizeDeps: {
    exclude: ['src/wasm/vina/vina.esm.js']
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (WASM threading)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
