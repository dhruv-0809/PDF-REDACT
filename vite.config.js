import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/PDF-REDACT/',
  plugins: [react()],
  optimizeDeps: {
    // Exclude transformers to prevent Vite from strictly bundling its dynamic WASM imports
    exclude: ['@huggingface/transformers', 'onnxruntime-web']
  }
})
