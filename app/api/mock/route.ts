import { NextRequest, NextResponse } from 'next/server'
import { getMockHomeStats, getMockPipelineConfig, getMockReviewRows, resetMockStore } from '@/lib/mock-data'

export async function GET() {
  return NextResponse.json({
    ok: true,
    review: {
      pending: getMockReviewRows('pending'),
      approved: getMockReviewRows('approved'),
      edited: getMockReviewRows('edited'),
      rejected: getMockReviewRows('rejected'),
    },
    home: getMockHomeStats(),
    pipelineConfig: getMockPipelineConfig(),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  if (body.action === 'reset') {
    resetMockStore()
    return NextResponse.json({ ok: true, action: 'reset' })
  }

  return NextResponse.json({ error: 'Unsupported mock action' }, { status: 400 })
}
