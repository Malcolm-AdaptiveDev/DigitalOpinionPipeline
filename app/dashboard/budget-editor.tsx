'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { PipelineConfig, PipelineConfigLog } from '@/lib/pipeline/config-shared'
import { DEFAULT_PIPELINE_CONFIG, estimateMonthlyCost } from '@/lib/pipeline/config-shared'

type ConfigResponse = {
  config: PipelineConfig
  log: PipelineConfigLog[]
  mockMode: boolean
}

type NumberField = {
  key: keyof PipelineConfig
  label: string
  envName?: string
  min: number
  max: number
  step: number
  suffix?: string
}

const keyFields: NumberField[] = [
  { key: 'max_trends_per_run', label: 'Max items per run', envName: 'PIPELINE_MAX_ITEMS_PER_RUN', min: 1, max: 20, step: 1 },
  { key: 'max_personas_per_trend', label: 'Max personas per item', envName: 'PIPELINE_MAX_PERSONAS_PER_ITEM', min: 1, max: 20, step: 1 },
  { key: 'relevance_threshold', label: 'Relevance threshold', envName: 'PIPELINE_RELEVANCE_THRESHOLD', min: 0.01, max: 1, step: 0.005 },
  { key: 'runs_per_day', label: 'Generation runs per day', envName: 'PIPELINE_RUNS_WITH_GENERATION_PER_DAY', min: 1, max: 20, step: 1 },
  { key: 'max_cascades_per_run', label: 'Max cascades per run', min: 0, max: 20, step: 1 },
  { key: 'monthly_budget_usd', label: 'Monthly budget', min: 1, max: 1000, step: 1, suffix: 'USD' },
]

const advancedFields: NumberField[] = [
  { key: 'avg_input_tokens_per_post', label: 'Avg input tokens', min: 100, max: 20000, step: 100 },
  { key: 'avg_output_tokens_per_post', label: 'Avg output tokens', min: 50, max: 5000, step: 50 },
  { key: 'input_cost_per_mtok_usd', label: 'Input cost / MTok', min: 0, max: 50, step: 0.1, suffix: 'USD' },
  { key: 'output_cost_per_mtok_usd', label: 'Output cost / MTok', min: 0, max: 100, step: 0.1, suffix: 'USD' },
  { key: 'embedding_cost_per_mtok_usd', label: 'Embedding cost / MTok', min: 0, max: 1, step: 0.01, suffix: 'USD' },
]

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (typeof value === 'boolean') return value ? 'enabled' : 'disabled'
  return String(value ?? '')
}

export function BudgetEditor({ mockMode = false }: { mockMode?: boolean }) {
  const [saved, setSaved] = useState<PipelineConfig>(DEFAULT_PIPELINE_CONFIG)
  const [draft, setDraft] = useState<PipelineConfig>(DEFAULT_PIPELINE_CONFIG)
  const [log, setLog] = useState<PipelineConfigLog[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    setLoaded(false)
    fetch(`/api/pipeline-config${mockMode ? '?mock=1' : ''}`)
      .then(res => res.json())
      .then((data: ConfigResponse) => {
        if (!alive) return
        setSaved(data.config)
        setDraft(data.config)
        setLog(data.log ?? [])
        setLoaded(true)
      })
      .catch(err => {
        if (alive) {
          setError((err as Error).message)
          setLoaded(true)
        }
      })
    return () => {
      alive = false
    }
  }, [mockMode])

  const savedCost = useMemo(() => estimateMonthlyCost(saved), [saved])
  const draftCost = useMemo(() => estimateMonthlyCost(draft), [draft])
  const delta = draftCost - savedCost
  const overBudget = draftCost > draft.monthly_budget_usd
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)

  function setNumber(key: keyof PipelineConfig, value: number) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  async function save() {
    setError(null)
    const res = await fetch('/api/pipeline-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: draft, note, changedBy: 'operator', mockMode }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    setSaved(data.config)
    setDraft(data.config)
    setLog(data.log ?? [])
    setNote('')
  }

  function renderNumberField(field: NumberField) {
    const value = Number(draft[field.key])
    return (
      <label key={field.key} style={{ display: 'grid', gap: 7, background: '#10131a', border: '0.5px solid #303744', borderRadius: 8, padding: 12 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#c1c7d0' }}>
          <span>
            {field.label}
            {field.envName && <span style={{ display: 'block', marginTop: 2, color: '#687386', fontSize: 10 }}>{field.envName}</span>}
          </span>
          <strong style={{ color: '#edf0f6', fontWeight: 600, minWidth: 76, textAlign: 'right' }}>
            {formatValue(value)} {field.suffix ?? ''}
          </strong>
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: 8, alignItems: 'center' }}>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value}
            onInput={event => setNumber(field.key, Number((event.target as HTMLInputElement).value))}
            onChange={event => setNumber(field.key, Number(event.target.value))}
          />
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value}
            onChange={event => setNumber(field.key, Number(event.target.value))}
            style={{ width: '100%', color: '#edf0f6', background: '#171a22', border: '0.5px solid #3a4250', borderRadius: 7, padding: '5px 7px', fontSize: 12 }}
          />
        </div>
      </label>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: 14 }}>
      <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 18, color: '#f4f6fb', margin: 0 }}>Budget settings</h2>
            <div style={{ fontSize: 12, color: '#9aa3b2', marginTop: 4 }}>
              {mockMode ? 'Mock config' : 'Live Supabase config'} · {loaded ? `updated ${new Date(saved.updated_at).toLocaleString()}` : 'loading...'}
            </div>
          </div>
          <button
            onClick={() => setDraft(saved)}
            disabled={!dirty || isPending}
            style={{ fontSize: 13, color: '#a5adba', background: '#10131a', border: '0.5px solid #303744', borderRadius: 8, padding: '7px 12px' }}
          >
            Reset
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#9EC8FF', textTransform: 'uppercase', marginBottom: 8 }}>Key customizations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {keyFields.map(renderNumberField)}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, color: '#d6d9e0', fontSize: 13, flexWrap: 'wrap' }}>
          <input
            type="checkbox"
            checked={draft.cascade_enabled}
            onChange={event => setDraft(current => ({ ...current, cascade_enabled: event.target.checked }))}
          />
          Enable cross-persona cascade generation
          <span style={{ color: '#687386', fontSize: 10 }}>PIPELINE_ENABLE_CASCADES</span>
        </label>

        <button
          onClick={() => setShowAdvanced(value => !value)}
          style={{ marginTop: 14, color: '#c1c7d0', background: '#10131a', border: '0.5px solid #303744', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
        >
          {showAdvanced ? 'Hide advanced cost assumptions' : 'Show advanced cost assumptions'}
        </button>

        {showAdvanced && (
          <>
            <div style={{ fontSize: 12, color: '#7d8796', textTransform: 'uppercase', margin: '14px 0 8px' }}>Advanced cost assumptions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {advancedFields.map(renderNumberField)}
            </div>
          </>
        )}

        <input
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Change note (optional)"
          style={{ width: '100%', marginTop: 14, fontSize: 13, color: '#d6d9e0', background: '#10131a', border: '0.5px solid #303744', borderRadius: 8, padding: '9px 12px' }}
        />

        {error && <div style={{ marginTop: 10, color: '#E24B4A', fontSize: 12 }}>{error}</div>}

        <button
          onClick={() => startTransition(() => { void save().catch(err => setError((err as Error).message)) })}
          disabled={!dirty || isPending}
          style={{ marginTop: 14, fontSize: 13, color: '#111', background: dirty ? '#9EC8FF' : '#3a4250', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: dirty ? 'pointer' : 'not-allowed' }}
        >
          {isPending ? 'Saving...' : 'Save budget settings'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ background: '#171a22', border: `0.5px solid ${overBudget ? '#EF9F27' : '#2a2f3a'}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#9aa3b2', marginBottom: 6 }}>Projected monthly cost</div>
          <div style={{ fontSize: 30, fontWeight: 600, color: overBudget ? '#EF9F27' : '#edf0f6' }}>{money(draftCost)}</div>
          <div style={{ fontSize: 12, color: delta > 0 ? '#EF9F27' : delta < 0 ? '#7FE0BA' : '#9aa3b2', marginTop: 6 }}>
            {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${money(delta)} vs saved settings`}
          </div>
          <div style={{ fontSize: 12, color: overBudget ? '#EF9F27' : '#9aa3b2', marginTop: 8 }}>
            Budget: {money(draft.monthly_budget_usd)}
          </div>
          <div style={{ display: 'grid', gap: 5, marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #2a2f3a', fontSize: 12, color: '#c1c7d0' }}>
            <span>Items/run: {draft.max_trends_per_run}</span>
            <span>Personas/item: {draft.max_personas_per_trend}</span>
            <span>Generation runs/day: {draft.runs_per_day}</span>
            <span>Cascades: {draft.cascade_enabled ? `up to ${draft.max_cascades_per_run}/run` : 'disabled'}</span>
          </div>
        </div>

        <div style={{ background: '#171a22', border: '0.5px solid #2a2f3a', borderRadius: 12, padding: 16 }}>
          <button onClick={() => setShowLog(value => !value)} style={{ width: '100%', textAlign: 'left', color: '#edf0f6', background: 'transparent', border: 'none', padding: 0, fontSize: 14 }}>
            Change log {showLog ? '-' : '+'}
          </button>
          {showLog && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {log.length === 0 ? (
                <div style={{ fontSize: 12, color: '#7d8796' }}>No changes recorded.</div>
              ) : log.map(entry => (
                <div key={entry.id} style={{ borderTop: '0.5px solid #2a2f3a', paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: '#c1c7d0' }}>{entry.field_name}</div>
                  <div style={{ fontSize: 11, color: '#7d8796' }}>
                    {formatValue(entry.old_value)} -&gt; {formatValue(entry.new_value)}
                  </div>
                  {entry.note && <div style={{ fontSize: 11, color: '#9aa3b2', marginTop: 2 }}>{entry.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
