-- ============================================================================
-- migrations/001_initial_schema.sql
-- Complete Supabase schema for the 5-persona real-time trending pipeline.
-- Run in Supabase SQL editor or via supabase db push.
-- ============================================================================

-- Enable pgvector extension (required for episodic memory semantic search)
create extension if not exists vector;

-- ─── Layer 1: Persona Identity ───────────────────────────────────────────────
-- Static config — loaded as system prompt foundation. Rarely updated.

create table if not exists persona_identity (
  persona_id        text primary key,              -- nova | cynic | oracle | rebel | sage
  core_values       jsonb         not null default '[]',
  biases            jsonb         not null default '[]',
  linguistic_rules  jsonb         not null default '{}',  -- {must: [], never: [], banned_words: []}
  platform_tones    jsonb         not null default '{}',  -- per-platform voice notes
  system_prompt_v   text,                          -- Compiled system prompt, versioned
  updated_at        timestamptz   not null default now()
);

-- Seed the five personas
insert into persona_identity (persona_id) values
  ('nova'), ('cynic'), ('oracle'), ('rebel'), ('sage')
on conflict (persona_id) do nothing;

-- ─── Layer 2: Episodic Memory ─────────────────────────────────────────────────

create table if not exists episodic_memory (
  id               uuid          primary key default gen_random_uuid(),
  persona_id       text          not null references persona_identity(persona_id),
  memory_type      text          not null check (memory_type in ('post','interaction','position_taken','prediction')),
  content          text          not null,
  embedding        vector(1536),                   -- text-embedding-3-small output
  topic_tags       text[]        not null default '{}',
  platform         text          not null,
  cross_refs       uuid[]        not null default '{}',
  engagement_score float         not null default 0,
  created_at       timestamptz   not null default now()
);

-- Index for vector similarity search
create index if not exists episodic_memory_embedding_idx
  on episodic_memory
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for persona + recency queries
create index if not exists episodic_memory_persona_created_idx
  on episodic_memory (persona_id, created_at desc);

-- Index for topic tag array queries
create index if not exists episodic_memory_tags_idx
  on episodic_memory using gin (topic_tags);

-- RPC function for pgvector semantic search (required by db.ts)
create or replace function match_episodic_memories(
  query_embedding     vector(1536),
  match_persona_id    text,
  match_count         int,
  similarity_threshold float
)
returns table (
  id               uuid,
  persona_id       text,
  memory_type      text,
  content          text,
  topic_tags       text[],
  platform         text,
  cross_refs       uuid[],
  engagement_score float,
  created_at       timestamptz,
  similarity       float
)
language sql stable as $$
  select
    id, persona_id, memory_type, content,
    topic_tags, platform, cross_refs,
    engagement_score, created_at,
    1 - (embedding <=> query_embedding) as similarity
  from episodic_memory
  where
    persona_id = match_persona_id
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Layer 3: Relational State ────────────────────────────────────────────────

create table if not exists relational_state (
  persona_from      text          not null references persona_identity(persona_id),
  persona_to        text          not null references persona_identity(persona_id),
  trust_score       float         not null default 0.5 check (trust_score   between 0 and 1),
  tension_score     float         not null default 0.5 check (tension_score between 0 and 1),
  recent_sentiment  text          not null default 'neutral'
    check (recent_sentiment in ('warm','neutral-warm','neutral','cool','hostile','alliance')),
  shared_positions  text[]        not null default '{}',
  active_disputes   text[]        not null default '{}',
  interaction_count int           not null default 0,
  last_interaction  timestamptz,
  recent_summary    text,
  primary key (persona_from, persona_to),
  check (persona_from <> persona_to)
);

-- Seed all 20 directional pairs (5×4) with neutral defaults
insert into relational_state (persona_from, persona_to)
select a.persona_id, b.persona_id
from   persona_identity a
cross  join persona_identity b
where  a.persona_id <> b.persona_id
on conflict do nothing;

-- ─── Layer 5: Belief Evolution ────────────────────────────────────────────────

create table if not exists belief_evolution (
  id                      uuid          primary key default gen_random_uuid(),
  persona_id              text          not null references persona_identity(persona_id),
  topic                   text          not null,
  prev_position           text          not null,
  trigger_event_id        uuid          references episodic_memory(id),
  trigger_event_summary   text          not null,
  new_position            text          not null,
  confidence_delta        float         not null default 0,
  public_acknowledgment   boolean       not null default false,
  acknowledgment_excerpt  text,
  created_at              timestamptz   not null default now()
);

create index if not exists belief_evolution_persona_topic_idx
  on belief_evolution (persona_id, topic, created_at desc);

-- ─── Trend Pipeline Tables ────────────────────────────────────────────────────

create table if not exists trending_queue (
  id           text          primary key,   -- UUID from ingestion
  source       text          not null,
  topic        text          not null,
  headline     text          not null,
  url          text,
  published_at timestamptz   not null,
  raw_content  text          not null,
  tags         text[]        not null default '{}',
  fetched_at   timestamptz   not null default now()
);

create index if not exists trending_queue_fetched_idx
  on trending_queue (fetched_at desc);

create table if not exists scored_trends (
  id                text          primary key,
  source            text          not null,
  topic             text          not null,
  headline          text          not null,
  url               text,
  published_at      timestamptz   not null,
  raw_content       text          not null,
  tags              text[]        not null default '{}',
  fetched_at        timestamptz   not null,
  relevance_scores  jsonb         not null default '{}',
  urgency           text          not null check (urgency in ('high','medium','low')),
  urgency_rank      int           not null,
  assigned_personas text[]        not null default '{}',
  network_event     boolean       not null default false,
  processed         boolean       not null default false,
  processed_at      timestamptz
);

create index if not exists scored_trends_unprocessed_idx
  on scored_trends (processed, urgency_rank)
  where processed = false;

-- ─── Review Queue ─────────────────────────────────────────────────────────────

create table if not exists review_queue (
  id            uuid          primary key default gen_random_uuid(),
  generation    jsonb         not null,    -- GenerationResult (serialised)
  request       jsonb         not null,    -- GenerationRequest (serialised)
  status        text          not null default 'pending'
    check (status in ('pending','approved','edited','rejected')),
  editor_notes  text,
  final_content text,
  reviewed_by   text,
  reviewed_at   timestamptz,
  queued_at     timestamptz   not null default now(),
  publish_after timestamptz
);

create index if not exists review_queue_status_idx
  on review_queue (status, queued_at desc);

-- ─── Published Posts ──────────────────────────────────────────────────────────

create table if not exists published_posts (
  id                uuid          primary key default gen_random_uuid(),
  review_item_id    uuid          references review_queue(id),
  persona           text          not null references persona_identity(persona_id),
  platform          text          not null,
  content           text          not null,
  platform_post_id  text,
  published_at      timestamptz   not null default now(),
  topic_tags        text[]        not null default '{}',
  cross_refs        uuid[]        not null default '{}',
  belief_shift      jsonb
);

create index if not exists published_posts_persona_idx
  on published_posts (persona, published_at desc);

-- ─── Pipeline Runs ────────────────────────────────────────────────────────────

create table if not exists pipeline_runs (
  run_id           text          primary key,
  started_at       timestamptz   not null,
  completed_at     timestamptz,
  status           text          not null default 'running'
    check (status in ('running','completed','failed')),
  trends_fetched   int           not null default 0,
  trends_scored    int           not null default 0,
  items_generated  int           not null default 0,
  items_queued     int           not null default 0,
  errors           jsonb         not null default '[]'
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Lock down all tables — only the service key can read/write.
-- The Retool dashboard should use the service key, NOT the anon key.

alter table persona_identity   enable row level security;
alter table episodic_memory    enable row level security;
alter table relational_state   enable row level security;
alter table belief_evolution   enable row level security;
alter table trending_queue     enable row level security;
alter table scored_trends      enable row level security;
alter table review_queue       enable row level security;
alter table published_posts    enable row level security;
alter table pipeline_runs      enable row level security;

-- Service-role bypass (Supabase service key has this role automatically)
create policy "service_role_all" on persona_identity  for all using (auth.role() = 'service_role');
create policy "service_role_all" on episodic_memory   for all using (auth.role() = 'service_role');
create policy "service_role_all" on relational_state  for all using (auth.role() = 'service_role');
create policy "service_role_all" on belief_evolution  for all using (auth.role() = 'service_role');
create policy "service_role_all" on trending_queue    for all using (auth.role() = 'service_role');
create policy "service_role_all" on scored_trends     for all using (auth.role() = 'service_role');
create policy "service_role_all" on review_queue      for all using (auth.role() = 'service_role');
create policy "service_role_all" on published_posts   for all using (auth.role() = 'service_role');
create policy "service_role_all" on pipeline_runs     for all using (auth.role() = 'service_role');
