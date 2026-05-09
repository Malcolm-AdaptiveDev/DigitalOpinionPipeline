/**
 * lib/inngest-client.ts
 * Inngest singleton — imported by API routes and pipeline functions.
 *
 * signingKey: authenticates that incoming requests are from Inngest servers.
 * eventKey:   used when sending events to Inngest (e.g. post/approved).
 * Both are read from environment variables set in Railway.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "persona-pipeline",
  name: "5-Persona AI Network Pipeline",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
});
