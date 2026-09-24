import { createServer } from "node:net";

const FIRST = 7777;
const LAST = 7787;

/**
 * The OBS overlay address contains the port, so it must stay the same between runs: keep
 * the remembered port while it is free, otherwise take the first free one from 7777.
 */
export async function pickPort(remembered: number | undefined, isFree: (port: number) => Promise<boolean> = portIsFree) {
  if (remembered && (await isFree(remembered))) return remembered;
  for (let p = FIRST; p <= LAST; p++) if (await isFree(p)) return p;
  throw new Error(`Ports ${FIRST}-${LAST} are all busy. Close the program using them and start Vigía again.`);
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
