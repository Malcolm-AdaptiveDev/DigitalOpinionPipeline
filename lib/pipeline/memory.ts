/**
 * memory.ts
 * Stage 3 — Memory context assembly
 *
 * Queries all 5 memory layers for a given persona + topic and returns
 * a formatted MemoryBundle ready for injection into the system prompt.
 *
 * This is the most latency-sensitive stage — all Supabase queries run
 * in parallel where possible to minimise total fetch time.
 */

import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  PersonaId,
  Platform,
  ContentPillar,
  ToneModifier,
  MemoryBundle,
  EpisodicMemory,
  RelationalState,
  BeliefEvolution,
  WorldContext,
  NetworkActivity,
  ScoredTrendItem,
} from "@/lib/pipeline/types";
import {
  searchEpisodicMemory,
  getRecentPostsOnTopic,
  getRelationalStates,
  getBeliefEvolution,
  getRecentNetworkPosts,
} from "@/lib/pipeline/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ─── Template Cache ───────────────────────────────────────────────────────────

const templateCache = new Map<PersonaId, string>();

function loadTemplate(personaId: PersonaId): string {
  if (templateCache.has(personaId)) return templateCache.get(personaId)!;
  const path = join(
    process.cwd(),
    "lib",
    "prompts",
    `${personaId}_system_prompt_template.md`,
  );
  const template = readFileSync(path, "utf-8");
  templateCache.set(personaId, template);
  return template;
}

// ─── Embedding ────────────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // Respect token limit
  });
  return res.data[0].embedding;
}

// ─── Layer 2 Formatter ────────────────────────────────────────────────────────

function formatEpisodicBlock(
  memories: EpisodicMemory[],
  positionSummary: string,
): string {
  if (memories.length === 0) {
    return "[No relevant episodic memory found. This appears to be a first post on this subject.]\n";
  }

  const lines = memories
    .map((m, i) => {
      const date = new Date(m.created_at).toDateString();
      return (
        `[Post #${i + 1} — ${m.platform.toUpperCase()} — ${date}]\n` +
        `"${m.content}"\n` +
        `Topic tags: ${m.topic_tags.join(", ")}\n` +
        `Engagement: ${m.engagement_score?.toFixed(2) ?? "unrecorded"}` +
        (m.cross_refs?.length
          ? ` | Cross-persona refs: ${m.cross_refs.length}`
          : "")
      );
    })
    .join("\n\n");

  return `${lines}\n\n### Position summary on this topic\n${positionSummary}`;
}

async function buildPositionSummary(
  personaId: PersonaId,
  topicTag: string,
): Promise<string> {
  const posts = await getRecentPostsOnTopic(personaId, topicTag, 20);
  if (posts.length === 0) return "No prior posts on this topic found.";

  const avg =
    posts.reduce((s, p) => s + (p.engagement_score ?? 0), 0) / posts.length;
  const last = new Date(posts[0].created_at).toDateString();
  const excerpt = posts[0].content.slice(0, 150);

  return (
    `Topic addressed ${posts.length} time(s). Last: ${last}. ` +
    `Avg engagement: ${avg.toFixed(2)}. ` +
    `Most recent stance: "${excerpt}${posts[0].content.length > 150 ? "..." : ""}"`
  );
}

// ─── Layer 3 Formatter ────────────────────────────────────────────────────────

function formatRelationalBlock(
  state: RelationalState | null,
  targetPersona: PersonaId,
): string {
  if (!state) {
    return (
      `Trust: 0.50/1.0\nTension: 0.50/1.0\nCurrent sentiment: neutral\n` +
      `Active disputes: none recorded\nShared positions: none recorded\n` +
      `Interaction count: 0\nRecent summary: No interaction history yet.`
    );
  }

  const lastDate = state.last_interaction
    ? new Date(state.last_interaction).toDateString()
    : "never";

  return (
    `Trust: ${state.trust_score.toFixed(2)}/1.0\n` +
    `Tension: ${state.tension_score.toFixed(2)}/1.0\n` +
    `Current sentiment: ${state.recent_sentiment}\n` +
    `Active disputes: ${state.active_disputes?.join(", ") || "none"}\n` +
    `Shared positions: ${state.shared_positions?.join(", ") || "none"}\n` +
    `Interaction count: ${state.interaction_count ?? 0}\n` +
    `Last interaction: ${lastDate}\n` +
    (state.recent_summary ? `Recent summary: ${state.recent_summary}` : "")
  );
}

// ─── Layer 4 Formatter ────────────────────────────────────────────────────────

export function buildWorldContext(
  item: ScoredTrendItem,
  personaId: PersonaId,
): WorldContext {
  const hoursAgo = Math.round(
    (Date.now() - new Date(item.published_at).getTime()) / 3600000,
  );

  const { pillar, platform } = suggestPillarAndPlatform(item, personaId);

  return {
    trending_topic: item.topic,
    source_name: item.source,
    url: item.url,
    published_at: item.published_at,
    hours_ago: hoursAgo,
    summary: item.raw_content.slice(0, 400),
    relevance: `Relevance score for ${personaId}: ${item.relevance_scores[personaId].toFixed(2)}`,
    related_signals: item.tags,
    suggested_pillar: pillar,
    suggested_platform: platform,
    urgency: item.urgency,
  };
}

// Re-use the pillar/platform logic from ingestion without circular import
function suggestPillarAndPlatform(
  item: ScoredTrendItem,
  personaId: PersonaId,
): { pillar: ContentPillar; platform: Platform } {
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

function formatWorldContextBlock(
  world: WorldContext,
  network: NetworkActivity[],
): string {
  const worldLines =
    `Trending topic: ${world.trending_topic}\n` +
    `Source: ${world.source_name} — ${world.url}\n` +
    `Published: ${world.published_at} (${world.hours_ago}h ago)\n` +
    `Summary: ${world.summary}\n` +
    `Relevance: ${world.relevance}\n` +
    `Related signals: ${world.related_signals.join("; ")}\n` +
    `Suggested pillar: ${world.suggested_pillar}\n` +
    `Urgency: ${world.urgency}`;

  const networkLines =
    network.length === 0
      ? "No recent posts from other personas in the last 48 hours."
      : "Recent posts by other personas (last 48h):\n" +
        network
          .map(
            (a) =>
              `- ${a.persona.charAt(0).toUpperCase() + a.persona.slice(1)} ` +
              `[${a.platform}, ${a.hours_ago}h ago]: "${a.excerpt}" — ${a.topic_tag}`,
          )
          .join("\n");

  return `${worldLines}\n\n### Network activity\n${networkLines}`;
}

// ─── Layer 5 Formatter ────────────────────────────────────────────────────────

function formatBeliefBlock(evolutions: BeliefEvolution[]): string {
  if (evolutions.length === 0) {
    return "No belief evolution recorded for this topic. Apply your default position.\n";
  }

  return evolutions
    .map((e, i) => {
      const date = new Date(e.created_at).toDateString();
      return (
        `[Belief shift #${i + 1}]\n` +
        `Topic: ${e.topic}\n` +
        `Previous position (${date}): "${e.prev_position}"\n` +
        `Trigger: "${e.trigger_event_summary}"\n` +
        `Current position: "${e.new_position}"\n` +
        `Confidence change: ${e.confidence_delta >= 0 ? "+" : ""}${e.confidence_delta.toFixed(2)}\n` +
        `Publicly acknowledged: ${e.public_acknowledgment ? "yes" : "no"}` +
        (e.public_acknowledgment && e.acknowledgment_excerpt
          ? `\nAcknowledged in: "${e.acknowledgment_excerpt}"`
          : "")
      );
    })
    .join("\n\n");
}

// ─── Network Activity Builder ─────────────────────────────────────────────────

async function buildNetworkActivity(
  excludePersona: PersonaId,
): Promise<NetworkActivity[]> {
  const recentPosts = await getRecentNetworkPosts(excludePersona, 48);

  return recentPosts.map((post) => ({
    persona: post.persona_id as PersonaId,
    platform: post.platform as Platform,
    hours_ago: Math.round(
      (Date.now() - new Date(post.created_at).getTime()) / 3600000,
    ),
    excerpt:
      post.content.slice(0, 120) + (post.content.length > 120 ? "..." : ""),
    topic_tag: post.topic_tags?.[0] ?? "general",
    post_id: post.id,
  }));
}

// ─── Main: Assemble Full Memory Bundle ───────────────────────────────────────

export async function assembleMemoryBundle(
  personaId: PersonaId,
  topic: string,
): Promise<MemoryBundle> {
  const topicKey = topic
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  // All DB fetches in parallel for minimum latency
  const queryEmbedding = await embedText(topic);

  const [episodic, relationalAll, beliefs, networkPosts, positionSummary] =
    await Promise.all([
      searchEpisodicMemory(personaId, queryEmbedding, 5, 0.65),
      getRelationalStates(personaId),
      getBeliefEvolution(personaId, topicKey),
      buildNetworkActivity(personaId),
      buildPositionSummary(personaId, topicKey),
    ]);

  // Index relational states by target persona
  const relByPersona: Record<PersonaId, RelationalState | null> = {
    nova: null,
    cynic: null,
    oracle: null,
    rebel: null,
    sage: null,
  };
  for (const state of relationalAll) {
    relByPersona[state.persona_to as PersonaId] = state;
  }

  return {
    personaId,
    topic,
    episodic,
    positionSummary,
    relational: relByPersona,
    beliefEvolution: beliefs,
    assembledAt: new Date().toISOString(),
  };
}

// ─── Template Injection ───────────────────────────────────────────────────────

export interface PromptAssemblyOptions {
  personaId: PersonaId;
  bundle: MemoryBundle;
  worldContext: WorldContext;
  networkActivity: NetworkActivity[];
  platform: Platform;
  pillar: ContentPillar;
  targetLength: string;
  toneModifier: ToneModifier;
  crossTagPersona?: PersonaId;
  disclosureRequired: boolean;
}

export interface AssembledPrompt {
  systemPrompt: string;
  estimatedTokens: number;
  layersLoaded: string[];
  warnings: string[];
}

export function assemblePrompt(opts: PromptAssemblyOptions): AssembledPrompt {
  const warnings: string[] = [];
  const layersLoaded: string[] = ["L1_identity"];

  const template = loadTemplate(opts.personaId);

  // L2 check
  if (opts.bundle.episodic.length === 0) {
    warnings.push("L2: No episodic memory found for topic.");
  }
  layersLoaded.push("L2_episodic");

  // L3 check
  const missingRelational = (
    ["nova", "cynic", "oracle", "rebel", "sage"] as PersonaId[]
  ).filter((p) => p !== opts.personaId && !opts.bundle.relational[p]);
  if (missingRelational.length > 0) {
    warnings.push(
      `L3: Missing relational state for: ${missingRelational.join(", ")}`,
    );
  }
  layersLoaded.push("L3_relational");
  layersLoaded.push("L4_world");

  // L5 check
  if (opts.bundle.beliefEvolution.length === 0) {
    warnings.push("L5: No belief evolution records — using default position.");
  }
  layersLoaded.push("L5_belief_evolution");

  // Format each block
  const episodicBlock = formatEpisodicBlock(
    opts.bundle.episodic,
    opts.bundle.positionSummary,
  );
  const worldBlock = formatWorldContextBlock(
    opts.worldContext,
    opts.networkActivity,
  );
  const beliefBlock = formatBeliefBlock(opts.bundle.beliefEvolution);

  // Build relational replacements for all 4 other personas
  const otherPersonas = (
    ["nova", "cynic", "oracle", "rebel", "sage"] as PersonaId[]
  ).filter((p) => p !== opts.personaId);

  const relationalReplacements: Record<string, string> = {};
  const pid = opts.personaId.toUpperCase();

  for (const other of otherPersonas) {
    const oid = other.toUpperCase();
    const state = opts.bundle.relational[other];
    const block = formatRelationalBlock(state, other);
    const prefix = `${pid}_${oid}`;

    relationalReplacements[`${prefix}_TRUST`] =
      state?.trust_score.toFixed(2) ?? "0.50";
    relationalReplacements[`${prefix}_TENSION`] =
      state?.tension_score.toFixed(2) ?? "0.50";
    relationalReplacements[`${prefix}_SENTIMENT`] =
      state?.recent_sentiment ?? "neutral";
    relationalReplacements[`${prefix}_DISPUTES`] =
      state?.active_disputes?.join(", ") || "none";
    relationalReplacements[`${prefix}_SHARED`] =
      state?.shared_positions?.join(", ") || "none";
    relationalReplacements[`${prefix}_RECENT`] =
      state?.recent_summary ?? "No recent interaction.";
  }

  // All replacements
  const replacements: Record<string, string> = {
    EPISODIC_MEMORY_BLOCK: episodicBlock,
    POSITION_SUMMARY: opts.bundle.positionSummary,
    WORLD_CONTEXT_BLOCK: worldBlock,
    NETWORK_ACTIVITY_BLOCK: "", // Embedded in worldBlock
    BELIEF_EVOLUTION_BLOCK: beliefBlock,
    TARGET_PLATFORM: opts.platform,
    CONTENT_PILLAR: opts.pillar,
    TARGET_LENGTH: opts.targetLength,
    CROSS_TAG_REQUIRED: opts.crossTagPersona ? "yes" : "no",
    TAG_TARGET: opts.crossTagPersona ?? "none",
    DISCLOSURE_REQUIRED: opts.disclosureRequired ? "yes" : "no",
    TONE_MODIFIER: opts.toneModifier,
    ...relationalReplacements,
  };

  // Inject all placeholders
  let systemPrompt = template;
  for (const [key, value] of Object.entries(replacements)) {
    systemPrompt = systemPrompt.split(`{{${key}}}`).join(value);
  }

  const estimatedTokens = Math.round(systemPrompt.length / 4);
  if (estimatedTokens > 6000) {
    warnings.push(
      `Token budget warning: ~${estimatedTokens} tokens. ` +
        `Consider reducing episodic topK or truncating world context.`,
    );
  }

  return { systemPrompt, estimatedTokens, layersLoaded, warnings };
}
