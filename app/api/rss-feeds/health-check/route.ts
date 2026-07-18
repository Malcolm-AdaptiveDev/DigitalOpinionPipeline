import { NextRequest, NextResponse } from "next/server";
import { runFeedHealthChecks, checkFeedHealth } from "@/lib/pipeline/rss-feeds";
import { getRssFeed } from "@/lib/pipeline/db";
import { isMockMode, runMockHealthCheck } from "@/lib/mock-data";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const b = (body ?? {}) as Record<string, unknown>;
  const mockMode = isMockMode(Boolean(b.mockMode));
  const feedId = b.feedId ? String(b.feedId) : undefined;

  if (mockMode) {
    const results = runMockHealthCheck(feedId);
    return NextResponse.json({ results, mockMode: true });
  }

  try {
    if (feedId) {
      // Single-feed health check (no DB write, just a probe)
      const feed = await getRssFeed(feedId);
      if (!feed)
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      const result = await checkFeedHealth(feed);
      return NextResponse.json({ results: [result], mockMode: false });
    }

    // Full health check run for all feeds
    const summary = await runFeedHealthChecks();
    return NextResponse.json({ ...summary, mockMode: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
