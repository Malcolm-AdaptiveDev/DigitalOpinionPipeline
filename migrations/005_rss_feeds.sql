-- ============================================================================
-- migrations/005_rss_feeds.sql
-- RSS feed management table.
-- Stores the dynamic list of RSS sources used by the ingestion pipeline.
-- Replaces the static RSS_SOURCES array in ingestion.ts as source-of-truth.
-- ============================================================================

create table if not exists rss_feeds (
  id                   uuid         primary key default gen_random_uuid(),
  url                  text         not null unique,
  name                 text         not null,
  source               text         not null check (source in ('rss_news', 'hackernews', 'reddit', 'x_trending', 'google_trends')),
  tags                 text[]       not null default '{}',
  is_active            boolean      not null default true,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  last_checked_at      timestamptz,
  last_health_status   text         not null default 'unknown' check (last_health_status in ('ok', 'error', 'timeout', 'unknown')),
  last_health_error    text,
  consecutive_failures int          not null default 0,
  auto_disabled        boolean      not null default false,
  notes                text
);

create index if not exists rss_feeds_active_idx
  on rss_feeds (is_active, source);

create index if not exists rss_feeds_health_idx
  on rss_feeds (last_health_status, last_checked_at desc);

-- Seed from the static list that was previously hardcoded in ingestion.ts
insert into rss_feeds (url, name, source, tags) values
  ('https://techcrunch.com/feed/',                             'TechCrunch',          'rss_news',   array['tech', 'startups', 'ai', 'venture']),
  ('https://feeds.reuters.com/reuters/technologyNews',          'Reuters Technology',  'rss_news',   array['tech', 'business', 'global']),
  ('https://feeds.arstechnica.com/arstechnica/index',           'Ars Technica',        'rss_news',   array['tech', 'science', 'policy']),
  ('https://www.wired.com/feed/rss',                           'Wired',               'rss_news',   array['culture', 'tech', 'future']),
  ('https://feeds.bloomberg.com/technology/news.rss',          'Bloomberg Tech',      'rss_news',   array['finance', 'tech', 'markets']),
  ('https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 'NYT Technology',  'rss_news',   array['tech', 'society', 'policy']),
  ('https://hnrss.org/frontpage',                              'Hacker News',         'hackernews', array['tech', 'programming', 'startups', 'ai'])
on conflict (url) do nothing;

alter table rss_feeds enable row level security;

drop policy if exists "service_role_all" on rss_feeds;
create policy "service_role_all" on rss_feeds for all using (auth.role() = 'service_role');
