/**
 * memory-write.ts
 * Stage 5 (post-review) + Stage 7 (post-publish)
 *
 * Called after a human approves and publishes a post.
 * Writes the published content into all relevant memory layers
 * and fires any relational state updates triggered by the event.
 */

import type {
  PersonaId,
  Platform,
  PublishedPost,
  RelationalEvent,
  GenerationResult,
  GenerationRequest,
  ReviewQueueItem,
} from "@/lib/pipeline/types";
import {
  writeEpisodicMemory,
  writeBeliefEvolution,
  insertPublishedPost,
  applyRelationalEvent,
} from "@/lib/pipeline/db";
import { embedText } from "./memory";

// ─── Relational Event Inference ───────────────────────────────────────────────
// Given a published post and its original request, infer any relational state
// changes that should be applied automatically.
// Human operators can override or supplement via the review dashboard.

function inferRelationalEvents(
  post: PublishedPost,
  request: GenerationRequest,
): RelationalEvent[] {
  const events: RelationalEvent[] = [];

  // Cross-persona post: update relationship between poster and target
  if (request.crossTagPersona) {
    const isDebate = [
      "debunk",
      "history_repeating",
      "follow_the_money",
      "cold_read",
    ].includes(request.pillar);
    const isCredit = ["reluctant_credit", "creator_spotlight"].includes(
      request.pillar,
    );
    const isMediation = request.pillar === "mediation";
    const isAlliance = [
      "text_and_now",
      "moment_of_softness",
      "morning_question",
    ].includes(request.pillar);

    if (isDebate) {
      events.push({
        from_persona: post.persona,
        to_persona: request.crossTagPersona,
        event_type: "challenge",
        trust_delta: -0.02,
        tension_delta: +0.05,
        summary: `${post.persona} posted a ${request.pillar} challenging ${request.crossTagPersona}'s position on "${request.topic}".`,
        trigger_post_ids: [],
      });
    } else if (isCredit) {
      events.push({
        from_persona: post.persona,
        to_persona: request.crossTagPersona,
        event_type: "credit",
        trust_delta: +0.08,
        tension_delta: -0.06,
        new_sentiment: "neutral-warm",
        summary: `${post.persona} gave public credit to ${request.crossTagPersona} on "${request.topic}".`,
        trigger_post_ids: [],
      });
    } else if (isMediation) {
      // Sage mediates — slightly increases trust with both sides
      events.push({
        from_persona: post.persona,
        to_persona: request.crossTagPersona,
        event_type: "mediation",
        trust_delta: +0.03,
        tension_delta: -0.02,
        summary: `${post.persona} mediated the debate involving ${request.crossTagPersona} on "${request.topic}".`,
        trigger_post_ids: [],
      });
    } else if (isAlliance) {
      events.push({
        from_persona: post.persona,
        to_persona: request.crossTagPersona,
        event_type: "support",
        trust_delta: +0.05,
        tension_delta: -0.03,
        new_sentiment: "warm",
        summary: `${post.persona} shared a warm/supportive post referencing ${request.crossTagPersona} on "${request.topic}".`,
        trigger_post_ids: [],
      });
    }
  }

  return events;
}

// ─── Belief Shift Detector ────────────────────────────────────────────────────
// Scans post content for markers that indicate a belief has shifted.
// These are heuristics — human review should confirm.

function detectBeliefShift(
  content: string,
  personaId: PersonaId,
): { isShift: boolean; signal: string } {
  const shiftSignals: Record<PersonaId, string[]> = {
    nova: [
      "i was wrong",
      "i underestimated",
      "i need to update",
      "more complicated than",
      "changed my mind",
    ],
    cynic: [
      "i was wrong",
      "reluctant credit",
      "have to admit",
      "actually delivered",
      "correct on this one",
    ],
    oracle: [
      "updating my model",
      "revising",
      "new data changes",
      "probability updated",
      "was miscalibrated",
    ],
    rebel: [
      "have to give credit",
      "this one is different",
      "surprised me",
      "not what i expected",
    ],
    sage: [
      "i have been mistaken",
      "this reframes",
      "i must reconsider",
      "the examined assumption",
    ],
  };

  const lower = content.toLowerCase();
  const signals = shiftSignals[personaId] ?? [];
  const matched = signals.find((s) => lower.includes(s));

  return { isShift: !!matched, signal: matched ?? "" };
}

// ─── Main: Write Published Post to Memory ────────────────────────────────────

export interface MemoryWriteOptions {
  reviewItem: ReviewQueueItem;
  request: GenerationRequest;
  platformPostId?: string;
  engagementScore?: number;

  // Optional explicit belief shift — can be set by human reviewer in dashboard
  beliefShift?: {
    topic: string;
    prevPosition: string;
    newPosition: string;
    triggerEventSummary: string;
    confidenceDelta: number;
    publicAcknowledgment: boolean;
  };
}

export async function writePublishedPostToMemory(
  opts: MemoryWriteOptions,
): Promise<void> {
  const { reviewItem, request } = opts;
  const finalContent =
    reviewItem.final_content ?? reviewItem.generation.content;
  const persona = reviewItem.generation.persona as PersonaId;
  const platform = reviewItem.generation.platform as Platform;

  console.log(`[MemoryWrite] Writing ${persona} / ${platform} post to memory…`);

  // 1. Embed the final (possibly edited) post content
  const embedding = await embedText(finalContent);

  // 2. Write episodic memory (Layer 2)
  const memoryId = await writeEpisodicMemory({
    persona_id: persona,
    memory_type: "post",
    content: finalContent,
    embedding,
    topic_tags: request.topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5),
    platform,
    cross_refs: request.crossTagPersona ? [] : [], // Populated in cascade step
    engagement_score: opts.engagementScore ?? 0,
    created_at: new Date().toISOString(),
  });

  console.log(`[MemoryWrite] Episodic memory written: ${memoryId}`);

  // 3. Detect and write belief evolution (Layer 5)
  const autoDetect = detectBeliefShift(finalContent, persona);
  const shiftData =
    opts.beliefShift ??
    (autoDetect.isShift
      ? {
          topic: request.topic.toLowerCase().replace(/\s+/g, "_"),
          prevPosition: `Default position on "${request.topic}"`,
          newPosition: finalContent.slice(0, 200),
          triggerEventSummary: `Auto-detected shift signal: "${autoDetect.signal}"`,
          confidenceDelta: -0.1, // Conservative default for auto-detected shifts
          publicAcknowledgment: true,
        }
      : null);

  if (shiftData) {
    const beliefId = await writeBeliefEvolution({
      persona_id: persona,
      topic: shiftData.topic,
      prev_position: shiftData.prevPosition,
      trigger_event_id: memoryId,
      trigger_event_summary: shiftData.triggerEventSummary,
      new_position: shiftData.newPosition,
      confidence_delta: shiftData.confidenceDelta,
      public_acknowledgment: shiftData.publicAcknowledgment,
      acknowledgment_excerpt: finalContent.slice(0, 200),
      created_at: new Date().toISOString(),
    });
    console.log(`[MemoryWrite] Belief evolution written: ${beliefId}`);
  }

  // 4. Apply relational state changes (Layer 3)
  const relationalEvents = inferRelationalEvents(
    {
      review_item_id: reviewItem.id,
      persona,
      platform,
      content: finalContent,
      published_at: new Date().toISOString(),
      topic_tags: [],
      cross_refs: [],
    },
    request,
  );

  for (const event of relationalEvents) {
    await applyRelationalEvent(event);
    console.log(
      `[MemoryWrite] Relational event applied: ` +
        `${event.from_persona}→${event.to_persona} ` +
        `(trust${event.trust_delta >= 0 ? "+" : ""}${event.trust_delta.toFixed(2)}, ` +
        `tension${event.tension_delta >= 0 ? "+" : ""}${event.tension_delta.toFixed(2)})`,
    );
  }

  // 5. Write to published_posts ledger
  await insertPublishedPost({
    review_item_id: reviewItem.id,
    persona,
    platform,
    content: finalContent,
    platform_post_id: opts.platformPostId,
    published_at: new Date().toISOString(),
    topic_tags: [],
    cross_refs: [],
    belief_shift: shiftData
      ? {
          topic: shiftData.topic,
          prev_position: shiftData.prevPosition,
          new_position: shiftData.newPosition,
          confidence_delta: shiftData.confidenceDelta,
          public_acknowledgment: shiftData.publicAcknowledgment,
        }
      : undefined,
  });

  console.log(
    `[MemoryWrite] Published post record written for ${persona} / ${platform}`,
  );
}

// ─── Engagement Score Updater ─────────────────────────────────────────────────
// Called by a separate cron (e.g. daily) after fetching platform analytics.
// Updates the engagement_score in episodic_memory for each published post.
// This affects future retrieval weighting — high-performing posts surface more often.

export async function updateEngagementScore(
  episodicMemoryId: string,
  score: number,
): Promise<void> {
  const { db } = await import("./db");
  const { error } = await db()
    .from("episodic_memory")
    .update({ engagement_score: score })
    .eq("id", episodicMemoryId);
  if (error) {
    console.error(
      `[EngagementUpdate] Failed for ${episodicMemoryId}:`,
      error.message,
    );
  }
}
