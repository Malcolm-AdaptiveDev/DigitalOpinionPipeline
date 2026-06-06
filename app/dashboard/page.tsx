import { createClient }   from '@supabase/supabase-js'
import { ReviewActions }  from './review-actions'

const PERSONA_COLOR: Record<string, string> = {
  nova:   '#7F77DD',
  cynic:  '#D85A30',
  oracle: '#378ADD',
  rebel:  '#D4537E',
  sage:   '#1D9E75',
}

const PLATFORM_ICON: Record<string, string> = {
  x:          'ti-brand-x',
  tiktok:     'ti-brand-tiktok',
  instagram:  'ti-brand-instagram',
  youtube:    'ti-brand-youtube',
  linkedin:   'ti-brand-linkedin',
  substack:   'ti-mail',
  threads:    'ti-at',
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return `${secs}s ago`
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

async function getQueueItems(status: string) {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const { data, error } = await sb
    .from('review_queue')
    .select('*')
    .eq('status', status)
    .order('queued_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data ?? []
}

async function getCounts() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const { data } = await sb
    .from('review_queue')
    .select('status')
  const counts = { pending: 0, approved: 0, edited: 0, rejected: 0 }
  for (const row of (data ?? [])) {
    const s = (row as { status: string }).status as keyof typeof counts
    if (s in counts) counts[s]++
  }
  return counts
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { status?: string }
}) {
  const activeStatus = searchParams?.status ?? 'pending'
  const [items, counts] = await Promise.all([
    getQueueItems(activeStatus),
    getCounts(),
  ])

  const s = {
    page:       { maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' } as React.CSSProperties,
    header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '0.5px solid #1e1e1e', paddingBottom: '1rem' } as React.CSSProperties,
    title:      { fontSize: 20, fontWeight: 500, margin: 0, color: '#ededed' } as React.CSSProperties,
    tabs:       { display: 'flex', gap: 4, marginBottom: '1.5rem' } as React.CSSProperties,
    card:       { background: '#111', border: '0.5px solid #222', borderRadius: 12, padding: '16px', marginBottom: 10 } as React.CSSProperties,
    noData:     { fontSize: 14, color: '#444', padding: '2rem 0', textAlign: 'center' as const },
  }

  const tabItems: Array<{ key: string; label: string; count: number }> = [
    { key: 'pending',  label: 'Pending',  count: counts.pending  },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'edited',   label: 'Edited',   count: counts.edited   },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ]

  const TAB_COLORS: Record<string, string> = {
    pending:  '#EF9F27',
    approved: '#1D9E75',
    edited:   '#7F77DD',
    rejected: '#E24B4A',
  }

  return (
    <main style={s.page}>

      <div style={s.header}>
        <h1 style={s.title}>Review queue</h1>
        <a
          href="/"
          style={{ fontSize: 13, color: '#555', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} aria-hidden="true" />
          Pipeline status
        </a>
      </div>

      {/* Status tabs */}
      <div style={s.tabs}>
        {tabItems.map(tab => (
          <a
            key={tab.key}
            href={`/dashboard?status=${tab.key}`}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            6,
              padding:        '6px 14px',
              borderRadius:   8,
              fontSize:       13,
              textDecoration: 'none',
              background:     tab.key === activeStatus ? TAB_COLORS[tab.key] + '22' : 'transparent',
              border:         `0.5px solid ${tab.key === activeStatus ? TAB_COLORS[tab.key] : '#222'}`,
              color:          tab.key === activeStatus ? TAB_COLORS[tab.key] : '#555',
              fontWeight:     tab.key === activeStatus ? 500 : 400,
            }}
          >
            {tab.label}
            <span style={{
              fontSize:    11,
              background:  '#1a1a1a',
              color:       '#666',
              padding:     '1px 7px',
              borderRadius: 20,
            }}>
              {tab.count}
            </span>
          </a>
        ))}
      </div>

      {/* Post cards */}
      {items.length === 0 ? (
        <div style={s.noData}>No {activeStatus} posts.</div>
      ) : (
        items.map((row: Record<string, unknown>) => {
          const item    = row as {
            id: string
            generation: { persona: string; platform: string; pillar: string; content: string; generatedAt: string; estimatedTokens: number; warnings: string[] }
            request:    { topic: string; triggeredBy: string }
            status:     string
            final_content?: string
            editor_notes?:  string
            queued_at:  string
          }
          const gen     = item.generation
          const content = item.final_content ?? gen.content

          return (
            <div key={item.id} style={{
              ...s.card,
              borderLeft: `3px solid ${PERSONA_COLOR[gen.persona] ?? '#444'}`,
            }}>

              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontSize:     12,
                  fontWeight:   500,
                  color:        PERSONA_COLOR[gen.persona] ?? '#888',
                  textTransform: 'capitalize',
                  minWidth:     48,
                }}>
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
                <span style={{ fontSize: 11, color: '#444', marginLeft: 'auto' }}>
                  {timeAgo(item.queued_at)}
                </span>
              </div>

              {/* Topic */}
              {item.request?.topic && (
                <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                  <span style={{ color: '#333' }}>Topic:</span> {item.request.topic}
                </div>
              )}

              {/* Post content */}
              <div style={{
                fontSize:       14,
                color:          '#ccc',
                lineHeight:     1.6,
                background:     '#0d0d0d',
                borderRadius:   8,
                padding:        '12px 14px',
                marginBottom:   12,
                whiteSpace:     'pre-wrap',
                fontFamily:     'Georgia, serif',
              }}>
                {content}
              </div>

              {/* Warnings detail */}
              {gen.warnings?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {gen.warnings.map((w: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: '#7a6020', background: '#1f1800', borderRadius: 6, padding: '4px 10px', marginBottom: 4 }}>
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Editor notes if any */}
              {item.editor_notes && (
                <div style={{ fontSize: 12, color: '#7F77DD', background: '#12111e', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
                  <i className="ti ti-notes" style={{ fontSize: 13, marginRight: 6 }} aria-hidden="true" />
                  {item.editor_notes}
                </div>
              )}

              {/* Actions */}
              {activeStatus === 'pending' && (
                <ReviewActions
                  itemId={item.id}
                  originalContent={gen.content}
                />
              )}

              {/* Meta footer */}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #1a1a1a', fontSize: 11, color: '#333' }}>
                <span>~{gen.estimatedTokens?.toLocaleString()} tokens</span>
                <span>triggered by {item.request?.triggeredBy ?? 'unknown'}</span>
                <span>id: {item.id.slice(0, 8)}…</span>
              </div>

            </div>
          )
        })
      )}

    </main>
  )
}
