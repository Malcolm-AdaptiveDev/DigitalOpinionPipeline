/**
 * app/api/health/route.ts
 * Minimal health check — no imports, no dependencies.
 * Visit /api/health to confirm Next.js API routing is working.
 * If this returns 200 but /api/inngest returns 404, the inngest
 * route is failing to compile due to a dependency issue.
 */

import { NextResponse } from "next/server";
import { getDbOverview } from "@/lib/db-overview";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const overview = await getDbOverview(url.searchParams.get("mock") === "1");

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    db: overview.status,
    counts: overview.counts,
    routes: [
      "/api/health",
      "/api/pipeline-config",
      "/api/review_queue",
      "/api/mock",
      "/api/inngest",
      "/api/webhooks/post-approved",
      "/api/webhooks/engagement-update",
    ],
  });
}
