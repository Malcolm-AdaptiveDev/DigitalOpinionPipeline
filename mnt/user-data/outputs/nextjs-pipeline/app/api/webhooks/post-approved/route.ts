/**
 * app/api/webhooks/post-approved/route.ts
 * Review dashboard webhook — Next.js App Router version.
 *
 * Replaces the Express:
 *   app.post('/webhooks/post-approved', async (req, res) => { ... })
 *
 * Called by your Retool review dashboard after an operator approves
 * or edits a generated post. Triggers the memory write pipeline
 * (Stage 7): episodic memory, belief evolution, relational state update.
 *
 * Request body: { reviewItemId, finalContent?, editorNotes?,
 *                 reviewedBy?, platformPostId?, beliefShift? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { processApprovedPost }       from '@/lib/pipeline/pipeline'
import type { MemoryWriteOptions }   from '@/lib/pipeline/memory-write'

export async function POST(req: NextRequest) {
  let body: {
    reviewItemId:    string
    finalContent?:   string
    editorNotes?:    string
    reviewedBy?:     string
    platformPostId?: string
    beliefShift?:    MemoryWriteOptions['beliefShift']
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { reviewItemId, finalContent, editorNotes, reviewedBy, platformPostId, beliefShift } = body

  if (!reviewItemId) {
    return NextResponse.json(
      { error: 'reviewItemId is required' },
      { status: 400 }
    )
  }

  try {
    await processApprovedPost(reviewItemId, {
      finalContent,
      editorNotes,
      reviewedBy,
      platformPostId,
      beliefShift,
    })

    return NextResponse.json({ ok: true, reviewItemId })
  } catch (err) {
    console.error('[/api/webhooks/post-approved]', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
