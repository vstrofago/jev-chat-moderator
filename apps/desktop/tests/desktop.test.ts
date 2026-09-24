import { describe, expect, it } from "vitest";
import { pickPort } from "../src/ports";

describe("pickPort", () => {
  it("keeps the remembered port when free, else the first free one near 7777", async () => {
    const free = (ports: number[]) => async (p: number) => ports.includes(p);
    expect(await pickPort(7780, free([7777, 7780]))).toBe(7780);
    expect(await pickPort(undefined, free([7779, 7780]))).toBe(7779);
    expect(await pickPort(7780, free([7777]))).toBe(7777);
    await expect(pickPort(undefined, free([]))).rejects.toThrow(/7777/);
  });
});
