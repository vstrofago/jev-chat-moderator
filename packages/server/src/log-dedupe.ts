/**
 * Wraps a logger so a line repeated within a window prints once, followed by a single
 * "repeated N more times" summary. A busy provider otherwise floods the terminal.
 */
export function createLogDedupe(write: (line: string) => void, windowMs = 30_000) {
  const repeats = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    timer = undefined;
    for (const [line, n] of repeats) {
      if (n > 0) write(`${line} (repeated ${n} more times in ${windowMs / 1000} s)`);
    }
    repeats.clear();
  }

  const log = (line: string) => {
    const n = repeats.get(line);
    if (n === undefined) {
      repeats.set(line, 0);
      write(line);
    } else repeats.set(line, n + 1);
    timer ??= setTimeout(flush, windowMs);
  };
  log.close = () => clearTimeout(timer);
  return log;
}
