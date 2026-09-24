import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The commented starter vigia.yaml, written for new users. */
export function exampleConfigText(): string {
  return readFileSync(new URL("../../engine/examples/vigia.yaml", import.meta.url), "utf8");
}

/** The built web UI (overlay, and in M4 the dashboard). VIGIA_UI_DIR overrides it. */
export function defaultUiDir(): string {
  return process.env.VIGIA_UI_DIR ?? fileURLToPath(new URL("../../ui/dist", import.meta.url));
}
