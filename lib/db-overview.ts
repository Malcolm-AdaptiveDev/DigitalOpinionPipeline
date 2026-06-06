import { createClient } from '@supabase/supabase-js'
import { getMockHomeStats, getMockPipelineConfig, isMockMode } from '@/lib/mock-data'

export type DbConnectionStatus = {
  connected: boolean
  mode: 'live' | 'mock'
  checkedAt: string
  message: string
  latencyMs?: number
}

export type DbOverviewCounts = {
  review_queue: number
  published_posts: number
  episodic_memory: number
  trending_queue: number
  scored_trends: number
  pipeline_runs: number
  pipeline_config_log: number
  pending_reviews: number
  unprocessed_trends: number
}

export type DbOverview = {
  status: DbConnectionStatus
  counts: DbOverviewCounts
}

const ZERO_COUNTS: DbOverviewCounts = {
  review_queue: 0,
  published_posts: 0,
  episodic_memory: 0,
  trending_queue: 0,
  scored_trends: 0,
  pipeline_runs: 0,
  pipeline_config_log: 0,
  pending_reviews: 0,
  unprocessed_trends: 0,
}

function mockOverview(): DbOverview {
  const stats = getMockHomeStats()
  const config = getMockPipelineConfig()
  return {
    status: {
      connected: true,
      mode: 'mock',
      checkedAt: new Date().toISOString(),
      message: 'Mock data store active',
      latencyMs: 0,
    },
    counts: {
      ...ZERO_COUNTS,
      review_queue: stats.queue.length,
      published_posts: stats.posts.length,
      episodic_memory: 3,
      trending_queue: 4,
      scored_trends: 4,
      pipeline_runs: 1,
      pipeline_config_log: config.log.length,
      pending_reviews: stats.counts.pending,
      unprocessed_trends: 2,
    },
  }
}

async function countTable(
  sb: { from: (table: string) => any },
  table: keyof DbOverviewCounts,
  filter?: (query: any) => any,
): Promise<[keyof DbOverviewCounts, number]> {
  let query = sb.from(table).select('*', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count, error } = await query
  if (error) throw error
  return [table, count ?? 0]
}

export async function getDbOverview(mockMode = false): Promise<DbOverview> {
  if (isMockMode(mockMode)) return mockOverview()

  const start = Date.now()
  try {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    const entries = await Promise.all([
      countTable(sb, 'review_queue'),
      countTable(sb, 'published_posts'),
      countTable(sb, 'episodic_memory'),
      countTable(sb, 'trending_queue'),
      countTable(sb, 'scored_trends'),
      countTable(sb, 'pipeline_runs'),
      countTable(sb, 'pipeline_config_log'),
      countTable(sb, 'review_queue', query => query.eq('status', 'pending')).then(([, count]) => ['pending_reviews', count] as const),
      countTable(sb, 'scored_trends', query => query.eq('processed', false)).then(([, count]) => ['unprocessed_trends', count] as const),
    ])

    return {
      status: {
        connected: true,
        mode: 'live',
        checkedAt: new Date().toISOString(),
        message: 'Supabase service-role connection healthy',
        latencyMs: Date.now() - start,
      },
      counts: {
        ...ZERO_COUNTS,
        ...Object.fromEntries(entries),
      },
    }
  } catch (err) {
    return {
      status: {
        connected: false,
        mode: 'live',
        checkedAt: new Date().toISOString(),
        message: (err as Error).message,
        latencyMs: Date.now() - start,
      },
      counts: ZERO_COUNTS,
    }
  }
}
