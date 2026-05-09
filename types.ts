/**
 * types.ts
 * Shared types for the 5-persona real-time trending pipeline.
 * All other modules import from here — single source of truth.
 */

// ─── Personas ─────────────────────────────────────────────────────────────────

export type PersonaId = 'nova' | 'cynic' | 'oracle' | 'rebel' | 'sage'

export const ALL_PERSONAS: PersonaId[] = ['nova', 'cynic', 'oracle', 'rebel', 'sage']

export const PERSONA_COLORS: Record<PersonaId, string> = {
  nova:   '#7F77DD',
  cynic:  '#D85A30',
  oracle: '#378ADD',
  rebel:  '#D4537E',
  sage:   '#1D9E75',
}

// ─── Trend Ingestion ──────────────────────────────────────────────────────────

export type TrendUrgency = 'high' | 'medium' | 'low'
export type TrendSource  = 'x_trending' | 'google_trends' | 'rss_news' | 'hackernews' | 'reddit'

export interface RawTrendItem {
  id:           string
  source:       TrendSource
  topic:        string
  headline:     string
  url:          string
  published_at: string         // ISO 8601
  raw_content:  string         // Full article text / tweet / post
  tags:         string[]       // Auto-extracted topic tags
  fetched_at:   string         // When the pipeline ingested it
}

export interface ScoredTrendItem extends RawTrendItem {
  relevance_scores:  Record<PersonaId, number>  // 0–1 per persona
  urgency:           TrendUrgency
  assigned_personas: PersonaId[]                 // Those above threshold
  network_event:     boolean                     // True if 2+ personas assigned
}

// ─── Memory Layers ────────────────────────────────────────────────────────────

export interface EpisodicMemory {
  id:               string
  persona_id:       PersonaId
  memory_type:      'post' | 'interaction' | 'position_taken' | 'prediction'
  content:          string
  embedding?:       number[]    // 1536-dim vector (not returned from most queries)
  topic_tags:       string[]
  platform:         Platform
  cross_refs:       string[]    // UUIDs of related episodic_memory rows
  engagement_score: number
  created_at:       string
}

export type Sentiment = 'warm' | 'neutral-warm' | 'neutral' | 'cool' | 'hostile' | 'alliance'

export interface RelationalState {
  persona_from:      PersonaId
  persona_to:        PersonaId
  trust_score:       number    // 0–1
  tension_score:     number    // 0–1
  recent_sentiment:  Sentiment
  shared_positions:  string[]
  active_disputes:   string[]
  interaction_count: number
  last_interaction:  string
  recent_summary?:   string
}

export interface BeliefEvolution {
  id:                      string
  persona_id:              PersonaId
  topic:                   string
  prev_position:           string
  trigger_event_id:        string
  trigger_event_summary:   string
  new_position:            string
  confidence_delta:        number
  public_acknowledgment:   boolean
  acknowledgment_excerpt?: string
  created_at:              string
}

// ─── Memory Context Bundle (assembled for generation) ─────────────────────────

export interface MemoryBundle {
  personaId:        PersonaId
  topic:            string
  episodic:         EpisodicMemory[]
  positionSummary:  string
  relational:       Record<PersonaId, RelationalState | null>
  beliefEvolution:  BeliefEvolution[]
  assembledAt:      string
}

// ─── World Context (Layer 4) ──────────────────────────────────────────────────

export interface WorldContext {
  trending_topic:    string
  source_name:       string
  url:               string
  published_at:      string
  hours_ago:         number
  summary:           string
  relevance:         string
  related_signals:   string[]
  suggested_pillar:  ContentPillar
  suggested_platform: Platform
  urgency:           TrendUrgency
}

export interface NetworkActivity {
  persona:    PersonaId
  platform:   Platform
  hours_ago:  number
  excerpt:    string
  topic_tag:  string
  post_id:    string
}

// ─── Content Generation ───────────────────────────────────────────────────────

export type Platform =
  | 'x'
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'linkedin'
  | 'substack'
  | 'threads'

export type ContentPillar =
  | 'breakthrough'
  | 'reframe'
  | 'builder_spotlight'
  | 'future_vision'
  | 'human_moment'
  | 'debunk'
  | 'follow_the_money'
  | 'history_repeating'
  | 'cold_read'
  | 'reluctant_credit'
  | 'signal_report'
  | 'the_model'
  | 'scorecard'
  | 'overlooked_number'
  | 'arbiter'
  | 'callout'
  | 'culture_read'
  | 'creator_spotlight'
  | 'manifesto'
  | 'moment_of_softness'
  | 'morning_question'
  | 'text_and_now'
  | 'mediation'
  | 'weekly_letter'
  | 'long_silence'
  | 'reactive'

export type ToneModifier = 'none' | 'more_warm' | 'more_sharp' | 'more_reflective'

export interface GenerationRequest {
  persona:           PersonaId
  topic:             string
  worldContext:      WorldContext
  networkActivity:   NetworkActivity[]
  platform:          Platform
  pillar:            ContentPillar
  targetLength:      string
  toneModifier:      ToneModifier
  crossTagPersona?:  PersonaId
  disclosureRequired: boolean
  triggeredBy:       'trend' | 'scheduled' | 'cross_persona' | 'manual'
  trendItemId?:      string
}

export interface GenerationResult {
  requestId:      string
  persona:        PersonaId
  platform:       Platform
  pillar:         ContentPillar
  content:        string
  estimatedTokens: number
  layersLoaded:   string[]
  warnings:       string[]
  generatedAt:    string
  modelVersion:   string
}

// ─── Review Queue ─────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'edited' | 'rejected'

export interface ReviewQueueItem {
  id:              string
  generation:      GenerationResult
  request:         GenerationRequest
  status:          ReviewStatus
  editor_notes?:   string
  final_content?:  string   // If edited, the approved version
  reviewed_by?:    string
  reviewed_at?:    string
  queued_at:       string
  publish_after?:  string   // Optional scheduled publish time
}

// ─── Post-Publish Record ──────────────────────────────────────────────────────

export interface PublishedPost {
  review_item_id:      string
  persona:             PersonaId
  platform:            Platform
  content:             string
  platform_post_id?:   string   // ID returned from platform API
  published_at:        string
  topic_tags:          string[]
  cross_refs:          string[]
  belief_shift?:       {
    topic:             string
    prev_position:     string
    new_position:      string
    confidence_delta:  number
    public_acknowledgment: boolean
  }
}

// ─── Relational Event ─────────────────────────────────────────────────────────

export interface RelationalEvent {
  from_persona:         PersonaId
  to_persona:           PersonaId
  event_type:           'debate' | 'credit' | 'alliance' | 'mediation' | 'challenge' | 'support'
  trust_delta:          number
  tension_delta:        number
  new_sentiment?:       Sentiment
  new_dispute?:         string
  resolved_dispute?:    string
  new_shared_position?: string
  summary:              string
  trigger_post_ids:     string[]
}

// ─── Pipeline Run ─────────────────────────────────────────────────────────────

export interface PipelineRun {
  run_id:           string
  started_at:       string
  completed_at?:    string
  trends_fetched:   number
  trends_scored:    number
  items_generated:  number
  items_queued:     number
  errors:           PipelineError[]
  status:           'running' | 'completed' | 'failed'
}

export interface PipelineError {
  stage:    string
  message:  string
  detail?:  unknown
  at:       string
}
