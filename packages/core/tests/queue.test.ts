import { describe, expect, it } from "vitest";
import { createQueue } from "../src/index";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createQueue", () => {
  it("never runs more than `concurrency` tasks at once", async () => {
    const q = createQueue(2);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await tick(5);
      running--;
    };
    await Promise.all([1, 2, 3, 4, 5].map(() => q.push(task)));
    expect(peak).toBe(2);
  });

  it("starts tasks in the order they were pushed", async () => {
    const q = createQueue(1);
    const started: number[] = [];
    await Promise.all([1, 2, 3].map((n) => q.push(async () => void started.push(n))));
    expect(started).toEqual([1, 2, 3]);
  });

  it("resolves each push with its task's value and rejects with its error", async () => {
    const q = createQueue(2);
    await expect(q.push(async () => 42)).resolves.toBe(42);
    await expect(q.push(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(q.push(async () => "still works")).resolves.toBe("still works");
  });

  it("reports how many tasks are waiting", async () => {
    const q = createQueue(1);
    const all = [1, 2, 3].map(() => q.push(() => tick(5)));
    expect(q.pending()).toBe(2);
    await Promise.all(all);
    expect(q.pending()).toBe(0);
  });
});
