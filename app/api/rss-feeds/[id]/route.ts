import { NextRequest, NextResponse } from "next/server";
import { getRssFeed, updateRssFeed, deleteRssFeed } from "@/lib/pipeline/db";
import { isMockMode, getMockFeed, updateMockFeed, deleteMockFeed } from "@/lib/mock-data";
import type { TrendSource } from "@/lib/pipeline/types";

const VALID_SOURCES: TrendSource[] = [
  "rss_news",
  "hackernews",
  "reddit",
  "x_trending",
  "google_trends",
];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const mockMode = isMockMode(req.nextUrl.searchParams.get("mock") === "1");
  const { id } = params;

  if (mockMode) {
    const feed = getMockFeed(id);
    if (!feed)
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    return NextResponse.json({ feed, mockMode: true });
  }

  try {
    const feed = await getRssFeed(id);
    if (!feed)
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    return NextResponse.json({ feed, mockMode: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = params;
  const b = body as Record<string, unknown>;
  const mockMode = isMockMode(Boolean(b.mockMode));

  // Build patch — only include fields explicitly sent
  const patch: Record<string, unknown> = {};
  if ("url" in b) {
    if (typeof b.url !== "string")
      return NextResponse.json(
        { error: "url must be a string" },
        { status: 400 },
      );
    try {
      new URL(b.url as string);
    } catch {
      return NextResponse.json(
        { error: "url must be a valid URL" },
        { status: 400 },
      );
    }
    patch.url = (b.url as string).trim();
  }
  if ("name" in b) {
    if (!b.name || typeof b.name !== "string")
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    patch.name = (b.name as string).trim();
  }
  if ("source" in b) {
    if (!VALID_SOURCES.includes(b.source as TrendSource)) {
      return NextResponse.json(
        { error: `source must be one of: ${VALID_SOURCES.join(", ")}` },
        { status: 400 },
      );
    }
    patch.source = b.source;
  }
  if ("tags" in b) {
    patch.tags = Array.isArray(b.tags)
      ? (b.tags as string[]).map((t) => String(t).trim()).filter(Boolean)
      : [];
  }
  if ("is_active" in b) patch.is_active = Boolean(b.is_active);
  if ("notes" in b) patch.notes = b.notes ? String(b.notes) : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  try {
    if (mockMode) {
      const feed = updateMockFeed(id, patch);
      if (!feed)
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      return NextResponse.json({ feed, mockMode: true });
    }

    const feed = await updateRssFeed(
      id,
      patch as Parameters<typeof updateRssFeed>[1],
    );
    return NextResponse.json({ feed, mockMode: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const mockMode = isMockMode(req.nextUrl.searchParams.get("mock") === "1");

  try {
    if (mockMode) {
      const deleted = deleteMockFeed(id);
      if (!deleted)
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      return NextResponse.json({ success: true, mockMode: true });
    }

    await deleteRssFeed(id);
    return NextResponse.json({ success: true, mockMode: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
