import { NextRequest, NextResponse } from 'next/server'
import { getPipelineConfig, getPipelineConfigLog, updatePipelineConfig, type PipelineConfig } from '@/lib/pipeline/config'
import { getMockPipelineConfig, isMockMode, updateMockPipelineConfig } from '@/lib/mock-data'

const NUMERIC_LIMITS: Partial<Record<keyof PipelineConfig, [number, number]>> = {
  monthly_budget_usd: [1, 10000],
  runs_per_day: [1, 20],
  max_trends_per_run: [1, 20],
  relevance_threshold: [0.01, 1],
  max_personas_per_trend: [1, 20],
  max_cascades_per_run: [0, 20],
  avg_input_tokens_per_post: [100, 20000],
  avg_output_tokens_per_post: [50, 5000],
  input_cost_per_mtok_usd: [0, 100],
  output_cost_per_mtok_usd: [0, 200],
  embedding_cost_per_mtok_usd: [0, 10],
}

function sanitizePatch(input: Record<string, unknown>): Partial<PipelineConfig> {
  const patch: Partial<PipelineConfig> = {}

  for (const [field, [min, max]] of Object.entries(NUMERIC_LIMITS) as Array<[keyof PipelineConfig, [number, number]]>) {
    if (!(field in input)) continue
    const value = Number(input[field])
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${field} must be between ${min} and ${max}`)
    }
    ;(patch as Record<string, number>)[field] = field.includes('threshold') || field.includes('cost') || field.includes('budget')
      ? value
      : Math.round(value)
  }

  if ('cascade_enabled' in input) {
    patch.cascade_enabled = Boolean(input.cascade_enabled)
  }

  return patch
}

export async function GET(req: NextRequest) {
  const mockMode = isMockMode(req.nextUrl.searchParams.get('mock') === '1')

  if (mockMode) {
    const { config, log } = getMockPipelineConfig()
    return NextResponse.json({ config, log, mockMode: true })
  }

  const [config, log] = await Promise.all([
    getPipelineConfig(),
    getPipelineConfigLog(),
  ])
  return NextResponse.json({ config, log, mockMode: false })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const mockMode = isMockMode(Boolean(body.mockMode))
    const patch = sanitizePatch(body.config ?? {})
    const changedBy = String(body.changedBy || 'operator')
    const note = body.note ? String(body.note) : undefined

    if (mockMode) {
      const { config, log } = updateMockPipelineConfig(patch, { changedBy, note })
      return NextResponse.json({ config, log, mockMode: true })
    }

    const config = await updatePipelineConfig(patch, { changedBy, note })
    const log = await getPipelineConfigLog()
    return NextResponse.json({ config, log, mockMode: false })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
