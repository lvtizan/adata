import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // 禁用代理，避免系统代理劫持
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
          return proxy;
        }
      }
    },
    // 忽略系统代理
    allowedHosts: ['all'],
    strictPort: true,
    hmr: true,
  },
});
