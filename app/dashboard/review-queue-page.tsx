import { createClient }   from '@supabase/supabase-js'
import Link               from 'next/link'
import { PipelineShell }  from '@/components/pipeline-shell'
import { ReviewActions }  from './review-actions'
import { AutoRefresh }    from '@/components/auto-refresh'
import { getMockMemoryTagSets, getMockReviewCounts, getMockReviewRows, isMockMode } from '@/lib/mock-data'
import { BudgetEditor }   from './budget-editor'

export const revalidate = 0

const PERSONA_COLOR: Record<string, string> = {
  nova: '#7F77DD', cynic: '#D85A30', oracle: '#378ADD', rebel: '#D4537E', sage: '#1D9E75',
}

const PLATFORM_ICON: Record<string, string> = {
  x: 'ti-brand-x', tiktok: 'ti-brand-tiktok', instagram: 'ti-brand-instagram',
  youtube: 'ti-brand-youtube', linkedin: 'ti-brand-linkedin',
  substack: 'ti-mail', threads: 'ti-at',
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#EF9F27', approved: '#1D9E75', edited: '#7F77DD', rejected: '#E24B4A',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type ReviewRow = {
  id: string
  generation: { persona: string; platform: string; pillar: string; content: string; generatedAt: string; estimatedTokens: number; warnings: string[] }
  request:    { topic: string; topicTags?: string[]; triggeredBy: string }
  status:     string
  final_content?: string
  editor_notes?:  string
  queued_at:      string
}

function normalizeTopicTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map(tag => tag.trim().toLowerCase().replace(/\s+/g, '_'))
        .filter(Boolean),
    ),
  ).slice(0, 10)
}

function topicTagsForRequest(request?: ReviewRow['request']): string[] {
  if (!request) return []
  return normalizeTopicTags([
    ...(request.topicTags ?? []),
    ...(request.topic ?? '').split(/\s+/).filter(word => word.length > 3),
  ])
}

async function getData(status: string, mockMode: boolean) {
  if (mockMode) {
    const items = getMockReviewRows(status)
    const { counts, byPersona } = getMockReviewCounts()
    const topicTags = Array.from(new Set(items.flatMap(row => topicTagsForRequest(row.request))))
    const { memoryTagsByPersona, memoryTagsAny } = getMockMemoryTagSets(topicTags)
    return { items, counts, byPersona, memoryTagsByPersona, memoryTagsAny }
  }

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

  const [itemsRes, allRes] = await Promise.allSettled([
    sb.from('review_queue').select('*').eq('status', status).order('queued_at', { ascending: false }).limit(50),
    sb.from('review_queue').select('status, generation'),
  ])

  const items = itemsRes.status === 'fulfilled' ? itemsRes.value.data ?? [] : []
  const all   = allRes.status   === 'fulfilled' ? allRes.value.data   ?? [] : []
  const topicTags = Array.from(new Set(items.flatMap(row => topicTagsForRequest((row as ReviewRow).request))))
  const memoryTagsByPersona = new Set<string>()
  const memoryTagsAny = new Set<string>()

  if (topicTags.length > 0) {
    const memoryRes = await sb
      .from('episodic_memory')
      .select('persona_id, topic_tags')
      .overlaps('topic_tags', topicTags)
      .limit(500)

    for (const row of memoryRes.data ?? []) {
      const memory = row as { persona_id: string; topic_tags: string[] }
      for (const tag of memory.topic_tags ?? []) {
        if (!topicTags.includes(tag)) continue
        memoryTagsByPersona.add(`${memory.persona_id}:${tag}`)
        memoryTagsAny.add(tag)
      }
    }
  }

  const counts    = { pending: 0, approved: 0, edited: 0, rejected: 0 }
  const byPersona: Record<string, number> = {}

  for (const row of all) {
    const r = row as { status: string; generation: { persona: string } }
    const s = r.status as keyof typeof counts
    if (s in counts) counts[s]++
    const p = r.generation?.persona
    if (p) byPersona[p] = (byPersona[p] ?? 0) + 1
  }

  return { items, counts, byPersona, memoryTagsByPersona, memoryTagsAny }
}

export async function ReviewQueuePage({
  searchParams,
  routeBase = '/dashboard',
}: {
  searchParams?: { status?: string; persona?: string; tab?: string; mock?: string }
  routeBase?: string
}) {
  const activeStatus  = searchParams?.status  ?? 'pending'
  const activePersona = searchParams?.persona ?? 'all'
  const activeTab = searchParams?.tab === 'budget' ? 'budget' : 'queue'
  const mockMode = isMockMode(searchParams?.mock === '1')
  const mockParam = mockMode ? '&mock=1' : ''
  const mockQuery = mockMode ? '?mock=1' : ''
  const { items, counts, byPersona, memoryTagsByPersona, memoryTagsAny } = await getData(activeStatus, mockMode)

  const filtered = activePersona === 'all'
    ? items
    : items.filter((r: Record<string, unknown>) => (r.generation as { persona: string })?.persona === activePersona)

  return (
    <PipelineShell active={activeTab === 'budget' ? 'budget' : 'review'} mockMode={mockMode}>
      <AutoRefresh intervalMs={30000} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: '#ededed' }}>Review queue</h2>
        <Link href={`/${mockQuery}`} style={{ fontSize: 13, color: '#555', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 13 }} aria-hidden="true" />
          Dashboard
        </Link>
      </div>

      {mockMode && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(55,138,221,0.12)', border: '0.5px solid rgba(158,200,255,0.35)',
          borderRadius: 10, padding: '10px 14px', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: '#9EC8FF' }}>Mock server mode: sample review items and webhook actions are in-memory.</span>
          <Link href={routeBase} style={{ fontSize: 12, color: '#9EC8FF', textDecoration: 'none' }}>Use live data</Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'queue', label: 'Review queue', href: `${routeBase}?status=${activeStatus}&persona=${activePersona}${mockParam}` },
          { key: 'budget', label: 'Budget settings', href: `/dashboard?tab=budget${mockParam}` },
        ].map(tab => (
          <Link key={tab.key} href={tab.href} style={{
            textDecoration: 'none',
            color: activeTab === tab.key ? '#edf0f6' : '#a5adba',
            background: activeTab === tab.key ? '#1b2330' : '#11141a',
            border: `0.5px solid ${activeTab === tab.key ? '#3a4352' : '#2a2f3a'}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
          }}>
            {tab.label}
          </Link>
        ))}
      </div>

      {activeTab === 'budget' ? (
        <BudgetEditor mockMode={mockMode} />
      ) : (
        <>

      {counts.pending > 0 && activeStatus !== 'pending' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,159,39,0.08)', border: '0.5px solid rgba(239,159,39,0.3)',
          borderRadius: 10, padding: '10px 14px', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: '#EF9F27' }}>{counts.pending} posts still pending review</span>
          <Link href={`${routeBase}${mockQuery}`} style={{ fontSize: 12, color: '#EF9F27', textDecoration: 'none' }}>Review now →</Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
        {(['pending', 'approved', 'edited', 'rejected'] as const).map(s => (
          <Link key={s} href={`${routeBase}?status=${s}&persona=${activePersona}${mockParam}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background:   '#171a22',
              border:       `0.5px solid ${s === activeStatus ? STATUS_COLOR[s] : '#1e1e1e'}`,
              borderRadius: 10,
              padding:      '12px 14px',
              cursor:       'pointer',
            }}>
              <div style={{ fontSize: 11, color: '#9aa3b2', textTransform: 'capitalize', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: s === activeStatus ? STATUS_COLOR[s] : '#d7dbe4' }}>
                {counts[s]}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['all', 'nova', 'cynic', 'oracle', 'rebel', 'sage'] as const).map(p => (
          <Link key={p} href={`${routeBase}?status=${activeStatus}&persona=${p}${mockParam}`} style={{ textDecoration: 'none' }}>
            <div style={{
              display:     'inline-flex',
              alignItems:  'center',
              gap:         6,
              padding:     '5px 12px',
              borderRadius: 20,
              fontSize:    12,
              background:  p === activePersona ? (PERSONA_COLOR[p] ?? '#333') + '22' : '#11141a',
              border:      `0.5px solid ${p === activePersona ? (PERSONA_COLOR[p] ?? '#555') : '#2a2f3a'}`,
              color:       p === activePersona ? (PERSONA_COLOR[p] ?? '#ccc') : '#a5adba',
            }}>
              {p !== 'all' && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PERSONA_COLOR[p], display: 'inline-block' }} />
              )}
              <span style={{ textTransform: 'capitalize' }}>{p}</span>
              {p !== 'all' && (
                <span style={{ fontSize: 10, color: '#333' }}>{byPersona[p] ?? 0}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: '#333', padding: '3rem 0', textAlign: 'center' }}>
          No {activeStatus} posts{activePersona !== 'all' ? ` for ${activePersona}` : ''}.
        </div>
      ) : (
        filtered.map((row: Record<string, unknown>) => {
          const item    = row as ReviewRow
          const gen     = item.generation ?? {}
          const content = item.final_content ?? gen.content ?? ''
          const topicTags = topicTagsForRequest(item.request)

          return (
            <div key={item.id} style={{
              background:   '#171a22',
              border:       '0.5px solid #2a2f3a',
              borderLeft:   `3px solid ${PERSONA_COLOR[gen.persona] ?? '#444'}`,
              borderRadius: 12,
              padding:      '16px',
              marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: PERSONA_COLOR[gen.persona] ?? '#888', textTransform: 'capitalize', minWidth: 48 }}>
                  {gen.persona}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', background: '#1a1a1a', padding: '2px 8px', borderRadius: 6 }}>
                  <i className={`ti ${PLATFORM_ICON[gen.platform] ?? 'ti-world'}`} style={{ fontSize: 13 }} aria-hidden="true" />
                  {gen.platform}
                </span>
                <span style={{ fontSize: 12, color: '#444', background: '#1a1a1a', padding: '2px 8px', borderRadius: 6 }}>
                  {gen.pillar?.replace(/_/g, ' ')}
                </span>
                {gen.warnings?.length > 0 && (
                  <span style={{ fontSize: 11, color: '#EF9F27', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 13 }} aria-hidden="true" />
                    {gen.warnings.length} warning{gen.warnings.length > 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#333', marginLeft: 'auto' }}>{timeAgo(item.queued_at)}</span>
              </div>

              {item.request?.topic && (
                <div style={{ fontSize: 12, color: '#444', marginBottom: 8 }}>
                  <span style={{ color: '#8c96a8' }}>Topic:</span> <span style={{ color: '#d6d9e0' }}>{item.request.topic}</span>
                </div>
              )}

              {topicTags.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#8c96a8', textTransform: 'uppercase' }}>Tags</span>
                  {topicTags.map(tag => {
                    const hasPersonaMemory = memoryTagsByPersona.has(`${gen.persona}:${tag}`)
                    const hasNetworkMemory = memoryTagsAny.has(tag)
                    return (
                      <span key={tag} title={hasPersonaMemory ? 'Episodic memory for this persona' : hasNetworkMemory ? 'Episodic memory elsewhere in the network' : 'No episodic memory found'} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: hasPersonaMemory ? '#7FE0BA' : hasNetworkMemory ? '#9EC8FF' : '#c1c7d0',
                        background: hasPersonaMemory ? 'rgba(29,158,117,0.16)' : hasNetworkMemory ? 'rgba(55,138,221,0.14)' : '#10131a',
                        border: `0.5px solid ${hasPersonaMemory ? 'rgba(127,224,186,0.45)' : hasNetworkMemory ? 'rgba(158,200,255,0.36)' : '#303744'}`,
                        borderRadius: 8,
                        padding: '3px 8px',
                      }}>
                        {(hasPersonaMemory || hasNetworkMemory) && <i className="ti ti-brain" style={{ fontSize: 13 }} aria-hidden="true" />}
                        {tag}
                      </span>
                    )
                  })}
                </div>
              )}

              <div style={{
                fontSize: 15, color: '#edf0f6', lineHeight: 1.65,
                background: '#10131a', borderRadius: 8, padding: '14px 16px',
                marginBottom: 12, whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif',
              }}>
                {content}
              </div>

              {gen.warnings?.map((w: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: '#7a6020', background: '#1a1500', borderRadius: 6, padding: '4px 10px', marginBottom: 6 }}>
                  {w}
                </div>
              ))}

              {item.editor_notes && (
                <div style={{ fontSize: 12, color: '#7F77DD', background: '#111120', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                  <i className="ti ti-notes" style={{ fontSize: 13, marginRight: 6 }} aria-hidden="true" />
                  {item.editor_notes}
                </div>
              )}

              {activeStatus === 'pending' && (
                <ReviewActions itemId={item.id} originalContent={gen.content ?? ''} originalTopicTags={topicTags} mockMode={mockMode} />
              )}

              <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 8, borderTop: '0.5px solid #1a1a1a', fontSize: 11, color: '#2a2a2a' }}>
                <span>~{gen.estimatedTokens?.toLocaleString()} tokens</span>
                <span>triggered by {item.request?.triggeredBy ?? 'unknown'}</span>
                <span>id: {item.id.slice(0, 8)}…</span>
              </div>
            </div>
          )
        })
      )}
        </>
      )}
    </PipelineShell>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { status?: string; persona?: string; tab?: string; mock?: string }
}) {
  return <ReviewQueuePage searchParams={searchParams} />
}
