/** Lets at most `perSecond` calls through in each wall-clock second and counts the rest. */
export function createRateGate(perSecond: number, now: () => number = Date.now) {
  let second = -1;
  let used = 0;
  let skipped = 0;
  return {
    allow(): boolean {
      const s = Math.floor(now() / 1000);
      if (s !== second) {
        second = s;
        used = 0;
      }
      if (used < perSecond) {
        used++;
        return true;
      }
      skipped++;
      return false;
    },
    skipped: () => skipped,
  };
}
