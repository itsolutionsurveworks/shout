import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Cargo writes build artifacts under src-tauri/target; watching them causes EBUSY crashes.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
