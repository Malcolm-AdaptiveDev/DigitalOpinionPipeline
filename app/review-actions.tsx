'use client'

import { useState, useTransition } from 'react'
import { useRouter }               from 'next/navigation'

interface ReviewActionsProps {
  itemId:          string
  originalContent: string
}

export function ReviewActions({ itemId, originalContent }: ReviewActionsProps) {
  const router                          = useRouter()
  const [isPending, startTransition]    = useTransition()
  const [mode, setMode]                 = useState<'idle' | 'editing'>('idle')
  const [editedContent, setEditedContent] = useState(originalContent)
  const [editorNotes, setEditorNotes]   = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [done, setDone]                 = useState(false)

  async function callWebhook(payload: Record<string, string>) {
    setError(null)
    const res = await fetch('/api/webhooks/post-approved', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }

  async function handleReject() {
    try {
      await callWebhook({ reviewItemId: itemId, status: 'rejected', reviewedBy: 'operator' })
      setDone(true)
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleApprove() {
    try {
      await callWebhook({ reviewItemId: itemId, reviewedBy: 'operator' })
      setDone(true)
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSaveEdit() {
    if (!editedContent.trim()) return
    try {
      await callWebhook({
        reviewItemId: itemId,
        finalContent: editedContent,
        editorNotes,
        reviewedBy:   'operator',
      })
      setDone(true)
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (done) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1D9E75' }}>
        <i className="ti ti-check" style={{ fontSize: 15 }} aria-hidden="true" />
        Done — refreshing queue…
      </div>
    )
  }

  const btnBase: React.CSSProperties = {
    fontSize:     13,
    padding:      '6px 16px',
    borderRadius: 8,
    cursor:       isPending ? 'not-allowed' : 'pointer',
    border:       '0.5px solid',
    background:   'transparent',
    opacity:      isPending ? 0.5 : 1,
    display:      'inline-flex',
    alignItems:   'center',
    gap:          6,
    transition:   'opacity 0.15s',
  }

  return (
    <div>
      {mode === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleApprove}
            disabled={isPending}
            style={{ ...btnBase, borderColor: '#1D9E75', color: '#1D9E75' }}
          >
            <i className="ti ti-check" aria-hidden="true" />
            Approve
          </button>
          <button
            onClick={() => setMode('editing')}
            disabled={isPending}
            style={{ ...btnBase, borderColor: '#7F77DD', color: '#7F77DD' }}
          >
            <i className="ti ti-edit" aria-hidden="true" />
            Edit &amp; approve
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            style={{ ...btnBase, borderColor: '#444', color: '#666' }}
          >
            <i className="ti ti-x" aria-hidden="true" />
            Reject
          </button>
        </div>
      )}

      {mode === 'editing' && (
        <div>
          <textarea
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            rows={6}
            style={{
              width:        '100%',
              fontSize:     14,
              fontFamily:   'Georgia, serif',
              lineHeight:   1.6,
              background:   '#0a0a0a',
              color:        '#ddd',
              border:       '0.5px solid #333',
              borderRadius: 8,
              padding:      '10px 12px',
              resize:       'vertical',
              marginBottom: 8,
            }}
          />
          <input
            type="text"
            value={editorNotes}
            onChange={e => setEditorNotes(e.target.value)}
            placeholder="Editor notes (optional)"
            style={{
              width:        '100%',
              fontSize:     13,
              background:   '#0a0a0a',
              color:        '#aaa',
              border:       '0.5px solid #2a2a2a',
              borderRadius: 8,
              padding:      '7px 12px',
              marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSaveEdit}
              disabled={isPending || !editedContent.trim()}
              style={{ ...btnBase, borderColor: '#7F77DD', color: '#7F77DD' }}
            >
              <i className="ti ti-check" aria-hidden="true" />
              Save &amp; approve
            </button>
            <button
              onClick={() => { setMode('idle'); setEditedContent(originalContent) }}
              disabled={isPending}
              style={{ ...btnBase, borderColor: '#333', color: '#555' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#E24B4A', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 14 }} aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  )
}
