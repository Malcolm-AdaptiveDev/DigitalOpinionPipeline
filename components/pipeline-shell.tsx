import Link      from 'next/link'
import type { ReactNode } from 'react'

export function PipelineShell({
  children,
  active,
}: {
  children:  ReactNode
  active:    'dashboard' | 'review'
}) {
  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   '0.5px solid #1e1e1e',
        paddingBottom:  '1.25rem',
        marginBottom:   '1.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0, color: '#ededed' }}>
            Persona Pipeline
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#444', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#1D9E75' }} />
            System operational
          </p>
        </div>

        <nav style={{ display: 'flex', gap: 6 }}>
          {([
            { href: '/',          label: 'Dashboard', key: 'dashboard' },
            { href: '/dashboard', label: 'Review queue', key: 'review' },
          ] as const).map(item => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                padding:        '7px 14px',
                borderRadius:   20,
                fontSize:       13,
                textDecoration: 'none',
                background:     item.key === active ? '#1a1a1a' : 'transparent',
                border:         `0.5px solid ${item.key === active ? '#333' : '#1a1a1a'}`,
                color:          item.key === active ? '#ddd' : '#555',
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
