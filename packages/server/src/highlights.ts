import type { HighlightItem } from "@vigia/engine";

export interface HighlightQueueOptions {
  seconds: number;
  /** Waiting highlights kept at most; the oldest is dropped beyond this. */
  max?: number;
  onShow(item: HighlightItem): void;
  onClear(): void;
}

/**
 * The overlay shows one highlight at a time. Lives in the host (not in each overlay) so every
 * connected overlay and dashboard sees the same card.
 */
export function createHighlightQueue(o: HighlightQueueOptions) {
  const max = o.max ?? 20;
  let seconds = o.seconds;
  let current: HighlightItem | null = null;
  const waiting: HighlightItem[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(item: HighlightItem) {
    current = item;
    o.onShow(item);
    startTurn();
  }

  function startTurn() {
    clearTimeout(timer);
    timer = setTimeout(endTurn, seconds * 1000);
  }

  function endTurn() {
    timer = undefined;
    const next = waiting.shift();
    if (next) return show(next);
    if (current) {
      current = null;
      o.onClear();
    }
  }

  return {
    push(item: HighlightItem) {
      if (!current && !timer) return show(item);
      waiting.push(item);
      if (waiting.length > max) waiting.shift();
    },
    /** Shows `item` immediately (a mod's "show now"); the queue continues after it. */
    showNow(item: HighlightItem) {
      show(item);
    },
    /** Hides the current card; the next one waits a full turn. */
    clear() {
      if (current) {
        current = null;
        o.onClear();
      }
      startTurn();
    },
    setSeconds(s: number) {
      seconds = s;
    },
    current: () => current,
    waiting: () => [...waiting],
    close() {
      clearTimeout(timer);
    },
  };
}

export type HighlightQueue = ReturnType<typeof createHighlightQueue>;
