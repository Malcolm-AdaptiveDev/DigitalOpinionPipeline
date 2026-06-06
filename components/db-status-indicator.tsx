'use client'

import { useEffect, useState } from 'react'
import type { DbConnectionStatus } from '@/lib/db-overview'

export function DbStatusIndicator({ mockMode = false }: { mockMode?: boolean }) {
  const [status, setStatus] = useState<DbConnectionStatus | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/health${mockMode ? '?mock=1' : ''}`)
      .then(res => res.json())
      .then(data => {
        if (alive) setStatus(data.db)
      })
      .catch(err => {
        if (alive) {
          setStatus({
            connected: false,
            mode: mockMode ? 'mock' : 'live',
            checkedAt: new Date().toISOString(),
            message: (err as Error).message,
          })
        }
      })
    return () => {
      alive = false
    }
  }, [mockMode])

  const connected = status?.connected ?? false
  const color = connected ? '#1D9E75' : '#E24B4A'
  const label = status
    ? `${status.mode === 'mock' ? 'Mock DB' : 'DB'} ${connected ? 'connected' : 'offline'}`
    : 'Checking DB'

  return (
    <span title={status?.message ?? 'Checking database connection'} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      color: connected ? '#9aa3b2' : '#E24B4A',
      fontSize: 12,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
      {status?.latencyMs !== undefined && <span style={{ color: '#687386' }}>{status.latencyMs}ms</span>}
    </span>
  )
}
