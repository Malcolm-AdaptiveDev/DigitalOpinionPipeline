export type PipelineConfig = {
  id: string
  monthly_budget_usd: number
  runs_per_day: number
  max_trends_per_run: number
  relevance_threshold: number
  max_personas_per_trend: number
  cascade_enabled: boolean
  max_cascades_per_run: number
  avg_input_tokens_per_post: number
  avg_output_tokens_per_post: number
  input_cost_per_mtok_usd: number
  output_cost_per_mtok_usd: number
  embedding_cost_per_mtok_usd: number
  updated_by?: string
  updated_at: string
}

export type PipelineConfigLog = {
  id: string
  config_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  note?: string
  changed_by?: string
  changed_at: string
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  id: 'default',
  monthly_budget_usd: 150,
  runs_per_day: 4,
  max_trends_per_run: 2,
  relevance_threshold: 0.65,
  max_personas_per_trend: 1,
  cascade_enabled: false,
  max_cascades_per_run: 3,
  avg_input_tokens_per_post: 5200,
  avg_output_tokens_per_post: 350,
  input_cost_per_mtok_usd: 3,
  output_cost_per_mtok_usd: 15,
  embedding_cost_per_mtok_usd: 0.02,
  updated_at: new Date(0).toISOString(),
}

export function estimateMonthlyCost(config: PipelineConfig): number {
  const postsPerRun =
    config.max_trends_per_run *
    config.max_personas_per_trend +
    (config.cascade_enabled ? config.max_cascades_per_run : 0)
  const runsPerMonth = config.runs_per_day * 30
  const input = (config.avg_input_tokens_per_post * postsPerRun * runsPerMonth / 1_000_000) * config.input_cost_per_mtok_usd
  const output = (config.avg_output_tokens_per_post * postsPerRun * runsPerMonth / 1_000_000) * config.output_cost_per_mtok_usd
  const embedding = (config.avg_output_tokens_per_post * postsPerRun * runsPerMonth / 1_000_000) * config.embedding_cost_per_mtok_usd
  return input + output + embedding
}
