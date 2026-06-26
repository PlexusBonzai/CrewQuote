import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Restrict to localhost — defence against GHSA-67mh-4wv8-2f99 (esbuild dev server)
    host: '127.0.0.1',
  },
})
