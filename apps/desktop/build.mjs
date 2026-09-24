// Bundles the main process (ESM) and the preload (CommonJS, as sandboxed preloads require).
import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", sourcemap: "linked", logLevel: "info" };

await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  format: "esm",
  // electron-updater ships in node_modules; ws's native helpers are optional.
  external: ["electron", "electron-updater", "bufferutil", "utf-8-validate"],
  // Bundled CommonJS dependencies (ws, yaml) still call require().
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});

await build({
  ...common,
  entryPoints: ["src/preload.cts"],
  outfile: "dist/preload.cjs",
  format: "cjs",
  external: ["electron"],
});
