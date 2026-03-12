import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/items': {
        target: 'http://localhost:8055',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8055',
        changeOrigin: true,
      },
    },
  },
})

