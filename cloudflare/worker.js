// Mindful Space API foundation.
// Data endpoints remain closed until authentication, deployment secrets and privacy controls are configured.
const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, database: "not_configured" }, 503);
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: true, database: "connected", api: "mindful-space" });
      } catch {
        return json({ ok: false, database: "unavailable" }, 503);
      }
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...baseHeaders,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API endpoint is not enabled yet.", code: "AUTHENTICATION_SETUP_REQUIRED" }, 503);
    }
    return json({ error: "Not found" }, 404);
  }
};
