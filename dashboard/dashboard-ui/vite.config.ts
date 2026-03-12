import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    // Strip tunnel basic-auth from incoming requests before they reach the proxy.
    // This prevents the tunnel's credentials from leaking to Directus/API server.
    {
      name: 'strip-tunnel-auth',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/items') || req.url?.startsWith('/auth') || req.url?.startsWith('/api')) {
            delete req.headers['authorization'];
          }
          next();
        });
      },
    },
    react(),
  ],
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

