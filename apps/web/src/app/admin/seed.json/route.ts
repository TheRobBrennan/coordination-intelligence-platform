import { NextResponse } from "next/server";

// Proxies the API's raw seed file server-side instead of linking the browser
// straight at the API. The API has no public hostname of its own (see
// infra/docker-compose.tunnel.yml) — only web/auth/neo4j are routed through
// the Cloudflare Tunnel — so a direct browser link to
// NEXT_PUBLIC_API_BASE_URL works on localhost but 404s/fails for a visitor
// on the public tunnel URL, since that env var still points at
// http://localhost:8000 (the visitor's own machine, not the tunnel). Same-
// origin route handler sidesteps the problem entirely: it always runs
// server-side, so it always reaches the API over the Docker network via
// API_INTERNAL_BASE_URL, regardless of which origin the visitor is on.
const API_BASE =
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${API_BASE}/admin/seed.json`, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch seed data from the API" },
      { status: res.status },
    );
  }
  const body = await res.text();
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
