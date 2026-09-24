import { describe, expect, it } from "vitest";
import { createUsageMeter } from "../src/usage";

describe("createUsageMeter", () => {
  it("reports the last hour's tokens, messages and actions, and a cost per hour", () => {
    let now = 0;
    const meter = createUsageMeter(() => now);
    meter.tokens(1_000_000);
    meter.message();
    meter.message();
    meter.action();
    now = 30 * 60_000;
    meter.tokens(1_000_000);
    meter.message();
    expect(meter.snapshot()).toEqual({
      messagesPerMinute: 1,
      messagesLastHour: 3,
      actionsLastHour: 1,
      tokensLastHour: 2_000_000,
      costPerHour: 0.168,
    });
    now = 61 * 60_000;
    expect(meter.snapshot()).toMatchObject({ messagesLastHour: 1, tokensLastHour: 1_000_000 });
  });
});
