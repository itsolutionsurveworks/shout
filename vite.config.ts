import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Shown in the view footers: app version, and when this build was made.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Cargo writes build artifacts under src-tauri/target; watching them causes EBUSY crashes.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
