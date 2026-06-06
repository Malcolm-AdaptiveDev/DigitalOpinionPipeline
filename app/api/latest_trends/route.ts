import { NextRequest, NextResponse } from "next/server";
import { approveLatestTrends, getLatestTrends } from "@/lib/latest-trends";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mockMode = url.searchParams.get("mock") === "1";
  const limit = Number(url.searchParams.get("limit") ?? 12);

  try {
    const result = await getLatestTrends({ mockMode, limit });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mock?: boolean;
      ids?: string[];
    };
    const url = new URL(req.url);
    const mockMode = body.mock === true || url.searchParams.get("mock") === "1";
    const approved = await approveLatestTrends({
      mockMode,
      ids: body.ids,
    });

    return NextResponse.json({
      ok: true,
      approved_count: approved.length,
      approved,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
