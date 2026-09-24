import { defineConfig } from "astro/config";

// SITE / BASE_PATH are set by the GitHub Pages workflow; defaults work locally.
export default defineConfig({
  site: process.env.SITE,
  base: process.env.BASE_PATH ?? "/",
  vite: {
    server: {
      // The TypeSafe API sends no CORS headers, so in dev we proxy it through Vite.
      proxy: {
        "/typesafe-api": {
          target: "https://api.typesafe.ai",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/typesafe-api/, ""),
        },
      },
    },
  },
});
