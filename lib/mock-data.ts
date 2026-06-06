import type { GenerationRequest, GenerationResult, ReviewStatus, ScoredTrendItem } from '@/lib/pipeline/types'
import { DEFAULT_PIPELINE_CONFIG, type PipelineConfig, type PipelineConfigLog } from '@/lib/pipeline/config-shared'

export type MockReviewRow = {
  id: string
  generation: GenerationResult
  request: GenerationRequest
  status: ReviewStatus
  final_content?: string
  editor_notes?: string
  reviewed_by?: string
  reviewed_at?: string
  queued_at: string
}

export type MockPublishedPost = {
  persona: string
  platform: string
  content: string
  published_at: string
  topic_tags: string[]
}

type MockStore = {
  version: number
  reviewQueue: MockReviewRow[]
  publishedPosts: MockPublishedPost[]
  episodicMemory: Array<{ persona_id: string; topic_tags: string[] }>
  lastRun: {
    run_id: string
    started_at: string
    completed_at: string
    status: 'completed'
    trends_fetched: number
    trends_scored: number
    items_generated: number
    items_queued: number
    errors: Array<{ stage: string; message: string }>
  }
  pipelineConfig: PipelineConfig
  pipelineConfigLog: PipelineConfigLog[]
  latestTrends: ScoredTrendItem[]
}

const now = Date.now()
const MOCK_STORE_VERSION = 3

function iso(minutesAgo: number): string {
  return new Date(now - minutesAgo * 60_000).toISOString()
}

function request(
  persona: GenerationRequest['persona'],
  topic: string,
  topicTags: string[],
  pillar: GenerationRequest['pillar'],
  platform: GenerationRequest['platform'],
): GenerationRequest {
  return {
    persona,
    topic,
    topicTags,
    worldContext: {
      trending_topic: topic,
      source_name: 'mock-feed',
      url: 'https://example.test/mock-trend',
      published_at: iso(120),
      hours_ago: 2,
      summary: `Mock context for ${topic}.`,
      relevance: 'Seeded debug item for dashboard and review testing.',
      related_signals: topicTags,
      suggested_pillar: pillar,
      suggested_platform: platform,
      urgency: 'medium',
    },
    networkActivity: [],
    platform,
    pillar,
    targetLength: 'short',
    toneModifier: 'none',
    disclosureRequired: false,
    triggeredBy: 'manual',
  }
}

function generation(
  requestId: string,
  persona: GenerationResult['persona'],
  platform: GenerationResult['platform'],
  pillar: GenerationResult['pillar'],
  content: string,
  warnings: string[] = [],
): GenerationResult {
  return {
    requestId,
    persona,
    platform,
    pillar,
    content,
    estimatedTokens: Math.ceil(content.length / 4),
    layersLoaded: ['world_context', 'episodic_memory', 'relational_state'],
    warnings,
    generatedAt: iso(45),
    modelVersion: 'mock-local',
  }
}

function trend(
  id: string,
  topic: string,
  tags: string[],
  weightedScore: number,
  memoryCounts: Record<string, number>,
  minutesAgo: number,
): ScoredTrendItem {
  return {
    id,
    source: id.includes('hn') ? 'hackernews' : 'rss_news',
    topic,
    headline: topic,
    url: `https://example.test/trends/${id}`,
    published_at: iso(minutesAgo),
    raw_content: `Mock latest trend for ${topic}.`,
    tags,
    fetched_at: iso(2),
    relevance_scores: {
      nova: weightedScore,
      cynic: Math.max(0.2, weightedScore - 0.2),
      oracle: Math.max(0.2, weightedScore - 0.1),
      rebel: Math.max(0.2, weightedScore - 0.25),
      sage: Math.max(0.2, weightedScore - 0.3),
    },
    urgency: minutesAgo < 60 ? 'high' : minutesAgo < 240 ? 'medium' : 'low',
    assigned_personas: weightedScore > 0.72 ? ['nova', 'oracle'] : ['oracle'],
    network_event: weightedScore > 0.72,
    tag_memory_counts: memoryCounts,
    memory_score: Math.min(1, Object.values(memoryCounts).reduce((sum, count) => sum + count, 0) / 10),
    weighted_score: weightedScore,
    approval_status: 'auto_approved',
    approved_at: iso(1),
  }
}

function createSeedStore(): MockStore {
  const pendingReq = request('nova', 'open model releases and developer trust', ['open_models', 'developer_trust', 'ai_infra'], 'breakthrough', 'x')
  const approvedReq = request('oracle', 'semiconductor export policy signals', ['semiconductors', 'policy', 'supply_chain'], 'signal_report', 'linkedin')
  const editedReq = request('rebel', 'creator economy platform fatigue', ['creator_economy', 'platform_fatigue', 'media'], 'callout', 'threads')
  const rejectedReq = request('cynic', 'startup valuation rebound narrative', ['startups', 'valuation', 'market_cycle'], 'cold_read', 'x')

  const reviewQueue: MockReviewRow[] = [
    {
      id: 'mock-pending-open-models',
      generation: generation(
        'mock-gen-pending',
        'nova',
        'x',
        'breakthrough',
        'Open model releases are becoming less about benchmark victory laps and more about whether developers can actually reason about the system they are adopting.\n\nThe trust layer is shifting from "how capable is it?" to "can I inspect enough of it to build responsibly?"',
      ),
      request: pendingReq,
      status: 'pending',
      queued_at: iso(12),
    },
    {
      id: 'mock-approved-semiconductors',
      generation: generation(
        'mock-gen-approved',
        'oracle',
        'linkedin',
        'signal_report',
        'The semiconductor signal is not one policy headline. It is the accumulation of constraints: export controls, packaging capacity, power availability, and customer concentration. The model says dispersion matters more than drama here.',
      ),
      request: approvedReq,
      status: 'approved',
      reviewed_by: 'mock-operator',
      reviewed_at: iso(35),
      queued_at: iso(80),
    },
    {
      id: 'mock-edited-creator-fatigue',
      generation: generation(
        'mock-gen-edited',
        'rebel',
        'threads',
        'callout',
        'Creator platforms keep calling burnout a workflow problem because the actual problem would require them to make less money from churn.',
        ['Tone may be sharper than platform target.'],
      ),
      request: editedReq,
      status: 'edited',
      final_content: 'Creator platforms keep selling burnout as a workflow problem. It is cleaner branding than admitting the business model rewards churn.',
      editor_notes: 'Softened the ending; kept the critique.',
      reviewed_by: 'mock-operator',
      reviewed_at: iso(90),
      queued_at: iso(145),
    },
    {
      id: 'mock-rejected-valuation-cycle',
      generation: generation(
        'mock-gen-rejected',
        'cynic',
        'x',
        'cold_read',
        'Apparently the valuation rebound is definitely rational this time, because everyone agreed to stop looking at the denominator.',
      ),
      request: rejectedReq,
      status: 'rejected',
      editor_notes: 'Too glib for the current queue.',
      reviewed_by: 'mock-operator',
      reviewed_at: iso(180),
      queued_at: iso(220),
    },
  ]

  return {
    version: MOCK_STORE_VERSION,
    reviewQueue,
    publishedPosts: [
      {
        persona: 'oracle',
        platform: 'linkedin',
        content: reviewQueue[1].generation.content,
        published_at: iso(30),
        topic_tags: approvedReq.topicTags ?? [],
      },
      {
        persona: 'rebel',
        platform: 'threads',
        content: reviewQueue[2].final_content ?? reviewQueue[2].generation.content,
        published_at: iso(86),
        topic_tags: editedReq.topicTags ?? [],
      },
    ],
    episodicMemory: [
      { persona_id: 'nova', topic_tags: ['open_models', 'ai_infra'] },
      { persona_id: 'oracle', topic_tags: ['semiconductors', 'policy'] },
      { persona_id: 'sage', topic_tags: ['creator_economy'] },
    ],
    lastRun: {
      run_id: 'mock-run-20260606',
      started_at: iso(20),
      completed_at: iso(18),
      status: 'completed',
      trends_fetched: 8,
      trends_scored: 6,
      items_generated: 4,
      items_queued: 4,
      errors: [],
    },
    pipelineConfig: {
      ...DEFAULT_PIPELINE_CONFIG,
      updated_by: 'mock-operator',
      updated_at: iso(15),
    },
    pipelineConfigLog: [
      {
        id: 'mock-log-relevance',
        config_id: 'default',
        field_name: 'relevance_threshold',
        old_value: 0.32,
        new_value: DEFAULT_PIPELINE_CONFIG.relevance_threshold,
        note: 'Seeded mock change for testing.',
        changed_by: 'mock-operator',
        changed_at: iso(15),
      },
    ],
    latestTrends: [
      trend('mock-trend-open-models', 'Open model releases shift toward inspectable AI infrastructure', ['ai', 'open_models', 'ai_infra'], 0.91, { ai: 2, open_models: 1, ai_infra: 1 }, 22),
      trend('mock-trend-semiconductor-policy', 'New semiconductor export rules reshape advanced packaging demand', ['semiconductors', 'policy', 'supply_chain'], 0.84, { semiconductors: 1, policy: 1, supply_chain: 0 }, 75),
      trend('mock-hn-agent-tools', 'Developers push agent tools toward local-first workflows', ['tech', 'programming', 'ai'], 0.77, { tech: 0, programming: 0, ai: 2 }, 130),
      trend('mock-trend-creator-platforms', 'Creator platforms test new monetization rules as fatigue rises', ['creator_economy', 'platform_fatigue', 'media'], 0.69, { creator_economy: 1, platform_fatigue: 0, media: 0 }, 230),
    ],
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __personaPipelineMockStore: MockStore | undefined
}

function store(): MockStore {
  if (
    !globalThis.__personaPipelineMockStore?.pipelineConfig ||
    globalThis.__personaPipelineMockStore.version !== MOCK_STORE_VERSION
  ) {
    globalThis.__personaPipelineMockStore = createSeedStore()
  }
  return globalThis.__personaPipelineMockStore
}

export function isMockMode(enabled?: boolean): boolean {
  return enabled === true || process.env.MOCK_PIPELINE === 'true' || process.env.PIPELINE_DATA_SOURCE === 'mock'
}

export function resetMockStore(): MockStore {
  globalThis.__personaPipelineMockStore = createSeedStore()
  return store()
}

export function getMockReviewRows(status: string): MockReviewRow[] {
  return store()
    .reviewQueue
    .filter(item => item.status === status)
    .sort((a, b) => new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime())
}

export function getMockReviewCounts() {
  const counts = { pending: 0, approved: 0, edited: 0, rejected: 0 }
  const byPersona: Record<string, number> = {}

  for (const item of store().reviewQueue) {
    counts[item.status]++
    byPersona[item.generation.persona] = (byPersona[item.generation.persona] ?? 0) + 1
  }

  return { counts, byPersona }
}

export function getMockMemoryTagSets(topicTags: string[]) {
  const memoryTagsByPersona = new Set<string>()
  const memoryTagsAny = new Set<string>()

  for (const memory of store().episodicMemory) {
    for (const tag of memory.topic_tags) {
      if (!topicTags.includes(tag)) continue
      memoryTagsByPersona.add(`${memory.persona_id}:${tag}`)
      memoryTagsAny.add(tag)
    }
  }

  return { memoryTagsByPersona, memoryTagsAny }
}

export function getMockHomeStats() {
  const { counts, byPersona } = getMockReviewCounts()
  return {
    counts,
    byPersona,
    posts: store().publishedPosts,
    lastRun: store().lastRun,
    queue: store().reviewQueue,
  }
}

export function getMockPipelineConfig() {
  return {
    config: store().pipelineConfig,
    log: store().pipelineConfigLog,
  }
}

export function updateMockPipelineConfig(
  patch: Partial<PipelineConfig>,
  opts: { changedBy?: string; note?: string } = {},
) {
  const current = store().pipelineConfig
  const changedAt = new Date().toISOString()
  const next = { ...current, ...patch, updated_by: opts.changedBy, updated_at: changedAt }

  for (const [field, newValue] of Object.entries(patch)) {
    const oldValue = current[field as keyof PipelineConfig]
    if (oldValue === newValue) continue
    store().pipelineConfigLog.unshift({
      id: `mock-log-${field}-${Date.now()}`,
      config_id: 'default',
      field_name: field,
      old_value: oldValue,
      new_value: newValue,
      note: opts.note,
      changed_by: opts.changedBy,
      changed_at: changedAt,
    })
  }

  store().pipelineConfig = next
  return getMockPipelineConfig()
}

export function getMockLatestTrends(limit = 12): ScoredTrendItem[] {
  return store()
    .latestTrends
    .slice()
    .sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0))
    .slice(0, limit)
}

export function approveMockLatestTrends(ids?: string[]) {
  const selected = ids?.length
    ? store().latestTrends.filter(item => ids.includes(item.id))
    : store().latestTrends

  for (const item of selected) {
    item.approval_status = 'approved'
    item.approved_at = new Date().toISOString()
  }

  return selected
}

export function handleMockReviewAction(body: {
  reviewItemId: string
  status?: string
  finalContent?: string
  editorNotes?: string
  reviewedBy?: string
  topicTags?: string[]
}) {
  const item = store().reviewQueue.find(row => row.id === body.reviewItemId)
  if (!item) throw new Error(`Mock review item not found: ${body.reviewItemId}`)
  if (item.status !== 'pending') return item

  item.reviewed_by = body.reviewedBy ?? 'mock-operator'
  item.reviewed_at = new Date().toISOString()
  item.editor_notes = body.editorNotes

  if (body.topicTags) {
    item.request = { ...item.request, topicTags: body.topicTags }
  }

  if (body.status === 'rejected') {
    item.status = 'rejected'
    return item
  }

  if (body.finalContent) {
    item.status = 'edited'
    item.final_content = body.finalContent
  } else {
    item.status = 'approved'
  }

  store().publishedPosts.unshift({
    persona: item.generation.persona,
    platform: item.generation.platform,
    content: item.final_content ?? item.generation.content,
    published_at: item.reviewed_at,
    topic_tags: item.request.topicTags ?? [],
  })

  store().episodicMemory.push({
    persona_id: item.generation.persona,
    topic_tags: item.request.topicTags ?? [],
  })

  return item
}
