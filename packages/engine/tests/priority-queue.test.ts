import { describe, expect, it } from "vitest";
import { createPriorityQueue, DroppedError } from "../src/priority-queue";

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

/** A task that stays running until released, recording when it started. */
function gate(started: string[], name: string) {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return {
    task: async () => {
      started.push(name);
      await done;
      return name;
    },
    release: () => release(),
  };
}

describe("createPriorityQueue", () => {
  it("never runs more than `concurrency` tasks at once", async () => {
    const q = createPriorityQueue({ concurrency: 2, maxPending: 100 });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await tick(3);
      running--;
    };
    await Promise.all([1, 2, 3, 4, 5].map((i) => q.push(task, i % 2 ? "high" : "low")));
    expect(peak).toBe(2);
  });

  it("starts high tasks before low ones that were queued earlier", async () => {
    const q = createPriorityQueue({ concurrency: 1, maxPending: 100 });
    const started: string[] = [];
    const first = gate(started, "busy");
    const p = [q.push(first.task, "low"), q.push(async () => started.push("low"), "low"), q.push(async () => started.push("high"), "high")];
    first.release();
    await Promise.all(p);
    expect(started).toEqual(["busy", "high", "low"]);
  });

  it("drops the oldest low task when too many are waiting", async () => {
    const q = createPriorityQueue({ concurrency: 1, maxPending: 2 });
    const started: string[] = [];
    const busy = gate(started, "busy");
    const running = q.push(busy.task, "high");
    const low1 = q.push(async () => "low1", "low");
    const low2 = q.push(async () => "low2", "low");
    const high = q.push(async () => "high", "high");
    await expect(low1).rejects.toBeInstanceOf(DroppedError);
    expect(q.pending()).toBe(2);
    busy.release();
    await expect(Promise.all([running, low2, high])).resolves.toEqual(["busy", "low2", "high"]);
  });

  it("never drops high tasks", async () => {
    const q = createPriorityQueue({ concurrency: 1, maxPending: 1 });
    const started: string[] = [];
    const busy = gate(started, "busy");
    const all = [q.push(busy.task, "high"), q.push(async () => "h1", "high"), q.push(async () => "h2", "high")];
    expect(q.pending()).toBe(2);
    busy.release();
    await expect(Promise.all(all)).resolves.toEqual(["busy", "h1", "h2"]);
  });

  it("keeps going after a task fails", async () => {
    const q = createPriorityQueue({ concurrency: 1, maxPending: 10 });
    await expect(q.push(async () => Promise.reject(new Error("boom")), "high")).rejects.toThrow("boom");
    await expect(q.push(async () => "ok", "low")).resolves.toBe("ok");
  });
});
