/**
 * lib/inngest-client.ts
 * Inngest singleton — imported by API routes and pipeline functions.
 * Identical logic to the Express version, new location.
 */

import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id:   'persona-pipeline',
  name: '5-Persona AI Network Pipeline',
})
