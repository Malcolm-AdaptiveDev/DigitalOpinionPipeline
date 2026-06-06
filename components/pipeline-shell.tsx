import Link      from 'next/link'
import type { ReactNode } from 'react'

export function PipelineShell({
  children,
  active,
}: {
  children:  ReactNode
  active:    'dashboard' | 'review' | 'budget'
}) {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   '0.5px solid #2a2f3a',
        paddingBottom:  '1.25rem',
        marginBottom:   '1.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#f4f6fb' }}>
            Persona Pipeline
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9aa3b2', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#1D9E75' }} />
            System operational
          </p>
        </div>

        <nav style={{ display: 'flex', gap: 6 }}>
          {([
            { href: '/',          label: 'Dashboard', key: 'dashboard' },
            { href: '/dashboard', label: 'Review queue', key: 'review' },
            { href: '/dashboard?tab=budget', label: 'Calculator', key: 'budget' },
          ] as const).map(item => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                padding:        '7px 14px',
                borderRadius:   20,
                fontSize:       13,
                textDecoration: 'none',
                background:     item.key === active ? '#1b2330' : '#11141a',
                border:         `0.5px solid ${item.key === active ? '#3a4352' : '#2a2f3a'}`,
                color:          item.key === active ? '#edf0f6' : '#a5adba',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </div>
  )
}
