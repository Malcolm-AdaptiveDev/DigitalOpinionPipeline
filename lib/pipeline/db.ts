/**
 * db.ts
 * Supabase client singleton + all typed query helpers.
 * Every pipeline stage imports from here — never creates its own client.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  PersonaId,
  EpisodicMemory,
  RelationalState,
  BeliefEvolution,
  GenerationRequest,
  ReviewQueueItem,
  PublishedPost,
  RelationalEvent,
  RawTrendItem,
  ScoredTrendItem,
  PipelineRun,
  ReviewStatus,
} from "@/lib/pipeline/types";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    }
    _client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// ─── Episodic Memory ──────────────────────────────────────────────────────────

/**
 * Semantic similarity search via pgvector.
 * Requires the match_episodic_memories RPC function in Supabase:
 *
 * create or replace function match_episodic_memories(
 *   query_embedding vector(1536),
 *   match_persona_id text,
 *   match_count int,
 *   similarity_threshold float
 * ) returns table (
 *   id uuid, persona_id text, memory_type text, content text,
 *   topic_tags text[], platform text, cross_refs uuid[],
 *   engagement_score float, created_at timestamptz,
 *   similarity float
 * ) language sql stable as $$
 *   select id, persona_id, memory_type, content, topic_tags, platform,
 *          cross_refs, engagement_score, created_at,
 *          1 - (embedding <=> query_embedding) as similarity
 *   from episodic_memory
 *   where persona_id = match_persona_id
 *     and 1 - (embedding <=> query_embedding) > similarity_threshold
 *   order by embedding <=> query_embedding
 *   limit match_count;
 * $$;
 */
export async function searchEpisodicMemory(
  personaId: PersonaId,
  queryEmbedding: number[],
  topK = 5,
  threshold = 0.65,
): Promise<EpisodicMemory[]> {
  const { data, error } = await db().rpc("match_episodic_memories", {
    query_embedding: queryEmbedding,
    match_persona_id: personaId,
    match_count: topK,
    similarity_threshold: threshold,
  });
  if (error) throw new Error(`searchEpisodicMemory: ${error.message}`);
  return data ?? [];
}

export async function getRecentPostsOnTopic(
  personaId: PersonaId,
  topicTag: string,
  limit = 20,
): Promise<
  Pick<
    EpisodicMemory,
    "content" | "engagement_score" | "created_at" | "platform"
  >[]
> {
  const { data, error } = await db()
    .from("episodic_memory")
    .select("content, engagement_score, created_at, platform")
    .eq("persona_id", personaId)
    .contains("topic_tags", [topicTag])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentPostsOnTopic: ${error.message}`);
  return data ?? [];
}

export async function getRecentNetworkPosts(
  excludePersona: PersonaId,
  withinHours = 48,
): Promise<EpisodicMemory[]> {
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("episodic_memory")
    .select("*")
    .neq("persona_id", excludePersona)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`getRecentNetworkPosts: ${error.message}`);
  return data ?? [];
}

export async function writeEpisodicMemory(
  record: Omit<EpisodicMemory, "id">,
): Promise<string> {
  const { data, error } = await db()
    .from("episodic_memory")
    .insert(record)
    .select("id")
    .single();
  if (error) throw new Error(`writeEpisodicMemory: ${error.message}`);
  return data.id;
}

// ─── Relational State ─────────────────────────────────────────────────────────

export async function getRelationalStates(
  personaFrom: PersonaId,
): Promise<RelationalState[]> {
  const { data, error } = await db()
    .from("relational_state")
    .select("*")
    .eq("persona_from", personaFrom);
  if (error) throw new Error(`getRelationalStates: ${error.message}`);
  return data ?? [];
}

export async function upsertRelationalState(
  state: RelationalState,
): Promise<void> {
  const { error } = await db()
    .from("relational_state")
    .upsert(state, { onConflict: "persona_from,persona_to" });
  if (error) throw new Error(`upsertRelationalState: ${error.message}`);
}

export async function applyRelationalEvent(
  event: RelationalEvent,
): Promise<void> {
  const existing = await db()
    .from("relational_state")
    .select("*")
    .eq("persona_from", event.from_persona)
    .eq("persona_to", event.to_persona)
    .maybeSingle();

  const current: RelationalState = existing.data ?? {
    persona_from: event.from_persona,
    persona_to: event.to_persona,
    trust_score: 0.5,
    tension_score: 0.5,
    recent_sentiment: "neutral",
    shared_positions: [],
    active_disputes: [],
    interaction_count: 0,
    last_interaction: new Date().toISOString(),
  };

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  let disputes = [...(current.active_disputes ?? [])];
  let shared = [...(current.shared_positions ?? [])];

  if (event.new_dispute && !disputes.includes(event.new_dispute)) {
    disputes.push(event.new_dispute);
  }
  if (event.resolved_dispute) {
    disputes = disputes.filter((d) => d !== event.resolved_dispute);
  }
  if (
    event.new_shared_position &&
    !shared.includes(event.new_shared_position)
  ) {
    shared.push(event.new_shared_position);
  }

  const updated: RelationalState = {
    ...current,
    trust_score: clamp(current.trust_score + event.trust_delta),
    tension_score: clamp(current.tension_score + event.tension_delta),
    recent_sentiment: event.new_sentiment ?? current.recent_sentiment,
    active_disputes: disputes,
    shared_positions: shared,
    interaction_count: (current.interaction_count ?? 0) + 1,
    last_interaction: new Date().toISOString(),
    recent_summary: event.summary,
  };

  await upsertRelationalState(updated);
}

// ─── Belief Evolution ─────────────────────────────────────────────────────────

export async function getBeliefEvolution(
  personaId: PersonaId,
  topicKey: string,
): Promise<BeliefEvolution[]> {
  const { data, error } = await db()
    .from("belief_evolution")
    .select("*")
    .eq("persona_id", personaId)
    .or(`topic.eq.${topicKey},topic.ilike.%${topicKey}%`)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw new Error(`getBeliefEvolution: ${error.message}`);
  return data ?? [];
}

export async function writeBeliefEvolution(
  record: Omit<BeliefEvolution, "id">,
): Promise<string> {
  const { data, error } = await db()
    .from("belief_evolution")
    .insert(record)
    .select("id")
    .single();
  if (error) throw new Error(`writeBeliefEvolution: ${error.message}`);
  return data.id;
}

// ─── Trend Queue ──────────────────────────────────────────────────────────────

export async function insertRawTrends(items: RawTrendItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await db()
    .from("trending_queue")
    .upsert(items, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`insertRawTrends: ${error.message}`);
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

export async function getExistingTrendIdentityKeys(
  items: Array<Pick<RawTrendItem, "source" | "url" | "topic" | "headline">>,
  tables: Array<"trending_queue" | "scored_trends"> = [
    "trending_queue",
    "scored_trends",
  ],
): Promise<Set<string>> {
  const urls = [...new Set(items.map((item) => item.url).filter(Boolean))];
  const topics = [...new Set(items.map((item) => item.topic).filter(Boolean))];
  const headlines = [
    ...new Set(items.map((item) => item.headline).filter(Boolean)),
  ];

  if (urls.length === 0 && topics.length === 0 && headlines.length === 0) {
    return new Set();
  }

  const queries = tables.flatMap((table) => [
    ...(urls.length > 0
      ? [db().from(table).select("source, url, topic, headline").in("url", urls)]
      : []),
    ...(topics.length > 0
      ? [
          db()
            .from(table)
            .select("source, url, topic, headline")
            .in("topic", topics),
        ]
      : []),
    ...(headlines.length > 0
      ? [
          db()
            .from(table)
            .select("source, url, topic, headline")
            .in("headline", headlines),
        ]
      : []),
  ]);

  const responses = await Promise.all(queries);
  const keys = new Set<string>();
  for (const response of responses) {
    if (response.error) {
      throw new Error(`getExistingTrendIdentityKeys: ${response.error.message}`);
    }
    for (const row of response.data ?? []) {
      for (const key of trendIdentityKeys(row as RawTrendItem)) keys.add(key);
    }
  }
  return keys;
}

export async function insertScoredTrend(
  item: ScoredTrendItem & { urgency_rank?: number; processed?: boolean },
): Promise<boolean> {
  const existing = await getExistingTrendIdentityKeys([item], ["scored_trends"]);
  if (trendIdentityKeys(item).some((key) => existing.has(key))) {
    console.log(
      `[Scoring] Skipping duplicate scored trend: "${item.topic}" (${item.source})`,
    );
    return false;
  }

  const row = { processed: false, ...item };
  const { error } = await db()
    .from("scored_trends")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`insertScoredTrend: ${error.message}`);
  return true;
}

export async function getUnprocessedTrends(
  limit = 20,
): Promise<ScoredTrendItem[]> {
  const { data, error } = await db()
    .from("scored_trends")
    .select("*")
    .eq("processed", false)
    .order("urgency_rank", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getUnprocessedTrends: ${error.message}`);
  return data ?? [];
}

export async function markTrendProcessed(trendId: string): Promise<void> {
  const { error } = await db()
    .from("scored_trends")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("id", trendId);
  if (error) throw new Error(`markTrendProcessed: ${error.message}`);
}

// ─── Review Queue ─────────────────────────────────────────────────────────────

export async function insertReviewItem(
  item: Omit<ReviewQueueItem, "id">,
): Promise<string> {
  const { data, error } = await db()
    .from("review_queue")
    .insert(item)
    .select("id")
    .single();
  if (error) throw new Error(`insertReviewItem: ${error.message}`);
  return data.id;
}

export async function getReviewItem(
  id: string,
): Promise<ReviewQueueItem | null> {
  const { data, error } = await db()
    .from("review_queue")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getReviewItem: ${error.message}`);
  return data;
}

export async function updateReviewStatus(
  id: string,
  status: ReviewStatus,
  opts?: {
    editorNotes?: string;
    finalContent?: string;
    reviewedBy?: string;
    request?: GenerationRequest;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    editor_notes: opts?.editorNotes,
    final_content: opts?.finalContent,
    reviewed_by: opts?.reviewedBy,
    reviewed_at: new Date().toISOString(),
  };
  if (opts?.request) patch.request = opts.request;

  const { error } = await db()
    .from("review_queue")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(`updateReviewStatus: ${error.message}`);
}

// ─── Published Posts ──────────────────────────────────────────────────────────

export async function insertPublishedPost(post: PublishedPost): Promise<void> {
  const { error } = await db().from("published_posts").insert(post);
  if (error) throw new Error(`insertPublishedPost: ${error.message}`);
}

// ─── Pipeline Runs ────────────────────────────────────────────────────────────

export async function startPipelineRun(runId: string): Promise<void> {
  const { error } = await db().from("pipeline_runs").insert({
    run_id: runId,
    started_at: new Date().toISOString(),
    status: "running",
    trends_fetched: 0,
    trends_scored: 0,
    items_generated: 0,
    items_queued: 0,
    errors: [],
  });
  if (error) throw new Error(`startPipelineRun: ${error.message}`);
}

export async function completePipelineRun(
  runId: string,
  stats: {
    trendsF: number;
    trendsS: number;
    generated: number;
    queued: number;
  },
  errors: Array<{ stage: string; message: string; detail?: unknown }>,
): Promise<void> {
  const { error } = await db()
    .from("pipeline_runs")
    .update({
      completed_at: new Date().toISOString(),
      status: errors.length === 0 ? "completed" : "failed",
      trends_fetched: stats.trendsF,
      trends_scored: stats.trendsS,
      items_generated: stats.generated,
      items_queued: stats.queued,
      errors,
    })
    .eq("run_id", runId);
  if (error) throw new Error(`completePipelineRun: ${error.message}`);
}
