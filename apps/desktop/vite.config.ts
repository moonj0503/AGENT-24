import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: desktopRoot,
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [desktopRoot, workspaceRoot],
      // Vite's Windows path check rejects this workspace's `KU(2026~)` path
      // even when it is explicitly allowed. The dev server is loopback-only.
      strict: false,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
