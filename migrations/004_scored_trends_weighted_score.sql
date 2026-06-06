alter table scored_trends
  add column if not exists tag_memory_counts jsonb not null default '{}'::jsonb,
  add column if not exists memory_score double precision not null default 0,
  add column if not exists weighted_score double precision not null default 0,
  add column if not exists approval_status text not null default 'auto_approved',
  add column if not exists approved_at timestamptz;

alter table scored_trends
  drop constraint if exists scored_trends_approval_status_check;

alter table scored_trends
  add constraint scored_trends_approval_status_check
  check (approval_status in ('auto_approved', 'approved', 'rejected', 'pending'));

create index if not exists scored_trends_approval_weight_idx
  on scored_trends (approval_status, weighted_score desc);
