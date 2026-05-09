/**
 * app/api/inngest/route.ts
 * Simplified Inngest handler — pipeline functions added back once
 * basic sync is confirmed working.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest-client";

// Minimal function to confirm the route compiles and Inngest can sync.
// Pipeline functions (trendPipelineFunction etc.) are re-added after
// confirming this endpoint is reachable.
const pingFunction = inngest.createFunction(
  { id: "ping", name: "Health ping" },
  { event: "test/ping" },
  async () => {
    return { pong: true, at: new Date().toISOString() };
  },
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pingFunction],
  baseUrl: process.env.INNGEST_BASE_URL,
});
