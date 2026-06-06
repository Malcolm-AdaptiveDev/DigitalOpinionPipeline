/**
 * pipeline.ts
 * Main orchestrator — wires all 7 pipeline stages together.
 *
 * Entry points:
 *   runTrendPipeline()       — called by Inngest every 15 minutes
 *   processApprovedPost()    — called by the review dashboard webhook
 *   runScheduledPosts()      — called by Inngest daily for pre-planned calendar posts
 *
 * Stage map:
 *   1. ingestTrends()         — fetch + dedupe from RSS/APIs
 *   2. scoreAndRoute()        — relevance scores + persona assignment
 *   3. assembleMemoryBundle() — query all 5 memory layers
 *   4. generatePost()         — Claude API call
 *   5. insertReviewItem()     — queue for human review
 *   6. [human reviews]        — Retool dashboard (not in this file)
 *   7. writePublishedPostToMemory() — after approval, write back to all memory layers
 */

import { randomUUID } from "crypto";
import { inngest } from "@/lib/inngest-client";
import { ingestTrends, scoreAndRoute } from "@/lib/ingestion";
import {
  assembleMemoryBundle,
  assemblePrompt,
  buildWorldContext,
  type PromptAssemblyOptions,
} from "@/lib/pipeline/memory";
import { generatePost, detectCascadeRequests } from "@/lib/pipeline/generation";
import {
  writePublishedPostToMemory,
  type MemoryWriteOptions,
} from "@/lib/pipeline/memory-write";
import {
  getUnprocessedTrends,
  markTrendProcessed,
  insertReviewItem,
  updateReviewStatus,
  getReviewItem,
  startPipelineRun,
  completePipelineRun,
} from "@/lib/pipeline/db";
import { getPipelineConfig } from "@/lib/pipeline/config";
import type {
  PersonaId,
  ScoredTrendItem,
  GenerationRequest,
  GenerationResult,
  ReviewQueueItem,
  Platform,
  ContentPillar,
  ToneModifier,
  NetworkActivity,
} from "@/lib/pipeline/types";

// ─── Stage 3→5: Process a single trend item for one persona ──────────────────

async function processTrendForPersona(
  item: ScoredTrendItem,
  personaId: PersonaId,
  networkActivity: NetworkActivity[],
  runErrors: Array<{ stage: string; message: string; detail?: unknown }>,
): Promise<GenerationResult | null> {
  const { pillar, platform } = derivePillarAndPlatform(item, personaId);

  const worldContext = buildWorldContext(item, personaId);

  // Stage 3 — Memory assembly
  let bundle;
  try {
    bundle = await assembleMemoryBundle(personaId, item.topic);
  } catch (err) {
    runErrors.push({
      stage: "memory_assembly",
      message: (err as Error).message,
      detail: { personaId, topic: item.topic },
    });
    console.error(`[Pipeline] Memory assembly failed for ${personaId}:`, err);
    return null;
  }

  const promptOpts: PromptAssemblyOptions = {
    personaId,
    bundle,
    worldContext,
    networkActivity,
    platform,
    pillar,
    targetLength: "platform-appropriate (see length guidance)",
    toneModifier: item.urgency === "high" ? "more_sharp" : "none",
    disclosureRequired: false,
  };

  const assembled = assemblePrompt(promptOpts);

  const request: GenerationRequest = {
    persona: personaId,
    topic: item.topic,
    topicTags: item.tags,
    worldContext,
    networkActivity,
    platform,
    pillar,
    targetLength: promptOpts.targetLength,
    toneModifier: promptOpts.toneModifier as ToneModifier,
    disclosureRequired: false,
    triggeredBy: "trend",
    trendItemId: item.id,
  };

  // Stage 4 — Generation
  let result: GenerationResult;
  try {
    result = await generatePost(request, assembled);
  } catch (err) {
    runErrors.push({
      stage: "generation",
      message: (err as Error).message,
      detail: { personaId, topic: item.topic },
    });
    console.error(`[Pipeline] Generation failed for ${personaId}:`, err);
    return null;
  }

  // Stage 5 — Review queue
  try {
    const reviewId = await insertReviewItem({
      generation: result,
      request,
      status: "pending",
      queued_at: new Date().toISOString(),
    });
    console.log(
      `[Pipeline] Queued for review: ${reviewId} (${personaId}/${platform}/${pillar})`,
    );
  } catch (err) {
    runErrors.push({ stage: "review_queue", message: (err as Error).message });
    console.error(`[Pipeline] Review queue insert failed:`, err);
  }

  return result;
}

function derivePillarAndPlatform(
  item: ScoredTrendItem,
  personaId: PersonaId,
): { pillar: ContentPillar; platform: Platform } {
  // Simple heuristic — ingestion.ts has the full PILLAR_MAP logic
  // In production, the scored item carries the suggestion from scoring stage
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

// ─── Stage 1+2+3+4+5: Full Trend Pipeline Run ────────────────────────────────

export async function runTrendPipeline(): Promise<void> {
  const runId = randomUUID();
  const runErrors: Array<{
    stage: string;
    message: string;
    detail?: unknown;
    at: string;
  }> = [];
  let trendsF = 0,
    trendsS = 0,
    generated = 0,
    queued = 0,
    cascadesGenerated = 0;

  await startPipelineRun(runId);
  const config = await getPipelineConfig();
  console.log(
    `\n[Pipeline] Run ${runId} started at ${new Date().toISOString()}`,
  );

  try {
    // Stage 1 — Ingestion
    let rawItems: Awaited<ReturnType<typeof ingestTrends>>;
    try {
      rawItems = await ingestTrends();
      trendsF = rawItems.length;
    } catch (err) {
      runErrors.push({
        stage: "ingestion",
        message: (err as Error).message,
        at: new Date().toISOString(),
      });
      console.error("[Pipeline] Ingestion failed — aborting run:", err);
      await completePipelineRun(
        runId,
        { trendsF, trendsS, generated, queued },
        runErrors,
      );
      return;
    }

    // Stage 2 — Scoring + routing
    let scoredItems: Awaited<ReturnType<typeof scoreAndRoute>>;
    try {
      scoredItems = await scoreAndRoute(rawItems, config.relevance_threshold);
      trendsS = scoredItems.length;
    } catch (err) {
      runErrors.push({
        stage: "scoring",
        message: (err as Error).message,
        at: new Date().toISOString(),
      });
      console.error("[Pipeline] Scoring failed — aborting run:", err);
      await completePipelineRun(
        runId,
        { trendsF, trendsS, generated, queued },
        runErrors,
      );
      return;
    }

    // Retrieve any previously scored but unprocessed items too
    const unprocessed = await getUnprocessedTrends(config.max_trends_per_run);
    const allItems = [
      ...scoredItems,
      ...unprocessed.filter((u) => !scoredItems.some((s) => s.id === u.id)),
    ].slice(0, config.max_trends_per_run);

    if (allItems.length === 0) {
      console.log("[Pipeline] No relevant trend items found this run.");
      await completePipelineRun(
        runId,
        { trendsF, trendsS, generated, queued },
        runErrors,
      );
      return;
    }

    // Build network activity snapshot once (used by all persona generations)
    // This is a lightweight read — recently published posts from any persona
    const { getRecentNetworkPosts } = await import("./db");
    const recentPosts = await getRecentNetworkPosts("nova", 48); // excludes none actually — just needs all
    const networkActivity: NetworkActivity[] = recentPosts.map((p) => ({
      persona: p.persona_id as PersonaId,
      platform: p.platform as Platform,
      hours_ago: Math.round(
        (Date.now() - new Date(p.created_at).getTime()) / 3600000,
      ),
      excerpt: p.content.slice(0, 120),
      topic_tag: p.topic_tags?.[0] ?? "general",
      post_id: p.id,
    }));

    // Process each trend item
    for (const item of allItems) {
      console.log(
        `\n[Pipeline] Processing: "${item.topic}" → assigned: [${item.assigned_personas.join(", ")}]`,
      );

      // Process each assigned persona sequentially to avoid thundering herd
      const primaryResults: GenerationResult[] = [];

      const assignedPersonas = item.assigned_personas.slice(0, config.max_personas_per_trend);
      for (const personaId of assignedPersonas) {
        const result = await processTrendForPersona(
          item,
          personaId,
          networkActivity,
          runErrors,
        );
        if (result) {
          generated++;
          queued++;
          primaryResults.push(result);

          // Brief pause between personas to be polite to the API
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Cross-persona cascade — detect reactions from primary results
      if (config.cascade_enabled && primaryResults.length > 0 && cascadesGenerated < config.max_cascades_per_run) {
        const latestResult = primaryResults[primaryResults.length - 1];
        const latestRequest = {
          persona: latestResult.persona,
          topic: item.topic,
          topicTags: item.tags,
          worldContext: buildWorldContext(item, latestResult.persona),
          networkActivity,
          platform: latestResult.platform,
          pillar: latestResult.pillar,
          targetLength: "short",
          toneModifier: "none" as ToneModifier,
          disclosureRequired: false,
          triggeredBy: "trend" as const,
          trendItemId: item.id,
        };

        const cascades = detectCascadeRequests(
          latestResult,
          latestRequest,
          networkActivity,
        );

        for (const cascade of cascades.slice(0, config.max_cascades_per_run - cascadesGenerated)) {
          // Don't generate cascade if persona was already assigned
          if (item.assigned_personas.includes(cascade.persona)) continue;

          console.log(
            `[Pipeline] Cascade: ${cascade.persona} reacts to ${latestResult.persona}`,
          );

          try {
            const cascadeBundle = await assembleMemoryBundle(
              cascade.persona,
              item.topic,
            );
            const cascadeWorld = buildWorldContext(item, cascade.persona);
            const cascadeAssembled = assemblePrompt({
              personaId: cascade.persona,
              bundle: cascadeBundle,
              worldContext: cascadeWorld,
              networkActivity: cascade.networkActivity,
              platform: cascade.platform,
              pillar: cascade.pillar,
              targetLength: "platform-appropriate",
              toneModifier: cascade.toneModifier as ToneModifier,
              crossTagPersona: cascade.crossTagPersona,
              disclosureRequired: cascade.disclosureRequired,
            });

            const cascadeRequest = { ...cascade, topicTags: item.tags };
            const cascadeResult = await generatePost(cascadeRequest, cascadeAssembled);
            await insertReviewItem({
              generation: cascadeResult,
              request: cascadeRequest,
              status: "pending",
              queued_at: new Date().toISOString(),
            });

            generated++;
            queued++;
            cascadesGenerated++;
            console.log(
              `[Pipeline] Cascade queued: ${cascade.persona}/${cascade.platform}`,
            );

            await new Promise((r) => setTimeout(r, 500));
          } catch (err) {
            runErrors.push({
              stage: "cascade_generation",
              message: (err as Error).message,
              detail: { cascade_persona: cascade.persona, topic: item.topic },
              at: new Date().toISOString(),
            });
            console.error(
              `[Pipeline] Cascade failed for ${cascade.persona}:`,
              err,
            );
          }
        }
      }

      await markTrendProcessed(item.id);
    }
  } catch (err) {
    runErrors.push({
      stage: "orchestrator",
      message: (err as Error).message,
      at: new Date().toISOString(),
    });
    console.error("[Pipeline] Unexpected orchestrator error:", err);
  } finally {
    await completePipelineRun(
      runId,
      { trendsF, trendsS, generated, queued },
      runErrors,
    );
    console.log(
      `\n[Pipeline] Run ${runId} completed. ` +
        `Fetched: ${trendsF}, Scored: ${trendsS}, Generated: ${generated}, Queued: ${queued}. ` +
        `Errors: ${runErrors.length}`,
    );
  }
}

// ─── Stage 7: Process Approved Post ──────────────────────────────────────────
// Called by the review dashboard via webhook after an operator approves a post.

export async function processApprovedPost(
  reviewItemId: string,
  opts?: {
    finalContent?: string;
    editorNotes?: string;
    reviewedBy?: string;
    platformPostId?: string;
    topicTags?: string[];
    beliefShift?: MemoryWriteOptions["beliefShift"];
  },
): Promise<void> {
  const item = await getReviewItem(reviewItemId);
  if (!item) throw new Error(`Review item not found: ${reviewItemId}`);
  if (item.status !== "pending") {
    console.warn(
      `[Publish] Item ${reviewItemId} is already ${item.status} — skipping.`,
    );
    return;
  }

  const request = opts?.topicTags
    ? { ...item.request, topicTags: opts.topicTags }
    : item.request;

  // Update review record
  await updateReviewStatus(
    reviewItemId,
    opts?.finalContent ? "edited" : "approved",
    {
      editorNotes: opts?.editorNotes,
      finalContent: opts?.finalContent,
      reviewedBy: opts?.reviewedBy,
      request,
    },
  );

  // Stage 7 — Write to all memory layers
  await writePublishedPostToMemory({
    reviewItem: {
      ...item,
      final_content: opts?.finalContent ?? item.final_content,
      request,
    },
    request,
    topicTags: opts?.topicTags,
    platformPostId: opts?.platformPostId,
    beliefShift: opts?.beliefShift,
  });

  console.log(
    `[Publish] Post ${reviewItemId} processed and written to memory.`,
  );
}

// ─── Scheduled Calendar Posts ─────────────────────────────────────────────────
// For pre-planned pillars (Sage morning questions, Oracle scorecards, etc.)
// that run on a schedule regardless of trending events.

export async function runScheduledPosts(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…6=Sat
  const hour = now.getHours(); // 0–23 ET

  type ScheduledPost = {
    persona: PersonaId;
    pillar: ContentPillar;
    platform: Platform;
    topic: string;
    toneModifier: ToneModifier;
    condition: boolean;
  };

  const scheduledPosts: ScheduledPost[] = [
    // Sage morning question — daily at 7 AM
    {
      persona: "sage",
      pillar: "morning_question",
      platform: "x",
      topic: "daily reflection and examined life",
      toneModifier: "more_reflective",
      condition: hour === 7,
    },
    // Oracle signal report — Monday at 8 AM
    {
      persona: "oracle",
      pillar: "signal_report",
      platform: "x",
      topic: "weekly macro and tech signal review",
      toneModifier: "none",
      condition: dayOfWeek === 1 && hour === 8,
    },
    // Cynic cold read — Friday at 5 PM
    {
      persona: "cynic",
      pillar: "cold_read",
      platform: "x",
      topic: "most overstated or misleading narratives this week",
      toneModifier: "more_sharp",
      condition: dayOfWeek === 5 && hour === 17,
    },
    // Sage weekly letter — Friday at 8 AM
    {
      persona: "sage",
      pillar: "weekly_letter",
      platform: "substack",
      topic: "philosophical reflection on the week in the network",
      toneModifier: "more_reflective",
      condition: dayOfWeek === 5 && hour === 8,
    },
    // Rebel moment of softness — Saturday at 10 AM
    {
      persona: "rebel",
      pillar: "moment_of_softness",
      platform: "tiktok",
      topic: "something beautiful with no commentary",
      toneModifier: "none",
      condition: dayOfWeek === 6 && hour === 10,
    },
    // Sage Sunday return sentence — Sunday at 9 AM
    {
      persona: "sage",
      pillar: "long_silence",
      platform: "x",
      topic: "breaking the weekly silence",
      toneModifier: "more_reflective",
      condition: dayOfWeek === 0 && hour === 9,
    },
  ];

  const duePosts = scheduledPosts.filter((p) => p.condition);

  if (duePosts.length === 0) {
    console.log(`[Scheduled] No scheduled posts due at ${now.toISOString()}`);
    return;
  }

  console.log(`[Scheduled] ${duePosts.length} scheduled post(s) due now.`);

  for (const scheduled of duePosts) {
    try {
      const bundle = await assembleMemoryBundle(
        scheduled.persona,
        scheduled.topic,
      );
      const worldCtx = {
        trending_topic: scheduled.topic,
        source_name: "scheduled",
        url: "",
        published_at: now.toISOString(),
        hours_ago: 0,
        summary: `Scheduled ${scheduled.pillar} post.`,
        relevance: "Scheduled recurring pillar",
        related_signals: [],
        suggested_pillar: scheduled.pillar,
        suggested_platform: scheduled.platform,
        urgency: "low" as const,
      };

      const assembled = assemblePrompt({
        personaId: scheduled.persona,
        bundle,
        worldContext: worldCtx,
        networkActivity: [],
        platform: scheduled.platform,
        pillar: scheduled.pillar,
        targetLength: "platform-appropriate",
        toneModifier: scheduled.toneModifier,
        disclosureRequired: false,
      });

      const request: GenerationRequest = {
        persona: scheduled.persona,
        topic: scheduled.topic,
        worldContext: worldCtx,
        networkActivity: [],
        platform: scheduled.platform,
        pillar: scheduled.pillar,
        targetLength: "platform-appropriate",
        toneModifier: scheduled.toneModifier,
        disclosureRequired: false,
        triggeredBy: "scheduled",
      };

      const result = await generatePost(request, assembled);
      await insertReviewItem({
        generation: result,
        request,
        status: "pending",
        queued_at: now.toISOString(),
      });

      console.log(
        `[Scheduled] Queued: ${scheduled.persona}/${scheduled.pillar}/${scheduled.platform}`,
      );
    } catch (err) {
      console.error(
        `[Scheduled] Failed for ${scheduled.persona}/${scheduled.pillar}:`,
        err,
      );
    }
  }
}

// ─── Inngest Function Definitions ─────────────────────────────────────────────

export const trendPipelineFunction = inngest.createFunction(
  { id: "trend-pipeline", name: "Trend ingestion and persona routing" },
  { cron: "*/15 * * * *" }, // Every 15 minutes
  async ({ step }) => {
    await step.run("run-trend-pipeline", () => runTrendPipeline());
  },
);

export const scheduledPostsFunction = inngest.createFunction(
  { id: "scheduled-posts", name: "Scheduled persona posts" },
  { cron: "0 * * * *" }, // Every hour on the hour
  async ({ step }) => {
    await step.run("run-scheduled-posts", () => runScheduledPosts());
  },
);

export const approvedPostWebhook = inngest.createFunction(
  { id: "approved-post-webhook", name: "Process approved review item" },
  { event: "post/approved" },
  async ({ event, step }) => {
    const {
      reviewItemId,
      finalContent,
      editorNotes,
      reviewedBy,
      platformPostId,
      topicTags,
      beliefShift,
    } = event.data as {
      reviewItemId: string;
      finalContent?: string;
      editorNotes?: string;
      reviewedBy?: string;
      platformPostId?: string;
      topicTags?: string[];
      beliefShift?: MemoryWriteOptions["beliefShift"];
    };

    await step.run("process-approved-post", () =>
      processApprovedPost(reviewItemId, {
        finalContent,
        editorNotes,
        reviewedBy,
        platformPostId,
        topicTags,
        beliefShift,
      }),
    );
  },
);
