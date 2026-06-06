import { db } from '@/lib/pipeline/db'
import {
  DEFAULT_PIPELINE_CONFIG as SHARED_DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
  type PipelineConfigLog,
} from '@/lib/pipeline/config-shared'

export type { PipelineConfig, PipelineConfigLog } from '@/lib/pipeline/config-shared'

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  ...SHARED_DEFAULT_PIPELINE_CONFIG,
  monthly_budget_usd: Number(process.env.PIPELINE_MONTHLY_BUDGET_USD ?? SHARED_DEFAULT_PIPELINE_CONFIG.monthly_budget_usd),
  runs_per_day: Number(process.env.PIPELINE_RUNS_WITH_GENERATION_PER_DAY ?? process.env.PIPELINE_RUNS_PER_DAY ?? SHARED_DEFAULT_PIPELINE_CONFIG.runs_per_day),
  max_trends_per_run: Number(process.env.PIPELINE_MAX_ITEMS_PER_RUN ?? process.env.PIPELINE_MAX_TRENDS_PER_RUN ?? SHARED_DEFAULT_PIPELINE_CONFIG.max_trends_per_run),
  relevance_threshold: Number(process.env.PIPELINE_RELEVANCE_THRESHOLD ?? SHARED_DEFAULT_PIPELINE_CONFIG.relevance_threshold),
  max_personas_per_trend: Number(process.env.PIPELINE_MAX_PERSONAS_PER_ITEM ?? process.env.PIPELINE_MAX_PERSONAS_PER_TREND ?? SHARED_DEFAULT_PIPELINE_CONFIG.max_personas_per_trend),
  cascade_enabled: (process.env.PIPELINE_ENABLE_CASCADES ?? process.env.PIPELINE_CASCADE_ENABLED) === undefined
    ? SHARED_DEFAULT_PIPELINE_CONFIG.cascade_enabled
    : (process.env.PIPELINE_ENABLE_CASCADES ?? process.env.PIPELINE_CASCADE_ENABLED) !== 'false',
  max_cascades_per_run: Number(process.env.PIPELINE_MAX_CASCADES_PER_RUN ?? SHARED_DEFAULT_PIPELINE_CONFIG.max_cascades_per_run),
  avg_input_tokens_per_post: Number(process.env.PIPELINE_AVG_INPUT_TOKENS ?? SHARED_DEFAULT_PIPELINE_CONFIG.avg_input_tokens_per_post),
  avg_output_tokens_per_post: Number(process.env.PIPELINE_AVG_OUTPUT_TOKENS ?? SHARED_DEFAULT_PIPELINE_CONFIG.avg_output_tokens_per_post),
  input_cost_per_mtok_usd: Number(process.env.PIPELINE_INPUT_COST_PER_MTOK_USD ?? SHARED_DEFAULT_PIPELINE_CONFIG.input_cost_per_mtok_usd),
  output_cost_per_mtok_usd: Number(process.env.PIPELINE_OUTPUT_COST_PER_MTOK_USD ?? SHARED_DEFAULT_PIPELINE_CONFIG.output_cost_per_mtok_usd),
  embedding_cost_per_mtok_usd: Number(process.env.PIPELINE_EMBEDDING_COST_PER_MTOK_USD ?? SHARED_DEFAULT_PIPELINE_CONFIG.embedding_cost_per_mtok_usd),
}

const CONFIG_FIELDS = Object.keys(DEFAULT_PIPELINE_CONFIG).filter(
  key => !['id', 'updated_by', 'updated_at'].includes(key),
) as Array<keyof PipelineConfig>

function coerceConfig(row: Record<string, unknown> | null | undefined): PipelineConfig {
  if (!row) return DEFAULT_PIPELINE_CONFIG
  return {
    ...DEFAULT_PIPELINE_CONFIG,
    ...row,
    monthly_budget_usd: Number(row.monthly_budget_usd),
    runs_per_day: Number(row.runs_per_day),
    max_trends_per_run: Number(row.max_trends_per_run),
    relevance_threshold: Number(row.relevance_threshold),
    max_personas_per_trend: Number(row.max_personas_per_trend),
    cascade_enabled: Boolean(row.cascade_enabled),
    max_cascades_per_run: Number(row.max_cascades_per_run),
    avg_input_tokens_per_post: Number(row.avg_input_tokens_per_post),
    avg_output_tokens_per_post: Number(row.avg_output_tokens_per_post),
    input_cost_per_mtok_usd: Number(row.input_cost_per_mtok_usd),
    output_cost_per_mtok_usd: Number(row.output_cost_per_mtok_usd),
    embedding_cost_per_mtok_usd: Number(row.embedding_cost_per_mtok_usd),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function getPipelineConfig(): Promise<PipelineConfig> {
  try {
    const { data, error } = await db()
      .from('pipeline_config')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()
    if (error) throw error
    return coerceConfig(data)
  } catch (err) {
    console.warn('[PipelineConfig] Falling back to env defaults:', (err as Error).message)
    return DEFAULT_PIPELINE_CONFIG
  }
}

export async function getPipelineConfigLog(limit = 25): Promise<PipelineConfigLog[]> {
  const { data, error } = await db()
    .from('pipeline_config_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`getPipelineConfigLog: ${error.message}`)
  return data ?? []
}

export async function updatePipelineConfig(
  patch: Partial<PipelineConfig>,
  opts: { changedBy?: string; note?: string } = {},
): Promise<PipelineConfig> {
  const current = await getPipelineConfig()
  const next: Record<string, unknown> = {
    id: 'default',
    updated_by: opts.changedBy,
    updated_at: new Date().toISOString(),
  }

  const logRows: Array<Record<string, unknown>> = []
  for (const field of CONFIG_FIELDS) {
    if (!(field in patch)) continue
    const newValue = patch[field]
    if (newValue === undefined || current[field] === newValue) continue
    next[field] = newValue
    logRows.push({
      config_id: 'default',
      field_name: field,
      old_value: current[field] as unknown,
      new_value: newValue as unknown,
      note: opts.note,
      changed_by: opts.changedBy,
    })
  }

  if (Object.keys(next).length > 3) {
    const { error } = await db()
      .from('pipeline_config')
      .upsert(next, { onConflict: 'id' })
    if (error) throw new Error(`updatePipelineConfig: ${error.message}`)
  }

  if (logRows.length > 0) {
    const { error } = await db().from('pipeline_config_log').insert(logRows)
    if (error) throw new Error(`pipeline_config_log: ${error.message}`)
  }

  return getPipelineConfig()
}
