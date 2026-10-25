import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const vercelDev = loadEnv(mode, ".", "VERCEL").VERCEL === "1";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Vercel dev owns cross-service routing; only standalone Vite needs a proxy.
      ...(vercelDev ? {} : { proxy: { "/api": "http://127.0.0.1:8000" } }),
    },
    build: { target: "es2022" },
  };
});
