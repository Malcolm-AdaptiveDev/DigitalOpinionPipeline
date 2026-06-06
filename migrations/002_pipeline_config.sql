create table if not exists pipeline_config (
  id                         text primary key default 'default',
  monthly_budget_usd         numeric not null default 150,
  runs_per_day               int     not null default 4,
  max_trends_per_run          int     not null default 2,
  relevance_threshold         numeric not null default 0.65,
  max_personas_per_trend      int     not null default 1,
  cascade_enabled             boolean not null default false,
  max_cascades_per_run        int     not null default 3,
  avg_input_tokens_per_post   int     not null default 5200,
  avg_output_tokens_per_post  int     not null default 350,
  input_cost_per_mtok_usd     numeric not null default 3,
  output_cost_per_mtok_usd    numeric not null default 15,
  embedding_cost_per_mtok_usd numeric not null default 0.02,
  updated_by                 text,
  updated_at                 timestamptz not null default now()
);

create table if not exists pipeline_config_log (
  id            uuid primary key default gen_random_uuid(),
  config_id     text not null default 'default',
  field_name    text not null,
  old_value     jsonb,
  new_value     jsonb,
  note          text,
  changed_by    text,
  changed_at    timestamptz not null default now()
);

insert into pipeline_config (id) values ('default')
on conflict (id) do nothing;

create index if not exists pipeline_config_log_changed_idx
  on pipeline_config_log (changed_at desc);

alter table pipeline_config enable row level security;
alter table pipeline_config_log enable row level security;

drop policy if exists "service_role_all" on pipeline_config;
drop policy if exists "service_role_all" on pipeline_config_log;
create policy "service_role_all" on pipeline_config for all using (auth.role() = 'service_role');
create policy "service_role_all" on pipeline_config_log for all using (auth.role() = 'service_role');
