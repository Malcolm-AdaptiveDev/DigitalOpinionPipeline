import {
  approveMockLatestTrends,
  getMockLatestTrends,
  isMockMode,
} from "@/lib/mock-data";
import {
  fetchLatestTrendCandidates,
  ingestTrends,
  rankTrendCandidates,
  RSS_SOURCES,
  scoreAndRoute,
} from "@/lib/ingestion";
import type { ScoredTrendItem } from "@/lib/pipeline/types";

export type LatestTrendSource = {
  url: string;
  source: string;
  tags: string[];
};

export type LatestTrendsResult = {
  trends: ScoredTrendItem[];
  sources: LatestTrendSource[];
  mode: "mock" | "live";
};

export async function getLatestTrends(
  opts: { mockMode?: boolean; limit?: number; relevanceThreshold?: number } = {},
): Promise<LatestTrendsResult> {
  const mockMode = isMockMode(opts.mockMode);
  const limit = opts.limit ?? 12;
  const sources = RSS_SOURCES.map((source) => ({ ...source }));

  if (mockMode) {
    return { trends: getMockLatestTrends(limit), sources, mode: "mock" };
  }

  const candidates = await fetchLatestTrendCandidates();
  const trends = await rankTrendCandidates(
    candidates,
    opts.relevanceThreshold ?? 0.35,
  );

  return { trends: trends.slice(0, limit), sources, mode: "live" };
}

export async function approveLatestTrends(
  opts: { mockMode?: boolean; ids?: string[]; relevanceThreshold?: number } = {},
): Promise<ScoredTrendItem[]> {
  const mockMode = isMockMode(opts.mockMode);
  if (mockMode) return approveMockLatestTrends(opts.ids);

  const raw = await ingestTrends();
  const scored = await scoreAndRoute(raw, opts.relevanceThreshold ?? 0.35);
  if (!opts.ids?.length) return scored;

  const selected = new Set(opts.ids);
  return scored.filter((item) => selected.has(item.id));
}
