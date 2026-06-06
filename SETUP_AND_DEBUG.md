# Digital Opinion Pipeline - Setup & Debugging Guide

## Problem: Episodic Memories Not Being Created, Posts Not Generated

If you're experiencing these symptoms:

- No posts are being generated for human review
- Episodic memories are not being created
- The review queue is empty

The issues have likely been fixed by these code changes:

### Code Fixes Applied

1. **Fixed: `updateEngagementScore` Function** (memory-write.ts)
   - Removed confusing db import pattern that could cause runtime errors
   - Now properly calls `db()` to get the Supabase client

2. **Fixed: `insertScoredTrend` Type Issues** (lib/pipeline/db.ts & db.ts)
   - Added support for `urgency_rank` and `processed` fields that are required by the database
   - This was preventing scored trends from being inserted into the database
   - Updated ingestion.ts to properly pass these required fields

---

## Required Environment Variables

### Inngest Configuration (Critical)

These are **required** for the pipeline to run at all. Without these, Inngest won't register your functions.

```
INNGEST_SIGNING_KEY=<your-inngest-signing-key>
INNGEST_EVENT_KEY=<your-inngest-event-key>
INNGEST_BASE_URL=<your-inngest-base-url>
```

Get these from: https://app.inngest.com

### Supabase Configuration (Critical)

```
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>
```

Important: Use the **service role key**, NOT the anon key. The pipeline needs write access to all tables.

Get these from: Your Supabase project settings → API → Project URL and Service Role

### API Keys (Critical)

```
ANTHROPIC_API_KEY=<your-claude-api-key>
OPENAI_API_KEY=<your-openai-api-key>
```

- **Claude** (ANTHROPIC): Used for post generation
- **OpenAI**: Used for embeddings (text-embedding-3-small)

---

## Pipeline Flow & Debug Points

### Stage 1: Ingestion (`ingestTrends`)

**What it does**: Fetches trends from RSS feeds (TechCrunch, Reuters, ArsTechnica, etc.)

**Debug checklist**:

- [ ] Check `/api/health` returns 200 OK
- [ ] Verify RSS feeds are accessible (not rate-limited or blocked)
- [ ] Check Supabase `trending_queue` table for new items
- [ ] Check application logs for: `[Ingestion]` messages

**Common issues**:

- RSS feeds are rate-limited or returning errors
- Network connectivity issues
- Missing `SUPABASE_URL` or `SUPABASE_SERVICE_KEY`

---

### Stage 2: Scoring & Routing (`scoreAndRoute`)

**What it does**: Scores each trend for relevance to each persona (0-1), assigns personas above threshold (0.35)

**Debug checklist**:

- [ ] Check Supabase `scored_trends` table for items with `processed=false`
- [ ] Verify `relevance_scores` JSON contains scores for all 5 personas
- [ ] Verify `assigned_personas` is not empty
- [ ] Check for: `[Scoring]` log messages

**Common issues**:

- Database insert failing (now fixed - was missing `urgency_rank` and `processed`)
- No trends meet the relevance threshold (adjust `PERSONA_INTEREST_GRAPH` in ingestion.ts)

---

### Stage 3: Memory Assembly (`assembleMemoryBundle`)

**What it does**: Retrieves relevant episodic memories, relational states, and belief evolution for each persona

**Debug checklist**:

- [ ] Check that `episodic_memory` table has the RPC function: `match_episodic_memories`
- [ ] Verify tables exist: `episodic_memory`, `relational_state`, `belief_evolution`
- [ ] Check application logs for: `[Pipeline] Memory assembly` messages

**Common issues**:

- RPC function not created in Supabase (run the SQL schema)
- Missing pgvector extension in Supabase
- No embeddings in episodic_memory (normal for first run)

---

### Stage 4: Generation (`generatePost`)

**What it does**: Calls Claude API to generate a post for each persona

**Debug checklist**:

- [ ] Verify `ANTHROPIC_API_KEY` is valid and has API credits
- [ ] Check Claude rate limits aren't exceeded
- [ ] Check application logs for: `[Pipeline] Generation` messages
- [ ] Check `/api/inngest` returns function definitions

**Common issues**:

- Missing or invalid `ANTHROPIC_API_KEY`
- Rate limiting (wait or upgrade API tier)
- API returning errors - check Anthropic dashboard

---

### Stage 5: Review Queue (`insertReviewItem`)

**What it does**: Inserts generated posts into the review queue for human approval

**Debug checklist**:

- [ ] Check Supabase `review_queue` table has items with `status='pending'`
- [ ] Verify `generation` and `request` JSON fields are populated
- [ ] Check logs for: `[Pipeline] Queued for review` messages

**Common issues**:

- Database insert failing due to schema mismatch (now fixed)
- Missing database permissions

---

### Stage 7: Memory Writing (After Approval)

**What it does**: After human review, writes approved posts to episodic memory and related tables

**Debug checklist**:

- [ ] Verify `/api/webhooks/post-approved` webhook is being called
- [ ] Check Supabase `episodic_memory` table for new entries
- [ ] Check logs for: `[MemoryWrite]` messages
- [ ] Verify embeddings are being created (requires `OPENAI_API_KEY`)

**Common issues**:

- Missing `OPENAI_API_KEY` for embeddings
- Webhook not being called from review dashboard

---

## How to Debug

### 1. Check Application Logs

```bash
# In production (Railway, Vercel, etc.)
# Check the deployment dashboard logs

# Locally:
npm run dev
# Logs will appear in terminal
```

Look for these prefixes:

- `[Ingestion]` - Trend fetching
- `[Scoring]` - Relevance scoring
- `[Pipeline]` - Main orchestrator
- `[Generation]` - Claude API calls
- `[MemoryWrite]` - Post-publish memory writes
- `[EngagementUpdate]` - Engagement score updates

### 2. Check Inngest Dashboard

Go to https://app.inngest.com and check:

- Function registration status
- Recent function runs and errors
- Event history

If functions aren't showing up:

- Verify `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` are correct
- Verify `/api/inngest` endpoint is accessible
- Check `INNGEST_BASE_URL` is correct

### 3. Check Supabase Tables

In Supabase dashboard, check these tables in order:

1. **trending_queue** → Should have recent items
2. **scored_trends** → Should have items with `processed=false`
3. **episodic_memory** → Should be populated after approval
4. **review_queue** → Should have items with `status='pending'`

### 4. Test Endpoints

```bash
# Health check
curl https://your-app.com/api/health

# Inngest introspection (shows registered functions)
curl https://your-app.com/api/inngest

# Test webhook (after getting review item ID from review_queue)
curl -X POST https://your-app.com/api/webhooks/post-approved \
  -H "Content-Type: application/json" \
  -d '{
    "reviewItemId": "<review_item_id>",
    "finalContent": "Optional edited content"
  }'
```

---

## Running the Pipeline Manually (For Testing)

You can trigger the pipeline manually by calling the Inngest API:

```bash
curl -X POST https://api.inngest.com/events \
  -H "Authorization: Bearer $INNGEST_EVENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "trend-pipeline/run",
    "data": {}
  }'
```

Or trigger directly in your code:

```typescript
import { inngest } from "@/lib/inngest-client";

// Manual trigger for testing
await inngest.send({
  name: "trend-pipeline/run",
  data: {},
});
```

---

## Database Schema

If you haven't already, run the SQL schema to set up all tables:

```bash
# In Supabase SQL editor, run:
# Copy contents of 001_initial_schema.sql and execute
```

Key tables created:

- `persona_identity` - 5 personas
- `episodic_memory` - Posts, interactions, positions
- `relational_state` - Inter-persona relationships
- `belief_evolution` - When personas change positions
- `trending_queue` - Raw ingested trends
- `scored_trends` - Scored and routed trends
- `review_queue` - Posts awaiting human review
- `published_posts` - Approved and published posts
- `pipeline_runs` - Execution history and error logs

---

## Common Issues & Solutions

### "No trends are being ingested"

- Check RSS feed URLs are accessible
- Verify network connectivity
- Check Supabase permissions (must be using service key)
- Look for "CORS" errors if running locally

### "Posts are being generated but not showing in review queue"

- Fixed! This was the `insertScoredTrend` bug - now properly handles `urgency_rank` and `processed`
- Check Supabase `review_queue` table for items
- Check logs for database errors

### "Episodic memories not being created after approval"

- Verify webhook is being called from review dashboard
- Check `OPENAI_API_KEY` is set (needed for embeddings)
- Verify Supabase RPC function `match_episodic_memories` exists
- Check database permissions

### "Claude API errors"

- Verify `ANTHROPIC_API_KEY` is valid
- Check API quota and rate limits
- Verify model name is correct (`claude-3-5-sonnet-20241022`)

### "OpenAI embedding errors"

- Verify `OPENAI_API_KEY` is valid
- Check API quota
- Verify model name is correct (`text-embedding-3-small`)

---

## Performance Tuning

The pipeline runs every 15 minutes by default. To adjust:

In `lib/pipeline/pipeline.ts`:

```typescript
export const trendPipelineFunction = inngest.createFunction(
  { id: "trend-pipeline", name: "Trend ingestion and persona routing" },
  { cron: "*/15 * * * *" }, // Change this: */15 = every 15 min, */30 = every 30 min
  async ({ step }) => {
    await step.run("run-trend-pipeline", () => runTrendPipeline());
  },
);
```

---

## Next Steps

1. ✅ Verify all environment variables are set
2. ✅ Deploy the code with the bug fixes
3. Wait 15 minutes for the next scheduled run
4. Check `/api/health` and logs
5. Check Supabase tables for data
6. If still issues, review debug points above

Good luck! 🚀
