/**
 * app/api/webhooks/engagement-update/route.ts
 * Engagement score sync — Next.js App Router version.
 *
 * Replaces the Express:
 *   app.post('/webhooks/engagement-update', async (req, res) => { ... })
 *
 * Called by a daily analytics cron (e.g. from your social platform
 * API scraper) to update engagement_score in episodic_memory.
 * Higher engagement scores surface those posts more often in future
 * semantic retrieval — making successful posts influence future generation.
 *
 * Request body: { episodicMemoryId: string, score: number }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { updateEngagementScore }      from '@/lib/pipeline/memory-write'

export async function POST(req: NextRequest) {
  let body: { episodicMemoryId: string; score: number }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { episodicMemoryId, score } = body

  if (!episodicMemoryId || typeof score !== 'number') {
    return NextResponse.json(
      { error: 'episodicMemoryId (string) and score (number) are required' },
      { status: 400 }
    )
  }

  try {
    await updateEngagementScore(episodicMemoryId, score)
    return NextResponse.json({ ok: true, episodicMemoryId, score })
  } catch (err) {
    console.error('[/api/webhooks/engagement-update]', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
