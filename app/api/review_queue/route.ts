import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getMockReviewCounts, getMockReviewRows, isMockMode } from '@/lib/mock-data'

type ReviewQueueRow = {
  id: string
  status: string
  generation?: { persona?: string }
}

function filterByPersona<T extends ReviewQueueRow>(items: T[], persona: string) {
  if (persona === 'all') return items
  return items.filter(item => item.generation?.persona === persona)
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const persona = req.nextUrl.searchParams.get('persona') ?? 'all'
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)))
  const mockMode = isMockMode(req.nextUrl.searchParams.get('mock') === '1')

  if (mockMode) {
    const items = filterByPersona(getMockReviewRows(status), persona).slice(0, limit)
    const { counts, byPersona } = getMockReviewCounts()
    return NextResponse.json({
      mode: 'mock',
      status,
      persona,
      limit,
      counts,
      byPersona,
      items,
    })
  }

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

  let itemsQuery = sb
    .from('review_queue')
    .select('*')
    .eq('status', status)
    .order('queued_at', { ascending: false })
    .limit(limit)

  if (persona !== 'all') {
    itemsQuery = itemsQuery.eq('generation->>persona', persona)
  }

  const [itemsRes, allRes] = await Promise.all([
    itemsQuery,
    sb.from('review_queue').select('status, generation'),
  ])

  if (itemsRes.error) {
    return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })
  }
  if (allRes.error) {
    return NextResponse.json({ error: allRes.error.message }, { status: 500 })
  }

  const counts = { pending: 0, approved: 0, edited: 0, rejected: 0 }
  const byPersona: Record<string, number> = {}
  for (const row of (allRes.data ?? []) as ReviewQueueRow[]) {
    const key = row.status as keyof typeof counts
    if (key in counts) counts[key]++
    const rowPersona = row.generation?.persona
    if (rowPersona) byPersona[rowPersona] = (byPersona[rowPersona] ?? 0) + 1
  }

  return NextResponse.json({
    mode: 'live',
    status,
    persona,
    limit,
    counts,
    byPersona,
    items: itemsRes.data ?? [],
  })
}
