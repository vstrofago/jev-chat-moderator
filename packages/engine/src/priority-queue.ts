/** The task was discarded because the queue was full. */
export class DroppedError extends Error {
  override name = "DroppedError";
}

type Priority = "high" | "low";

interface Waiting {
  start: () => void;
  drop: () => void;
}

/**
 * A promise queue with two priorities. High tasks (moderation) always start first and are
 * never dropped. When more than `maxPending` tasks wait, the oldest low task (highlights
 * only) is rejected with DroppedError, so a raid cannot make moderation fall behind.
 */
export function createPriorityQueue(o: { concurrency: number; maxPending: number }) {
  const high: Waiting[] = [];
  const low: Waiting[] = [];
  let active = 0;

  function next() {
    if (active >= o.concurrency) return;
    const item = high.shift() ?? low.shift();
    item?.start();
  }

  return {
    push<T>(task: () => Promise<T>, priority: Priority): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        (priority === "high" ? high : low).push({
          start: () => {
            active++;
            task()
              .then(resolve, reject)
              .finally(() => {
                active--;
                next();
              });
          },
          drop: () => reject(new DroppedError("Dropped: too many messages waiting")),
        });
        if (high.length + low.length > o.maxPending) low.shift()?.drop();
        next();
      });
    },
    /** Tasks queued but not started yet. */
    pending: () => high.length + low.length,
  };
}
