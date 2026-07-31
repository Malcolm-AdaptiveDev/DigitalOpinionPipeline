import { NextRequest, NextResponse } from "next/server";
import { listRssFeeds, insertRssFeed } from "@/lib/pipeline/db";
import { isMockMode, getMockFeeds, addMockFeed } from "@/lib/mock-data";
import type { TrendSource } from "@/lib/pipeline/types";

const VALID_SOURCES: TrendSource[] = [
  "rss_news",
  "hackernews",
  "reddit",
  "x_trending",
  "google_trends",
];

function validateFeedBody(body: Record<string, unknown>): {
  url: string;
  name: string;
  source: TrendSource;
  tags: string[];
  notes?: string;
  is_active?: boolean;
} {
  if (!body.url || typeof body.url !== "string") {
    throw new Error("url is required and must be a string");
  }
  try {
    new URL(body.url as string);
  } catch {
    throw new Error("url must be a valid URL");
  }
  if (
    !body.name ||
    typeof body.name !== "string" ||
    !(body.name as string).trim()
  ) {
    throw new Error("name is required");
  }
  if (!body.source || !VALID_SOURCES.includes(body.source as TrendSource)) {
    throw new Error(`source must be one of: ${VALID_SOURCES.join(", ")}`);
  }
  const tags = Array.isArray(body.tags)
    ? (body.tags as string[]).map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    url: (body.url as string).trim(),
    name: (body.name as string).trim(),
    source: body.source as TrendSource,
    tags,
    notes: body.notes ? String(body.notes) : undefined,
    is_active: body.is_active !== false,
  };
}

export async function GET(req: NextRequest) {
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";
  const mockMode = isMockMode(req.nextUrl.searchParams.get("mock") === "1");

  if (mockMode) {
    return NextResponse.json({
      feeds: getMockFeeds(activeOnly),
      mockMode: true,
    });
  }

  try {
    const feeds = await listRssFeeds(activeOnly);
    return NextResponse.json({ feeds, mockMode: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validated = validateFeedBody(body as Record<string, unknown>);
    const mockMode = isMockMode(
      Boolean((body as Record<string, unknown>).mockMode),
    );

    if (mockMode) {
      const feed = addMockFeed(validated);
      return NextResponse.json({ feed, mockMode: true }, { status: 201 });
    }

    const feed = await insertRssFeed(validated);
    return NextResponse.json({ feed, mockMode: false }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    const status =
      msg.includes("required") || msg.includes("must be") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
