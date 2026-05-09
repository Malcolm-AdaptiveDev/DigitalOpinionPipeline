/**
 * app/api/inngest/route.ts
 * Inngest function handler — Next.js App Router version.
 *
 * Handles all three HTTP methods Inngest uses:
 *   GET  — introspection / health check from Inngest dashboard
 *   POST — function invocation (Inngest calls this to run your functions)
 *   PUT  — sync / registration (tells Inngest what functions exist)
 *
 * INNGEST_BASE_URL must be set in Railway to your public Railway domain,
 * e.g. https://persona-pipeline-production.up.railway.app
 * Without it, Inngest can sync but cannot invoke functions in production.
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
  // Tells Inngest the public URL it should use to invoke functions.
  // Required in production. Set INNGEST_BASE_URL in Railway variables.
  // e.g. https://persona-pipeline-production.up.railway.app
  baseUrl: process.env.INNGEST_BASE_URL,
});
