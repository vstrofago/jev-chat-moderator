import type { Question } from "./questions";

export type Provider = "gateway" | "typesafe";

export interface ClientOptions {
  apiKey: string;
  provider: Provider;
  /** Base URL for the TypeSafe API. Browsers need a CORS proxy here; see proxy/worker.ts. */
  typesafeBaseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export type Answer =
  | { type: "boolean"; probability: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number };

export interface Evaluation {
  answers: Record<string, Answer>;
  inputTokens?: number;
  model?: string;
  raw: unknown;
}

export class JevError extends Error {
  override name = "JevError";
}
/** 401/403: bad key, or an account that cannot be served (e.g. no card on the Vercel team). */
export class AuthError extends JevError {
  override name = "AuthError";
}
export class RateLimitError extends JevError {
  override name = "RateLimitError";
  constructor(
    message: string,
    public retryAfterMs: number,
  ) {
    super(message);
  }
}
/** Network failures, 5xx and malformed responses. */
export class GatewayError extends JevError {
  override name = "GatewayError";
}

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/evaluate";
const GATEWAY_MODEL = "typesafe-ai/jev";
const TYPESAFE_BASE_URL = "https://api.typesafe.ai";
const TYPESAFE_MODEL = "jev-latest";

export function detectProvider(key: string): Provider {
  return key.trim().startsWith("vck_") ? "gateway" : "typesafe";
}

function toWire(questions: Record<string, Question>, provider: Provider) {
  if (provider === "gateway") return questions;
  // TypeSafe's native API calls the yes/no question type "noul".
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [id, q.type === "boolean" ? { ...q, type: "noul" } : q]),
  );
}

function errorMessage(body: unknown, status: number): string {
  const b = body as { error?: { message?: string }; detail?: { message?: string } | string } | undefined;
  const detail = typeof b?.detail === "string" ? b.detail : b?.detail?.message;
  return b?.error?.message ?? detail ?? `HTTP ${status}`;
}

function parseAnswer(id: string, a: any): Answer {
  if (a?.type === "boolean" && typeof a.probability === "number") return { type: "boolean", probability: a.probability };
  if (a?.type === "noul" && typeof a.noul === "number") return { type: "boolean", probability: a.noul };
  if (a?.type === "choice" && typeof a.choice === "string" && a.probabilities && typeof a.probabilities === "object") {
    return { type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
  }
  throw new GatewayError(`Malformed answer for "${id}"`);
}

export async function evaluate(
  state: unknown,
  questions: Record<string, Question>,
  o: ClientOptions,
): Promise<Evaluation> {
  const doFetch = o.fetch ?? globalThis.fetch;
  const url =
    o.provider === "gateway" ? GATEWAY_URL : `${(o.typesafeBaseUrl ?? TYPESAFE_BASE_URL).replace(/\/$/, "")}/v1/systemone`;
  const model = o.provider === "gateway" ? GATEWAY_MODEL : TYPESAFE_MODEL;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state, questions: toWire(questions, o.provider) }),
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new GatewayError(`Network error: ${(e as Error)?.message ?? e}`);
  }

  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (res.status === 401 || res.status === 403) throw new AuthError(errorMessage(body, res.status));
  if (res.status === 429) {
    const seconds = Number(res.headers.get("retry-after"));
    throw new RateLimitError(errorMessage(body, 429), Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000);
  }
  if (!res.ok) throw new GatewayError(errorMessage(body, res.status));
  if (!body?.answers || typeof body.answers !== "object") throw new GatewayError("Response has no answers");

  const answers: Record<string, Answer> = {};
  for (const id of Object.keys(questions)) {
    if (!(id in body.answers)) throw new GatewayError(`Missing answer for "${id}"`);
    answers[id] = parseAnswer(id, body.answers[id]);
  }
  return {
    answers,
    inputTokens: body.usage?.inputTokens ?? body.usage?.input_tokens,
    model: body.model,
    raw: body,
  };
}
