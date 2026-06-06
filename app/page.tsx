import { createClient }   from '@supabase/supabase-js'
import Link               from 'next/link'
import type { CSSProperties } from 'react'
import { PipelineShell }  from '@/components/pipeline-shell'
import { AutoRefresh }    from '@/components/auto-refresh'
import { getMockHomeStats, getMockPipelineConfig, isMockMode } from '@/lib/mock-data'
import { getPipelineConfig } from '@/lib/pipeline/config'
import { estimateMonthlyCost, type PipelineConfig } from '@/lib/pipeline/config-shared'

export const revalidate = 30

const PERSONA_COLOR: Record<string, string> = {
  nova: '#7F77DD', cynic: '#D85A30', oracle: '#378ADD', rebel: '#D4537E', sage: '#1D9E75',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

async function getStats(mockMode: boolean) {
  if (mockMode) {
    const stats = getMockHomeStats()
    return { ...stats, config: getMockPipelineConfig().config }
  }

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const [queueRes, postsRes, runRes, configRes] = await Promise.allSettled([
    sb.from('review_queue').select('status, generation, queued_at'),
    sb.from('published_posts').select('persona, platform, content, published_at, topic_tags').order('published_at', { ascending: false }).limit(8),
    sb.from('pipeline_runs').select('*').order('started_at', { ascending: false }).limit(1).single(),
    getPipelineConfig(),
  ])

  const queue   = queueRes.status   === 'fulfilled' ? queueRes.value.data   ?? [] : []
  const posts   = postsRes.status   === 'fulfilled' ? postsRes.value.data   ?? [] : []
  const lastRun = runRes.status     === 'fulfilled' ? runRes.value.data     : null
  const config  = configRes.status  === 'fulfilled' ? configRes.value      : await getPipelineConfig()

  const counts = { pending: 0, approved: 0, edited: 0, rejected: 0 }
  const byPersona: Record<string, number> = {}
  for (const row of queue) {
    const r = row as { status: string; generation: { persona: string } }
    const s = r.status as keyof typeof counts
    if (s in counts) counts[s]++
    const p = r.generation?.persona
    if (p) byPersona[p] = (byPersona[p] ?? 0) + 1
  }

  return { counts, byPersona, posts, lastRun, config, queue }
}

function estimateActualSpend(queue: Array<{ generation?: { estimatedTokens?: number }; queued_at?: string }>, config: PipelineConfig): number {
  const month = new Date().getMonth()
  const year = new Date().getFullYear()
  const tokens = queue
    .filter(item => {
      const date = item.queued_at ? new Date(item.queued_at) : new Date()
      return date.getMonth() === month && date.getFullYear() === year
    })
    .reduce((sum, item) => sum + (item.generation?.estimatedTokens ?? 0), 0)
  const blendedCost = (config.input_cost_per_mtok_usd + config.output_cost_per_mtok_usd) / 2
  return (tokens / 1_000_000) * blendedCost
}

export default async function Home({
  searchParams,
}: {
  searchParams?: { mock?: string }
}) {
  const mockMode = isMockMode(searchParams?.mock === '1')
  const mockQuery = mockMode ? '?mock=1' : ''
  const mockParam = mockMode ? '&mock=1' : ''
  const { counts, byPersona, posts, lastRun, config, queue = [] } = await getStats(mockMode)
  const totalPending = counts.pending
  const projectedMonthlyCost = estimateMonthlyCost(config)
  const actualSpend = estimateActualSpend(queue as Array<{ generation?: { estimatedTokens?: number }; queued_at?: string }>, config)

  const metricCard = (
    label: string,
    value: number | string,
    sub: string,
    href: string,
    accent?: string
  ) => {
    const borderColor = accent ? `${accent}55` : '#222'
    const hoverBorderColor = accent ?? '#444'

    return (
      <Link
        href={href}
        className="metric-card-link"
        style={{
          '--metric-border-color': borderColor,
          '--metric-hover-border-color': hoverBorderColor,
        } as CSSProperties}
      >
        <div className="metric-card" style={{
        background:   '#171a22',
        border:       '0.5px solid var(--metric-border-color)',
        borderRadius: 14,
        padding:      '16px 18px',
        cursor:       'pointer',
        transition:   'border-color 0.2s',
        }}>
          <div style={{ fontSize: 12, color: '#9aa3b2', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 600, color: accent ?? '#edf0f6', lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: '#8892a3', marginTop: 6 }}>{sub}</div>
        </div>
      </Link>
    )
  }

  return (
    <PipelineShell active="dashboard">
      <style>{`
        .metric-card-link {
          text-decoration: none;
        }

        .metric-card-link:hover .metric-card {
          border-color: var(--metric-hover-border-color);
        }
      `}</style>
      <AutoRefresh intervalMs={30000} />

      {mockMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(55,138,221,0.12)',
          border: '0.5px solid rgba(158,200,255,0.35)',
          borderRadius: 14,
          padding: '12px 16px',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          <span style={{ fontSize: 13, color: '#9EC8FF' }}>Mock server mode is using seeded review, memory, and published-post data.</span>
          <Link href="/" style={{ fontSize: 12, color: '#9EC8FF', textDecoration: 'none' }}>Use live data</Link>
        </div>
      )}

      {totalPending > 0 && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          background:     'linear-gradient(90deg, rgba(239,159,39,0.12), rgba(29,158,117,0.08))',
          border:         '0.5px solid rgba(239,159,39,0.4)',
          borderRadius:   14,
          padding:        '14px 18px',
          marginBottom:   '1.75rem',
          flexWrap:       'wrap',
          gap:            12,
        }}>
          <div>
            <span style={{ fontWeight: 500, color: '#EF9F27', fontSize: 14 }}>
              {totalPending} post{totalPending !== 1 ? 's' : ''} awaiting review
            </span>
            <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>
              New items generated and ready for operator approval.
            </span>
          </div>
          <Link href={`/dashboard${mockQuery}`} style={{
            background:     '#EF9F27',
            color:          '#111',
            padding:        '8px 16px',
            borderRadius:   20,
            fontSize:       13,
            fontWeight:     500,
            textDecoration: 'none',
          }}>
            Review now →
          </Link>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
        background: '#171a22',
        border: `0.5px solid ${projectedMonthlyCost > config.monthly_budget_usd ? '#EF9F27' : '#2a2f3a'}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#9aa3b2', marginBottom: 4 }}>Actual spend this month</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#edf0f6' }}>{money(actualSpend)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#9aa3b2', marginBottom: 4 }}>Projected monthly cost</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: projectedMonthlyCost > config.monthly_budget_usd ? '#EF9F27' : '#7FE0BA' }}>
            {money(projectedMonthlyCost)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#9aa3b2', marginBottom: 4 }}>Budget</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#edf0f6' }}>{money(config.monthly_budget_usd)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Link href={`/dashboard?tab=budget${mockParam}`} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: '#10131a',
            border: '0.5px solid #303744',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#9EC8FF',
            fontSize: 13,
            textDecoration: 'none',
          }}>
            <i className="ti ti-adjustments-dollar" aria-hidden="true" />
            Edit budget settings
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        {metricCard('Pending review', counts.pending, 'awaiting approval', `/dashboard${mockQuery}`, counts.pending > 0 ? '#EF9F27' : undefined)}
        {metricCard('Approved', counts.approved, 'ready to publish', `/dashboard?status=approved&persona=all${mockParam}`, '#1D9E75')}
        {metricCard('Published', counts.edited + counts.approved, 'total processed', `/dashboard?status=approved&persona=all${mockParam}`)}
        {metricCard('Last run generated', lastRun?.items_generated ?? '—', `${lastRun?.trends_scored ?? 0} trends scored`, `/${mockQuery}`)}
      </div>

      {lastRun && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Last pipeline run
          </div>
          <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{
                fontSize:     12,
                padding:      '2px 10px',
                borderRadius: 20,
                background:   lastRun.status === 'completed' ? '#1D9E7522' : lastRun.status === 'running' ? '#378ADD22' : '#E24B4A22',
                color:        lastRun.status === 'completed' ? '#1D9E75'   : lastRun.status === 'running' ? '#378ADD'   : '#E24B4A',
              }}>
                {lastRun.status}
              </span>
              <span style={{ fontSize: 12, color: '#444' }}>{timeAgo(lastRun.started_at)}</span>
              <span style={{ fontSize: 11, color: '#333', marginLeft: 'auto' }}>{lastRun.run_id?.slice(0, 8)}…</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                ['Fetched',   lastRun.trends_fetched],
                ['Scored',    lastRun.trends_scored],
                ['Generated', lastRun.items_generated],
                ['Queued',    lastRun.items_queued],
              ].map(([l, v]) => (
                <div key={l as string} style={{ background: '#10131a', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#9aa3b2', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#e5e8ef' }}>{v}</div>
                </div>
              ))}
            </div>
            {lastRun.errors?.length > 0 && (
              <div style={{ marginTop: 10, background: '#1a0a0a', borderRadius: 8, padding: '8px 12px' }}>
                {lastRun.errors.slice(0, 2).map((e: { stage: string; message: string }, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: '#666' }}>
                    <span style={{ color: '#aa4444' }}>{e.stage}:</span> {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Persona breakdown
          </div>
          <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: '14px 16px' }}>
            {['nova', 'cynic', 'oracle', 'rebel', 'sage'].map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #1a1a1a' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: PERSONA_COLOR[p], flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: PERSONA_COLOR[p], textTransform: 'capitalize', minWidth: 52 }}>{p}</span>
                <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width:        `${Math.min(100, ((byPersona[p] ?? 0) / Math.max(1, Math.max(...Object.values(byPersona)))) * 100)}%`,
                    height:       '100%',
                    background:   PERSONA_COLOR[p],
                    borderRadius: 2,
                    transition:   'width 0.4s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: '#555', minWidth: 24, textAlign: 'right' }}>{byPersona[p] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Next action
          </div>
          <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: '16px' }}>
            {counts.pending > 0 ? (
              <>
                <div style={{ fontSize: 14, color: '#ccc', marginBottom: 6 }}>
                  <span style={{ color: '#EF9F27', fontWeight: 600 }}>{counts.pending} posts</span> are ready for review.
                </div>
                <div style={{ fontSize: 13, color: '#a5adba', marginBottom: 16 }}>
                  Start with the highest-scoring trend items. Approving a post triggers the full memory write — episodic memory, relational state, and belief evolution all update automatically.
                </div>
                <Link href={`/dashboard${mockQuery}`} style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            8,
                  background:     '#1a1a1a',
                  border:         '0.5px solid #333',
                  borderRadius:   20,
                  padding:        '8px 16px',
                  fontSize:       13,
                  color:          '#ccc',
                  textDecoration: 'none',
                }}>
                  Open review queue →
                </Link>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#444' }}>
                No pending posts. The pipeline will generate new items on the next 15-minute cycle, or invoke manually from Inngest.
              </div>
            )}
          </div>
        </div>

      </div>

      {posts.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Recent published posts
          </div>
          <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: '14px 16px' }}>
            {posts.map((p: { persona: string; platform: string; content: string; published_at: string; topic_tags?: string[] }, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < posts.length - 1 ? '0.5px solid #1a1a1a' : 'none' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: PERSONA_COLOR[p.persona] ?? '#444', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: PERSONA_COLOR[p.persona] ?? '#888', textTransform: 'capitalize' }}>{p.persona}</span>
                    <span style={{ fontSize: 11, color: '#c1c7d0', background: '#10131a', padding: '1px 7px', borderRadius: 6 }}>{p.platform}</span>
                    <span style={{ fontSize: 11, color: '#333', marginLeft: 'auto' }}>{timeAgo(p.published_at)}</span>
                  </div>
                  {p.topic_tags && p.topic_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                      {p.topic_tags.slice(0, 5).map(tag => (
                        <span key={tag} style={{
                          fontSize: 11,
                          color: '#9EC8FF',
                          background: 'rgba(55,138,221,0.14)',
                          border: '0.5px solid rgba(158,200,255,0.3)',
                          borderRadius: 7,
                          padding: '2px 7px',
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#c1c7d0', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {p.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#252525', textAlign: 'center', marginTop: '2rem' }}>
        Auto-refreshes every 30s · {new Date().toUTCString()}
      </div>
    </PipelineShell>
  )
}
