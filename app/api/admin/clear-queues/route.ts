/**
 * app/api/admin/clear-queues/route.ts
 * Admin endpoint to bulk-mark pending reviews and/or trending queue items as outdated.
 */

import { NextRequest, NextResponse } from "next/server";
import { clearPendingReviews, clearTrendingQueues } from "@/lib/pipeline/db";
import {
  // clearMockPendingReviews,
  // clearMockTrendingQueues,
  isMockMode,
} from "@/lib/mock-data";

type Action = "pending_reviews" | "trending_queues" | "both";

export async function POST(req: NextRequest) {
  let body: { action: Action; mockMode?: boolean };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, mockMode } = body;

  if (
    !action ||
    !["pending_reviews", "trending_queues", "both"].includes(action)
  ) {
    return NextResponse.json(
      {
        error: "action must be one of: pending_reviews, trending_queues, both",
      },
      { status: 400 },
    );
  }

  try {
    if (isMockMode(mockMode)) {
      const result: Record<string, unknown> = { ok: true, mockMode: true };

      if (action === "pending_reviews" || action === "both") {
        //result.reviewsCleared = clearMockPendingReviews();
      }
      if (action === "trending_queues" || action === "both") {
        //result.trendsCleared = clearMockTrendingQueues();
      }

      return NextResponse.json(result);
    }

    const result: Record<string, unknown> = { ok: true };

    if (action === "pending_reviews" || action === "both") {
      result.reviewsCleared = await clearPendingReviews();
    }
    if (action === "trending_queues" || action === "both") {
      const { rawTrends, scoredTrends } = await clearTrendingQueues();
      result.trendsCleared = { rawTrends, scoredTrends };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/admin/clear-queues]", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
