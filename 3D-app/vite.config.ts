import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 端口固定 5183，避免与主应用(Tauri 1420)/sensor-app 及默认 5173 冲突
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: true,
  },
  preview: {
    port: 5184,
    strictPort: true,
  },
});
