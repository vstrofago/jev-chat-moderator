import { defineConfig } from "vite";

// Every page is served by the Vigía host, which exposes /assets/* without a key.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { overlay: "overlay.html", index: "index.html", login: "login.html", setup: "setup.html" } },
  },
});
