/**
 * app/api/inngest/route.ts
 * Production Inngest handler — all three pipeline functions registered.
 *
 * GET  — introspection / health check from Inngest dashboard
 * POST — function invocation (Inngest calls this to run your functions)
 * PUT  — sync / registration (tells Inngest what functions exist)
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest-client";
import {
  trendPipelineFunction,
  scheduledPostsFunction,
  approvedPostWebhook,
} from "@/lib/pipeline/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    trendPipelineFunction,
    scheduledPostsFunction,
    approvedPostWebhook,
  ],
  baseUrl: process.env.INNGEST_BASE_URL,
});
