/** A FIFO promise queue that runs at most `concurrency` tasks at a time. */
export function createQueue(concurrency: number) {
  const waiting: Array<() => void> = [];
  let active = 0;

  function next() {
    if (active >= concurrency) return;
    const start = waiting.shift();
    if (start) start();
  }

  return {
    push<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          active++;
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    },
    /** Tasks queued but not started yet. */
    pending: () => waiting.length,
  };
}
