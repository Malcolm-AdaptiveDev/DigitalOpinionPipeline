-- ============================================================================
-- migrations/005_admin_clear_queues.sql
-- Adds 'outdated' status for admin queue clearing.
-- ============================================================================

-- ─── review_queue: add 'outdated' status ─────────────────────────────────────

alter table review_queue
  drop constraint if exists review_queue_status_check;

alter table review_queue
  add constraint review_queue_status_check
  check (status in ('pending', 'approved', 'edited', 'rejected', 'outdated', 'unapproved'));

-- ─── scored_trends: add 'outdated' approval_status ───────────────────────────

alter table scored_trends
  drop constraint if exists scored_trends_approval_status_check;

alter table scored_trends
  add constraint scored_trends_approval_status_check
  check (approval_status in ('auto_approved', 'approved', 'rejected', 'pending', 'outdated'));

-- ─── trending_queue: add queue_status column ─────────────────────────────────

alter table trending_queue
  add column if not exists queue_status text not null default 'active'
  check (queue_status in ('active', 'outdated'));

create index if not exists trending_queue_status_fetched_idx
  on trending_queue (queue_status, fetched_at desc);
