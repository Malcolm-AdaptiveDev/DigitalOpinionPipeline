/**
 * generation.ts
 * Stage 4 — Claude API post generation
 *
 * Wraps the Anthropic SDK with:
 *  - Per-persona temperature tuning
 *  - Retry logic with exponential backoff
 *  - Token usage tracking
 *  - Cross-persona cascade detection
 *  - Platform-specific user message construction
 */

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import type {
  PersonaId,
  Platform,
  ContentPillar,
  ToneModifier,
  GenerationRequest,
  GenerationResult,
  NetworkActivity,
} from '@/lib/pipeline/types'
import type { AssembledPrompt } from '@/lib/pipeline/memory'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Persona Temperature Profiles ────────────────────────────────────────────
// Each persona has a calibrated temperature range.
// Higher = more authentic variance. Lower = tighter voice consistency.

const PERSONA_TEMPERATURE: Record<PersonaId, number> = {
  nova:   0.78,   // Warm + energetic — needs variance to feel alive
  cynic:  0.65,   // Sharp + precise — too much variance breaks the tone
  oracle: 0.60,   // Clinical + analytical — lowest variance for authority
  rebel:  0.85,   // Raw + reactive — highest variance, most "human" feel
  sage:   0.70,   // Measured + thoughtful — moderate variance, careful word choice
}

// ─── Platform Length Targets ──────────────────────────────────────────────────

const PLATFORM_LENGTH_GUIDANCE: Record<Platform, string> = {
  x:          '1–3 sentences max. Punchy. Designed to be read in 5 seconds.',
  tiktok:     '45–90 seconds spoken (approximately 100–200 words). Hook in first 3 words.',
  instagram:  'Caption: 1–2 sentences. If carousel, one punchy line per slide.',
  youtube:    'Essay intro: 150–250 words. Full script supplied separately.',
  linkedin:   '3–5 sentences. Professional framing. One clear takeaway.',
  substack:   '600–900 words. Letter format. Three sections max.',
  threads:    '1–2 sentences. Designed to start a thread.',
}

// ─── Pillar Instruction Overlays ──────────────────────────────────────────────
// These append to the user message to sharpen pillar-specific behaviour

const PILLAR_INSTRUCTIONS: Partial<Record<ContentPillar, string>> = {
  breakthrough:      'Open with the most surprising specific fact. End with a challenge or question.',
  debunk:           'Start with the popular claim. Methodically dismantle it with specifics. End with a pointed question.',
  follow_the_money:  'Name the institution and the incentive explicitly. No vague "they."',
  the_model:        'State the prediction with explicit confidence percentage. State the key assumption. Give a resolution date.',
  scorecard:        'Reference a specific prior claim by name or date. Give a verdict. Update the record.',
  mediation:        'Acknowledge both positions by name. Introduce a third frame that neither side is asking. End with an open question.',
  morning_question:  'One question only. No context. No explanation. Let it land alone.',
  reluctant_credit:  'Acknowledge what you were wrong about specifically. Name what changed your mind. Do not minimise — the credibility is in the discomfort.',
  moment_of_softness: 'No analysis. No critique. Just the thing itself. Two sentences maximum.',
  callout:          'Name the institution. Name the specific action. Name who benefits. End with an implication, not an accusation.',
  arbiter:          'Name both sides. Provide the data or philosophical frame neither is using. Do not pick a winner.',
}

// ─── User Message Builder ─────────────────────────────────────────────────────

function buildUserMessage(request: GenerationRequest): string {
  const lengthGuidance =
    PLATFORM_LENGTH_GUIDANCE[request.platform] ??
    `Target length: ${request.targetLength}`

  const pillarInstruction =
    PILLAR_INSTRUCTIONS[request.pillar] ?? ''

  const crossTagNote = request.crossTagPersona
    ? `\n\nCross-persona tag: This post should reference or respond to ${request.crossTagPersona}. ` +
      `Use relational state to calibrate the tone of that reference.`
    : ''

  const toneNote = request.toneModifier !== 'none'
    ? `\n\nTone modifier: ${request.toneModifier.replace('_', ' ')}. ` +
      `Apply this as a subtle shift within your established voice — not a personality change.`
    : ''

  const triggerNote = request.triggeredBy === 'trend'
    ? `\n\nThis post is triggered by a real-time trending event. ` +
      `Make it feel written in the last hour, not the last week.`
    : request.triggeredBy === 'cross_persona'
    ? `\n\nThis is a reactive post — a direct response to another persona's content. ` +
      `The relational state above determines the heat of your response.`
    : ''

  return (
    `Write a ${request.pillar.replace(/_/g, ' ')} post for ${request.platform.toUpperCase()} ` +
    `about: "${request.topic}".\n\n` +
    `Length guidance: ${lengthGuidance}\n\n` +
    (pillarInstruction ? `Pillar instruction: ${pillarInstruction}\n\n` : '') +
    `Apply all memory layers above. ` +
    `Do not contradict prior positions without explicit acknowledgment. ` +
    `Do not repeat content from episodic memory verbatim.` +
    crossTagNote +
    toneNote +
    triggerNote
  )
}

// ─── Retry Wrapper ────────────────────────────────────────────────────────────

async function callAnthropicWithRetry(
  systemPrompt: string,
  userMessage:  string,
  temperature:  number,
  maxRetries =  3
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model:       'claude-sonnet-4-6',
        max_tokens:  700,
        temperature,
        system:      systemPrompt,
        messages:    [{ role: 'user', content: userMessage }],
      })

      const content = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim()

      return {
        content,
        inputTokens:  response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    } catch (err) {
      lastError = err as Error
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Error && err.message.includes('529'))

      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500
        console.warn(`[Generation] Rate limit on attempt ${attempt}. Retrying in ${Math.round(delay)}ms…`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      // Non-retriable error — rethrow immediately
      if (!isRateLimit) throw err
    }
  }

  throw lastError ?? new Error('Generation failed after max retries')
}

// ─── Cross-Persona Cascade Detection ─────────────────────────────────────────
// After generating a post, determine whether other personas should react.
// Returns a list of GenerationRequests for downstream cascade calls.

export function detectCascadeRequests(
  result: GenerationResult,
  originalRequest: GenerationRequest,
  networkActivity: NetworkActivity[]
): GenerationRequest[] {
  const cascades: GenerationRequest[] = []
  const hour = new Date().getHours()

  // Nova posts → Cynic should react (if trust < 0.6 or tension > 0.6)
  if (
    originalRequest.persona === 'nova' &&
    ['breakthrough', 'reframe', 'future_vision'].includes(originalRequest.pillar) &&
    originalRequest.platform === 'x'
  ) {
    cascades.push({
      persona:           'cynic',
      topic:             originalRequest.topic,
      worldContext:      originalRequest.worldContext,
      networkActivity:   [
        ...networkActivity,
        {
          persona:   'nova',
          platform:  originalRequest.platform,
          hours_ago: 0,
          excerpt:   result.content.slice(0, 120),
          topic_tag: 'nova_post',
          post_id:   result.requestId,
        },
      ],
      platform:          'x',
      pillar:            'debunk',
      targetLength:      PLATFORM_LENGTH_GUIDANCE.x,
      toneModifier:      'none',
      crossTagPersona:   'nova',
      disclosureRequired: false,
      triggeredBy:       'cross_persona',
      trendItemId:       originalRequest.trendItemId,
    })
  }

  // Any major Nova-Cynic debate → Sage mediates (if both posted in last 2 hours)
  const recentNova  = networkActivity.find(a => a.persona === 'nova'  && a.hours_ago < 2)
  const recentCynic = networkActivity.find(a => a.persona === 'cynic' && a.hours_ago < 2)
  if (
    originalRequest.persona === 'cynic' &&
    recentNova &&
    originalRequest.platform === 'x' &&
    !cascades.some(c => c.persona === 'sage')
  ) {
    cascades.push({
      persona:           'sage',
      topic:             originalRequest.topic,
      worldContext:      originalRequest.worldContext,
      networkActivity,
      platform:          'x',
      pillar:            'mediation',
      targetLength:      PLATFORM_LENGTH_GUIDANCE.x,
      toneModifier:      'none',
      disclosureRequired: false,
      triggeredBy:       'cross_persona',
      trendItemId:       originalRequest.trendItemId,
    })
  }

  // Oracle arbiter on any 2+ persona debate
  if (
    networkActivity.filter(a => a.hours_ago < 4).length >= 2 &&
    originalRequest.persona !== 'oracle' &&
    !cascades.some(c => c.persona === 'oracle') &&
    originalRequest.platform === 'x'
  ) {
    cascades.push({
      persona:           'oracle',
      topic:             originalRequest.topic,
      worldContext:      originalRequest.worldContext,
      networkActivity,
      platform:          'x',
      pillar:            'arbiter',
      targetLength:      PLATFORM_LENGTH_GUIDANCE.x,
      toneModifier:      'none',
      disclosureRequired: false,
      triggeredBy:       'cross_persona',
      trendItemId:       originalRequest.trendItemId,
    })
  }

  // Rebel weekend Moment of Softness → Sage philosophical response
  const isWeekend  = [0, 6].includes(new Date().getDay())
  const isEvening  = hour >= 18 || hour <= 10
  if (
    originalRequest.persona === 'rebel' &&
    originalRequest.pillar   === 'moment_of_softness' &&
    isWeekend &&
    !cascades.some(c => c.persona === 'sage')
  ) {
    cascades.push({
      persona:           'sage',
      topic:             originalRequest.topic,
      worldContext:      originalRequest.worldContext,
      networkActivity,
      platform:          'x',
      pillar:            'text_and_now',
      targetLength:      PLATFORM_LENGTH_GUIDANCE.x,
      toneModifier:      'more_reflective',
      crossTagPersona:   'rebel',
      disclosureRequired: false,
      triggeredBy:       'cross_persona',
    })
  }

  return cascades
}

// ─── Main: Generate Post ──────────────────────────────────────────────────────

export async function generatePost(
  request:        GenerationRequest,
  assembledPrompt: AssembledPrompt
): Promise<GenerationResult> {
  const requestId = randomUUID()
  const temperature = PERSONA_TEMPERATURE[request.persona]
  const userMessage  = buildUserMessage(request)

  console.log(
    `[Generation] ${request.persona} / ${request.pillar} / ${request.platform} ` +
    `(temp=${temperature}, ~${assembledPrompt.estimatedTokens} ctx tokens)`
  )

  if (assembledPrompt.warnings.length > 0) {
    console.warn(`[Generation] Prompt warnings:`, assembledPrompt.warnings)
  }

  const { content, inputTokens, outputTokens } = await callAnthropicWithRetry(
    assembledPrompt.systemPrompt,
    userMessage,
    temperature
  )

  const result: GenerationResult = {
    requestId,
    persona:         request.persona,
    platform:        request.platform,
    pillar:          request.pillar,
    content,
    estimatedTokens: inputTokens + outputTokens,
    layersLoaded:    assembledPrompt.layersLoaded,
    warnings:        assembledPrompt.warnings,
    generatedAt:     new Date().toISOString(),
    modelVersion:    'claude-sonnet-4-6',
  }

  console.log(
    `[Generation] Done. ${inputTokens} in / ${outputTokens} out. ` +
    `Content: "${content.slice(0, 80)}…"`
  )

  return result
}
