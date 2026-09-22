/**
 * Optional CORS proxy for the TypeSafe API, which sends no CORS headers and so can't be
 * called from a browser. It forwards the visitor's own Authorization header and adds CORS.
 * It holds no key of its own, so it never spends your budget.
 *
 *   cd proxy && npx wrangler deploy
 *   then build the site with PUBLIC_TYPESAFE_PROXY_URL=https://<your-worker>.workers.dev
 */
interface Env {
  /** Origin allowed to call the proxy, e.g. https://you.github.io */
  ALLOWED_ORIGIN: string;
}

const UPSTREAM = "https://api.typesafe.ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Expose-Headers": "Retry-After",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    };
    if (origin !== env.ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/systemone") {
      return new Response("Not found", { status: 404, headers: cors });
    }

    const upstream = await fetch(`${UPSTREAM}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: request.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: request.body,
    });
    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
