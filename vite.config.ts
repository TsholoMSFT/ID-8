import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname
const apiProxyTarget = process.env.ID8_API_PROXY_TARGET || process.env.KARABO_API_PROXY_TARGET || 'http://127.0.0.1:7071'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      // Proxy /api requests to Azure Functions running on port 7071.
      // Use 127.0.0.1 (not localhost) so Node doesn't resolve to ::1 while the
      // Functions host only listens on IPv4 (0.0.0.0:7071).
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  }
});
