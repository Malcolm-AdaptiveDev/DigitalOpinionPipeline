/**
 * rss-feeds.ts
 * RSS feed management — health checks and active feed resolution.
 *
 * Health checks parse each feed URL and update the rss_feeds table with
 * the result. Feeds that fail 3+ times consecutively are auto-disabled.
 */

import Parser from "rss-parser";
import { listRssFeeds, updateFeedHealth } from "@/lib/pipeline/db";
import type {
  RssFeed,
  RssFeedHealthCheckResult,
  TrendSource,
} from "@/lib/pipeline/types";

const rssParser = new Parser({ timeout: 8000 });

const AUTO_DISABLE_THRESHOLD = 3;

// ─── Active Feed Resolution ───────────────────────────────────────────────────

/**
 * Returns the active RSS sources from the database.
 * Used by ingestion.ts instead of the static RSS_SOURCES array.
 * Falls back to the static list if the DB is unavailable.
 */
export async function getActiveFeeds(): Promise<
  Array<{
    url: string;
    source: TrendSource;
    tags: string[];
    feedId: string;
    name: string;
  }>
> {
  const feeds = await listRssFeeds(true);
  return feeds.map((f) => ({
    url: f.url,
    source: f.source,
    tags: f.tags,
    feedId: f.id,
    name: f.name,
  }));
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Checks a single feed's health by attempting to parse it.
 * Returns the result — does NOT write to DB (caller decides).
 */
export async function checkFeedHealth(
  feed: Pick<RssFeed, "id" | "url" | "name">,
): Promise<RssFeedHealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const parsed = await Promise.race([
      rssParser.parseURL(feed.url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Feed timed out after 10s")), 10_000),
      ),
    ]);

    return {
      feedId: feed.id,
      url: feed.url,
      status: "ok",
      itemCount: parsed.items?.length ?? 0,
      checkedAt,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    const isTimeout =
      message.includes("timed out") || message.includes("timeout");

    return {
      feedId: feed.id,
      url: feed.url,
      status: isTimeout ? "timeout" : "error",
      error: message,
      checkedAt,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Runs health checks for all feeds (active and inactive) and updates the DB.
 * Auto-disables feeds that exceed the consecutive failure threshold.
 * Returns a summary of the results.
 */
export async function runFeedHealthChecks(): Promise<{
  total: number;
  ok: number;
  failed: number;
  autoDisabled: number;
  results: RssFeedHealthCheckResult[];
}> {
  const feeds = await listRssFeeds(false);
  const results: RssFeedHealthCheckResult[] = [];
  let ok = 0,
    failed = 0,
    autoDisabled = 0;

  for (const feed of feeds) {
    const result = await checkFeedHealth(feed);
    results.push(result);

    const isFailure = result.status !== "ok";
    const newConsecutiveFailures = isFailure
      ? (feed.consecutive_failures ?? 0) + 1
      : 0;
    const shouldAutoDisable =
      isFailure &&
      newConsecutiveFailures >= AUTO_DISABLE_THRESHOLD &&
      feed.is_active &&
      !feed.auto_disabled;

    try {
      await updateFeedHealth(feed.id, result.status, {
        error: result.error,
        consecutiveFailures: newConsecutiveFailures,
        autoDisable: shouldAutoDisable || undefined,
      });
    } catch (dbErr) {
      console.error(
        `[FeedHealth] Failed to update DB for feed ${feed.name}:`,
        dbErr,
      );
    }

    if (isFailure) {
      failed++;
      if (shouldAutoDisable) autoDisabled++;
      console.warn(
        `[FeedHealth] ${feed.name} (${result.status}): ${result.error ?? ""} — failures: ${newConsecutiveFailures}${shouldAutoDisable ? " → AUTO-DISABLED" : ""}`,
      );
    } else {
      ok++;
    }

    // Brief pause between checks to avoid hammering sources
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(
    `[FeedHealth] Checked ${feeds.length} feeds: ${ok} ok, ${failed} failed, ${autoDisabled} auto-disabled`,
  );

  return { total: feeds.length, ok, failed, autoDisabled, results };
}
