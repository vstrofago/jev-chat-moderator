import { describe, expect, it } from "vitest";
import { AuthError, detectProvider, GatewayError, RateLimitError } from "../src/core/jev-client";
import { moderate } from "../src/core/moderate";

type Call = { url: string; init: RequestInit; body: any };

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const gatewayBody = {
  model: "typesafe-ai/jev",
  answers: {
    offensive: { type: "boolean", probability: 0.96 },
    category: {
      type: "choice",
      choice: "insult",
      probabilities: { ok: 0.01, insult: 0.97, hate: 0.01, spam: 0, threat: 0.01 },
      confidence: 0.95,
    },
  },
  usage: { inputTokens: 346, outputTokens: 58 },
};

const typesafeBody = {
  model: "jev-1.13.0",
  answers: {
    offensive: { type: "noul", noul: 0.12 },
    category: {
      type: "choice",
      choice: "ok",
      probabilities: { ok: 0.9, insult: 0.05, hate: 0, spam: 0.05, threat: 0 },
      confidence: 0.88,
    },
  },
  usage: { input_tokens: 300, output_tokens: 20 },
};

describe("moderate via gateway", () => {
  it("maps a gateway answer to a ModerationResult", async () => {
    const f = fakeFetch(200, gatewayBody);
    const r = await moderate("you are trash", { apiKey: "vck_x", provider: "gateway", fetch: f.fn });
    expect(r.offensive).toBe(0.96);
    expect(r.category).toBe("insult");
    expect(r.categoryProbabilities.insult).toBe(0.97);
    expect(r.confidence).toBe(0.95);
    expect(r.inputTokens).toBe(346);
    expect(r.model).toBe("typesafe-ai/jev");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.raw).toEqual(gatewayBody);
  });

  it("sends the gateway wire format", async () => {
    const f = fakeFetch(200, gatewayBody);
    await moderate("hola", { apiKey: "vck_x", provider: "gateway", fetch: f.fn });
    const { url, init, body } = f.calls[0];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer vck_x");
    expect(body.model).toBe("typesafe-ai/jev");
    expect(body.state).toEqual({ message: "hola" });
    expect(body.questions.offensive.type).toBe("boolean");
    expect(body.questions.category.type).toBe("choice");
  });
});

describe("moderate via TypeSafe", () => {
  it("sends noul questions and jev-latest to the configured base URL", async () => {
    const f = fakeFetch(200, typesafeBody);
    await moderate("hola", {
      apiKey: "ts_x",
      provider: "typesafe",
      typesafeBaseUrl: "/typesafe-api",
      fetch: f.fn,
    });
    const { url, body } = f.calls[0];
    expect(url).toBe("/typesafe-api/v1/systemone");
    expect(body.model).toBe("jev-latest");
    expect(body.questions.offensive.type).toBe("noul");
    expect(body.questions.category.type).toBe("choice");
  });

  it("maps a TypeSafe answer to a ModerationResult", async () => {
    const f = fakeFetch(200, typesafeBody);
    const r = await moderate("hola", { apiKey: "ts_x", provider: "typesafe", fetch: f.fn });
    expect(f.calls[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(r.offensive).toBe(0.12);
    expect(r.category).toBe("ok");
    expect(r.inputTokens).toBe(300);
    expect(r.model).toBe("jev-1.13.0");
  });
});

describe("errors", () => {
  const opts = (fn: typeof fetch) => ({ apiKey: "vck_x", provider: "gateway" as const, fetch: fn });

  it("throws AuthError with the provider message on 403", async () => {
    const f = fakeFetch(403, { error: { message: "requires a valid credit card" } });
    const err = await moderate("x", opts(f.fn)).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("credit card");
  });

  it("throws AuthError with the TypeSafe detail message on 401", async () => {
    const f = fakeFetch(401, { detail: { message: "Must supply an API key!" } });
    const err = await moderate("x", opts(f.fn)).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain("Must supply an API key");
  });

  it("throws RateLimitError honouring retry-after seconds on 429", async () => {
    const f = fakeFetch(429, { error: { message: "slow down" } }, { "retry-after": "3" });
    const err = await moderate("x", opts(f.fn)).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterMs).toBe(3000);
  });

  it("defaults RateLimitError to 2 s without retry-after", async () => {
    const f = fakeFetch(429, "{}");
    const err = await moderate("x", opts(f.fn)).catch((e) => e);
    expect(err.retryAfterMs).toBe(2000);
  });

  it("throws GatewayError on 5xx", async () => {
    const f = fakeFetch(502, "bad gateway");
    await expect(moderate("x", opts(f.fn))).rejects.toBeInstanceOf(GatewayError);
  });

  it("throws GatewayError when fetch itself fails", async () => {
    const fn = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(moderate("x", opts(fn))).rejects.toBeInstanceOf(GatewayError);
  });

  it("throws GatewayError when an answer is missing", async () => {
    const f = fakeFetch(200, { model: "m", answers: { category: gatewayBody.answers.category } });
    await expect(moderate("x", opts(f.fn))).rejects.toBeInstanceOf(GatewayError);
  });

  it("throws GatewayError on an unknown category", async () => {
    const body = structuredClone(gatewayBody);
    body.answers.category.choice = "banana";
    const f = fakeFetch(200, body);
    await expect(moderate("x", opts(f.fn))).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("detectProvider", () => {
  it("detects gateway keys by their vck_ prefix", () => {
    expect(detectProvider("vck_abc")).toBe("gateway");
    expect(detectProvider("  vck_abc ")).toBe("gateway");
  });

  it("treats any other key as a TypeSafe key", () => {
    expect(detectProvider("ts-123")).toBe("typesafe");
  });
});
