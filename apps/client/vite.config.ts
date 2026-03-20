import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, clientRoot, "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || "http://127.0.0.1:8787";

  return {
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/v1": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
