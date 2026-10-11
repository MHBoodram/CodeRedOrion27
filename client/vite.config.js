import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
 
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Mirrors the /api rewrite in vercel.json, so the client always calls same-origin "/api/...".
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
 