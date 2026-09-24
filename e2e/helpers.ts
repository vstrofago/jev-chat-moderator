import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

export interface Running {
  output(): string;
  /** Resolves with the first match of `pattern` in the output (stdout and stderr). */
  waitFor(pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  stop(): Promise<void>;
}

/** Runs a TypeScript entry point of the repository with tsx and follows what it prints. */
export function run(script: string, args: string[], env: Record<string, string> = {}): Running {
  const child: ChildProcess = spawn(TSX, [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env, NODE_NO_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  const listeners = new Set<() => void>();
  const onData = (b: Buffer) => {
    out += b.toString();
    listeners.forEach((l) => l());
  };
  child.stdout!.on("data", onData);
  child.stderr!.on("data", onData);

  return {
    output: () => out,
    waitFor(pattern, timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const m = out.match(pattern);
          if (m) {
            listeners.delete(check);
            clearTimeout(timer);
            resolve(m);
          }
        };
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`Timed out waiting for ${pattern}. Output so far:\n${out}`));
        }, timeoutMs);
        listeners.add(check);
        check();
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      });
    },
  };
}

export const tempDir = (name: string) => mkdtemp(join(tmpdir(), `vigia-e2e-${name}-`));

/** A free port for each server, so the specs can run side by side. */
let nextPort = 7850 + (process.pid % 50) * 4;
export const port = () => nextPort++;
