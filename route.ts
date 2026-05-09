/**
 * app/api/inngest/route.ts
 * Inngest function handler — Next.js App Router version.
 *
 * Replaces the Express:
 *   app.use('/api/inngest', serve({ client, functions }))
 *
 * Inngest calls this endpoint to:
 *   - Register your functions during development (GET)
 *   - Invoke scheduled and event-driven functions (POST)
 *   - Sync function definitions with Inngest Cloud (PUT)
 *
 * No changes needed to trendPipelineFunction, scheduledPostsFunction,
 * or approvedPostWebhook — they are imported unchanged from pipeline.ts.
 */

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest-client'
import {
  trendPipelineFunction,
  scheduledPostsFunction,
  approvedPostWebhook,
} from '@/lib/pipeline/pipeline'

export const { GET, POST, PUT } = serve({
  client:    inngest,
  functions: [
    trendPipelineFunction,
    scheduledPostsFunction,
    approvedPostWebhook,
  ],
})
