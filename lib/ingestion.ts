/**
 * ingestion.ts
 * Stage 1 — Trend ingestion from multiple sources
 * Stage 2 — Persona relevance scoring and routing
 *
 * Sources: X Trending API, Google Trends RSS, curated news RSS feeds,
 *          Hacker News top stories, Reddit r/technology / r/worldnews
 *
 * Called by the Inngest scheduled function every 15 minutes.
 */

import Parser from "rss-parser";
import { createHash } from "crypto";
import type {
  RawTrendItem,
  ScoredTrendItem,
  PersonaId,
  TrendSource,
  TrendUrgency,
  ContentPillar,
  Platform,
} from "@/lib/pipeline/types";
import {
  getExistingTrendIdentityKeys,
  insertRawTrends,
  insertScoredTrend,
} from "@/lib/pipeline/db";

const rssParser = new Parser({ timeout: 8000 });
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutId),
  ) as Promise<T>;
}

function normalizeTrendIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function trendIdentityKeys(
  item: Pick<RawTrendItem, "source" | "url" | "topic" | "headline">,
): string[] {
  const keys = new Set<string>();
  const source = normalizeTrendIdentity(item.source);
  const url = normalizeTrendIdentity(item.url);
  const topic = normalizeTrendIdentity(item.topic);
  const headline = normalizeTrendIdentity(item.headline);

  if (url) keys.add(`${source}:url:${url}`);
  if (topic) keys.add(`${source}:topic:${topic}`);
  if (headline) keys.add(`${source}:headline:${headline}`);
  if (topic) keys.add(`any:topic:${topic}`);

  return [...keys];
}

function trendStableId(
  item: Pick<RawTrendItem, "source" | "url" | "topic" | "headline">,
): string {
  const topic = normalizeTrendIdentity(item.topic);
  const source = normalizeTrendIdentity(item.source);
  const url = normalizeTrendIdentity(item.url);
  const headline = normalizeTrendIdentity(item.headline);
  const canonical = topic || `${source}|${url}|${headline}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
// ─── Source Configuration ─────────────────────────────────────────────────────

const RSS_SOURCES: Array<{ url: string; source: TrendSource; tags: string[] }> =
  [
    {
      url: "https://techcrunch.com/feed/",
      source: "rss_news",
      tags: ["tech", "startups", "ai", "venture"],
    },
    {
      url: "https://feeds.reuters.com/reuters/technologyNews",
      source: "rss_news",
      tags: ["tech", "business", "global"],
    },
    {
      url: "https://feeds.arstechnica.com/arstechnica/index",
      source: "rss_news",
      tags: ["tech", "science", "policy"],
    },
    {
      url: "https://www.wired.com/feed/rss",
      source: "rss_news",
      tags: ["culture", "tech", "future"],
    },
    {
      url: "https://feeds.bloomberg.com/technology/news.rss",
      source: "rss_news",
      tags: ["finance", "tech", "markets"],
    },
    {
      url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
      source: "rss_news",
      tags: ["tech", "society", "policy"],
    },
    {
      url: "https://hnrss.org/frontpage",
      source: "hackernews",
      tags: ["tech", "programming", "startups", "ai"],
    },
  ];

// ─── Persona Interest Graphs ──────────────────────────────────────────────────
// Keywords that signal high relevance for each persona.
// Score = (keyword_matches / total_keywords) × weight_multipliers

const PERSONA_INTEREST_GRAPH: Record<
  PersonaId,
  {
    high: string[]; // 3× weight
    medium: string[]; // 1.5× weight
    low: string[]; // 0.8× weight (dampens relevance)
  }
> = {
  nova: {
    high: [
      "breakthrough",
      "discovery",
      "innovation",
      "ai",
      "machine learning",
      "clean energy",
      "solar",
      "biotech",
      "longevity",
      "fusion",
      "startup",
      "funding",
      "launch",
      "milestone",
      "progress",
      "record",
    ],
    medium: [
      "climate",
      "health",
      "research",
      "technology",
      "science",
      "economy",
      "growth",
      "investment",
      "future",
      "announced",
    ],
    low: ["scandal", "fraud", "collapse", "lawsuit", "layoffs", "crisis"],
  },
  cynic: {
    high: [
      "fraud",
      "lawsuit",
      "investigation",
      "overstated",
      "misleading",
      "funded by",
      "conflict of interest",
      "layoffs",
      "bankruptcy",
      "bubble",
      "hype",
      "retraction",
      "correction",
      "exposed",
      "scandal",
      "manipulation",
    ],
    medium: [
      "earnings",
      "vc",
      "valuation",
      "regulation",
      "policy",
      "lobbying",
      "market",
      "study",
      "report",
      "analysis",
      "claims",
    ],
    low: ["breakthrough", "revolutionary", "amazing", "unprecedented"],
  },
  oracle: {
    high: [
      "data",
      "study",
      "report",
      "survey",
      "statistics",
      "model",
      "forecast",
      "prediction",
      "analysis",
      "percentage",
      "growth rate",
      "market size",
      "research",
      "findings",
      "metrics",
      "benchmark",
    ],
    medium: [
      "economy",
      "ai",
      "adoption",
      "trend",
      "inflation",
      "employment",
      "productivity",
      "revenue",
      "crypto",
      "index",
    ],
    low: ["opinion", "feel", "believe", "spiritual", "art"],
  },
  rebel: {
    high: [
      "platform",
      "creator",
      "algorithm",
      "ban",
      "censorship",
      "workers",
      "gig economy",
      "strike",
      "protest",
      "inequality",
      "corporate",
      "exploitation",
      "union",
      "surveillance",
      "privacy",
      "monopoly",
    ],
    medium: [
      "culture",
      "music",
      "art",
      "independent",
      "community",
      "gen z",
      "social media",
      "influencer",
      "content",
      "tiktok",
    ],
    low: ["ipo", "valuation", "earnings", "quarterly", "shareholders"],
  },
  sage: {
    high: [
      "meaning",
      "philosophy",
      "wisdom",
      "mental health",
      "anxiety",
      "uncertainty",
      "change",
      "leadership",
      "ethics",
      "values",
      "purpose",
      "burnout",
      "society",
      "human",
      "consciousness",
    ],
    medium: [
      "technology",
      "future",
      "debate",
      "conflict",
      "culture",
      "politics",
      "environment",
      "education",
      "community",
    ],
    low: ["stock", "crypto", "ipo", "quarterly", "earnings"],
  },
};

// Pillar mapping: given a persona and dominant keyword clusters,
// what content pillar should this become?
const PILLAR_MAP: Record<
  PersonaId,
  Array<{ tags: string[]; pillar: ContentPillar; platform: Platform }>
> = {
  nova: [
    {
      tags: ["breakthrough", "discovery", "launch"],
      pillar: "breakthrough",
      platform: "x",
    },
    { tags: ["scandal", "fraud", "hype"], pillar: "reframe", platform: "x" },
    {
      tags: ["startup", "founder", "builder"],
      pillar: "builder_spotlight",
      platform: "tiktok",
    },
    {
      tags: ["future", "prediction", "decade"],
      pillar: "future_vision",
      platform: "youtube",
    },
    {
      tags: ["health", "community", "human"],
      pillar: "human_moment",
      platform: "instagram",
    },
  ],
  cynic: [
    { tags: ["study", "report", "claims"], pillar: "debunk", platform: "x" },
    {
      tags: ["funded", "lobbying", "conflict"],
      pillar: "follow_the_money",
      platform: "x",
    },
    {
      tags: ["bubble", "history", "precedent"],
      pillar: "history_repeating",
      platform: "youtube",
    },
    {
      tags: ["week", "news", "misleading"],
      pillar: "cold_read",
      platform: "x",
    },
    {
      tags: ["corrected", "wrong", "retraction"],
      pillar: "reluctant_credit",
      platform: "substack",
    },
  ],
  oracle: [
    {
      tags: ["data", "statistics", "metrics"],
      pillar: "signal_report",
      platform: "x",
    },
    {
      tags: ["forecast", "model", "prediction"],
      pillar: "the_model",
      platform: "x",
    },
    {
      tags: ["previous", "predicted", "correct"],
      pillar: "scorecard",
      platform: "x",
    },
    {
      tags: ["overlooked", "missed", "buried"],
      pillar: "overlooked_number",
      platform: "x",
    },
    { tags: ["debate", "argument", "claim"], pillar: "arbiter", platform: "x" },
  ],
  rebel: [
    {
      tags: ["corporate", "ban", "exploit"],
      pillar: "callout",
      platform: "tiktok",
    },
    {
      tags: ["culture", "trend", "viral"],
      pillar: "culture_read",
      platform: "instagram",
    },
    {
      tags: ["creator", "artist", "independent"],
      pillar: "creator_spotlight",
      platform: "tiktok",
    },
    {
      tags: ["system", "power", "structure"],
      pillar: "manifesto",
      platform: "substack",
    },
    {
      tags: ["beauty", "art", "quiet"],
      pillar: "moment_of_softness",
      platform: "tiktok",
    },
  ],
  sage: [
    {
      tags: ["uncertainty", "anxiety", "overwhelm"],
      pillar: "morning_question",
      platform: "x",
    },
    {
      tags: ["philosophy", "stoic", "wisdom"],
      pillar: "text_and_now",
      platform: "x",
    },
    {
      tags: ["debate", "conflict", "argument"],
      pillar: "mediation",
      platform: "x",
    },
    {
      tags: ["week", "reflect", "meaning"],
      pillar: "weekly_letter",
      platform: "substack",
    },
    {
      tags: ["silence", "pause", "stillness"],
      pillar: "long_silence",
      platform: "x",
    },
  ],
};

// ─── Stage 1: Ingestion ───────────────────────────────────────────────────────

export async function ingestTrends(): Promise<RawTrendItem[]> {
  const items: RawTrendItem[] = [];
  const errors: string[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, source, tags }) => {
      try {
        const feed = await withTimeout(
          rssParser.parseURL(url),
          10000,
          `RSS source timed out after 10s: ${source} (${url})`,
        );
        const fresh = (feed.items ?? [])
          .filter((item) => {
            if (!item.pubDate) return true;
            const age = Date.now() - new Date(item.pubDate).getTime();
            return age < 6 * 3600 * 1000; // Only items < 6 hours old
          })
          .slice(0, 10);

        for (const item of fresh) {
          const content = [item.title, item.contentSnippet, item.content]
            .filter(Boolean)
            .join(" ")
            .slice(0, 2000);

          // Auto-extract tags from content
          const autoTags = extractTags(content);

          items.push({
            id: trendStableId({
              source,
              topic: item.title ?? "untitled",
              headline: item.title ?? "",
              url: item.link ?? "",
            }),
            source,
            topic: item.title ?? "untitled",
            headline: item.title ?? "",
            url: item.link ?? "",
            published_at: item.pubDate
              ? new Date(item.pubDate).toISOString()
              : new Date().toISOString(),
            raw_content: content,
            tags: [...new Set([...tags, ...autoTags])],
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        errors.push(`${source} (${url}): ${(err as Error).message}`);
      }
    }),
  );

  if (errors.length > 0) {
    console.warn(`[Ingestion] ${errors.length} source(s) failed:`, errors);
  }

  // Deduplicate by source/url/topic/headline. Topic is global: if it was
  // already entered by any source, skip it before it can fan out downstream.
  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const keys = trendIdentityKeys(item);
    if (keys.some((key) => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
    return true;
  });

  const existingKeys = await getExistingTrendIdentityKeys(deduped);
  const fresh = deduped.filter((item) => {
    const isDuplicate = trendIdentityKeys(item).some((key) =>
      existingKeys.has(key),
    );
    if (isDuplicate) {
      console.log(
        `[Ingestion] Skipping duplicate trend: "${item.topic}" (${item.source})`,
      );
    }
    return !isDuplicate;
  });

  if (fresh.length > 0) {
    await insertRawTrends(fresh);
  }

  console.log(
    `[Ingestion] ${fresh.length} items ingested (${items.length - fresh.length} duplicates removed)`,
  );
  return fresh;
}

// ─── Tag Extraction ───────────────────────────────────────────────────────────

function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tagGroups: Record<string, string[]> = {
    ai: [
      "artificial intelligence",
      "machine learning",
      "llm",
      "gpt",
      "ai model",
      "generative ai",
    ],
    climate: [
      "climate",
      "solar",
      "wind energy",
      "carbon",
      "emissions",
      "net zero",
    ],
    crypto: ["bitcoin", "ethereum", "crypto", "blockchain", "defi", "nft"],
    labor: ["workers", "strike", "layoffs", "union", "gig economy", "wages"],
    finance: [
      "ipo",
      "earnings",
      "valuation",
      "market cap",
      "revenue",
      "profit",
    ],
    health: ["mental health", "longevity", "biotech", "clinical trial", "fda"],
    policy: ["regulation", "congress", "legislation", "law", "ruling", "court"],
    platform: [
      "tiktok",
      "instagram",
      "youtube",
      "twitter",
      "meta",
      "google",
      "apple",
    ],
    culture: [
      "viral",
      "trending",
      "gen z",
      "millennial",
      "influencer",
      "creator",
    ],
    startup: [
      "startup",
      "founder",
      "seed round",
      "series a",
      "vc",
      "accelerator",
    ],
  };

  const found: string[] = [];
  for (const [tag, keywords] of Object.entries(tagGroups)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(tag);
    }
  }
  return found;
}

// ─── Stage 2: Persona Relevance Scoring ──────────────────────────────────────

export function scorePersonaRelevance(
  item: RawTrendItem,
  personaId: PersonaId,
): number {
  const text = `${item.headline} ${item.raw_content}`.toLowerCase();
  const graph = PERSONA_INTEREST_GRAPH[personaId];
  let score = 0;
  let matches = 0;

  for (const kw of graph.high) {
    if (text.includes(kw)) {
      score += 3;
      matches++;
    }
  }
  for (const kw of graph.medium) {
    if (text.includes(kw)) {
      score += 1.5;
      matches++;
    }
  }
  for (const kw of graph.low) {
    if (text.includes(kw)) {
      score -= 0.5;
    }
  }

  // Tag overlap bonus
  const tagBonus =
    item.tags.filter((t) =>
      [...graph.high, ...graph.medium].some(
        (kw) => kw.includes(t) || t.includes(kw),
      ),
    ).length * 0.5;
  score += tagBonus;

  // Normalise to 0–1 against a reasonable max
  const maxPossible = Math.min(matches * 3 + tagBonus, 15);
  return maxPossible > 0 ? Math.min(1, score / maxPossible) : 0;
}

function calcUrgency(item: RawTrendItem): TrendUrgency {
  const ageHours =
    (Date.now() - new Date(item.published_at).getTime()) / 3600000;
  if (ageHours < 1) return "high";
  if (ageHours < 4) return "medium";
  return "low";
}

function suggestPillarAndPlatform(
  item: RawTrendItem,
  personaId: PersonaId,
): { pillar: ContentPillar; platform: Platform } {
  const text = `${item.headline} ${item.raw_content}`.toLowerCase();
  const pillarOptions = PILLAR_MAP[personaId];

  for (const option of pillarOptions) {
    if (
      option.tags.some((tag) => text.includes(tag) || item.tags.includes(tag))
    ) {
      return { pillar: option.pillar, platform: option.platform };
    }
  }
  // Default fallbacks per persona
  const defaults: Record<
    PersonaId,
    { pillar: ContentPillar; platform: Platform }
  > = {
    nova: { pillar: "breakthrough", platform: "x" },
    cynic: { pillar: "debunk", platform: "x" },
    oracle: { pillar: "signal_report", platform: "x" },
    rebel: { pillar: "callout", platform: "tiktok" },
    sage: { pillar: "morning_question", platform: "x" },
  };
  return defaults[personaId];
}

export async function scoreAndRoute(
  items: RawTrendItem[],
  relevanceThreshold = 0.35,
): Promise<ScoredTrendItem[]> {
  const scored: ScoredTrendItem[] = [];

  for (const item of items) {
    const scores: Record<PersonaId, number> = {
      nova: 0,
      cynic: 0,
      oracle: 0,
      rebel: 0,
      sage: 0,
    };

    for (const personaId of [
      "nova",
      "cynic",
      "oracle",
      "rebel",
      "sage",
    ] as PersonaId[]) {
      scores[personaId] = scorePersonaRelevance(item, personaId);
    }

    const assigned = (Object.entries(scores) as [PersonaId, number][])
      .filter(([, score]) => score >= relevanceThreshold)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);

    // Only process items that are relevant to at least one persona
    if (assigned.length === 0) continue;

    const urgency = calcUrgency(item);
    const urgencyRank = urgency === "high" ? 1 : urgency === "medium" ? 2 : 3;

    const scored_item: ScoredTrendItem = {
      ...item,
      relevance_scores: scores,
      urgency,
      assigned_personas: assigned,
      network_event: assigned.length >= 2,
    };

    const inserted = await insertScoredTrend({
      ...scored_item,
      urgency_rank: urgencyRank,
      processed: false,
    });
    if (inserted) scored.push(scored_item);
  }

  console.log(
    `[Scoring] ${scored.length}/${items.length} items scored above threshold. Network events: ${scored.filter((i) => i.network_event).length}`,
  );
  return scored;
}
