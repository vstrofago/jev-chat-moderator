import { defineConfig } from "vite";

// Every page is served by the Vigía host, which exposes /assets/* without a key.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { overlay: "overlay.html" } },
  },
});
