/**
 * app/api/webhooks/post-approved/route.ts
 * Review dashboard webhook — handles approve, edit, and reject actions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processApprovedPost }       from '@/lib/pipeline/pipeline'
import { updateReviewStatus }        from '@/lib/pipeline/db'
import type { MemoryWriteOptions }   from '@/lib/pipeline/memory-write'

export async function POST(req: NextRequest) {
  let body: {
    reviewItemId:    string
    status?:         string
    finalContent?:   string
    editorNotes?:    string
    reviewedBy?:     string
    platformPostId?: string
    beliefShift?:    MemoryWriteOptions['beliefShift']
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { reviewItemId, status, finalContent, editorNotes, reviewedBy, platformPostId, beliefShift } = body

  if (!reviewItemId) {
    return NextResponse.json({ error: 'reviewItemId is required' }, { status: 400 })
  }

  try {
    if (status === 'rejected') {
      await updateReviewStatus(reviewItemId, 'rejected', { editorNotes, reviewedBy })
      return NextResponse.json({ ok: true, reviewItemId, status: 'rejected' })
    }

    await processApprovedPost(reviewItemId, { finalContent, editorNotes, reviewedBy, platformPostId, beliefShift })
    return NextResponse.json({ ok: true, reviewItemId })
  } catch (err) {
    console.error('[/api/webhooks/post-approved]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
