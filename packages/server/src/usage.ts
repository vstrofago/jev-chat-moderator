const PRICE_PER_TOKEN = 0.042 / 1_000_000; // Jev: $0.042 per million input tokens, output free
const HOUR = 3600_000;

/** Rolling one-hour counters for the Stats tab. */
export function createUsageMeter(now: () => number = Date.now) {
  const messages: number[] = [];
  const actions: number[] = [];
  const tokens: [number, number][] = [];
  let started = now();

  function trim() {
    const cutoff = now() - HOUR;
    while (messages.length && messages[0] < cutoff) messages.shift();
    while (actions.length && actions[0] < cutoff) actions.shift();
    while (tokens.length && tokens[0][0] < cutoff) tokens.shift();
  }

  return {
    tokens: (n: number) => void tokens.push([now(), n]),
    message: () => void messages.push(now()),
    action: () => void actions.push(now()),
    snapshot() {
      trim();
      const t = now();
      const tokensLastHour = tokens.reduce((sum, [, n]) => sum + n, 0);
      // Until an hour has passed, project the rate from the time actually covered.
      const covered = Math.min(Math.max(t - started, 60_000), HOUR);
      return {
        messagesPerMinute: messages.filter((m) => m >= t - 60_000).length,
        messagesLastHour: messages.length,
        actionsLastHour: actions.length,
        tokensLastHour,
        costPerHour: Math.round(((tokensLastHour * PRICE_PER_TOKEN * HOUR) / covered) * 1000) / 1000,
      };
    },
    reset() {
      started = now();
    },
  };
}

export type UsageMeter = ReturnType<typeof createUsageMeter>;
