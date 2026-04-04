import React, { useState } from 'react'
import type { TechStackItem } from '../../types'

type TopFilter = 5 | 10 | 15 | 'all'

interface Props {
  data: TechStackItem[]
}

const TECH_COLORS: Record<string, string> = {
  Python: '#3572A5', TypeScript: '#3178c6', JavaScript: '#f1e05a',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219',
  'C++': '#f34b7d', Ruby: '#701516', Swift: '#F05138',
  Kotlin: '#A97BFF', React: '#61dafb', Vue: '#42b883',
  FastAPI: '#009688', Django: '#0C4B33', Next: '#000000',
}

function getColor(tech: string): string {
  return TECH_COLORS[tech] ?? '#64748b'
}

export function TechStackPortfolio({ data }: Props) {
  if (data.length === 0) {
    return (
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Tech Stack</h3>
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
          Run code analysis on projects to see tech stack data.
        </div>
      </div>
    )
  }

  const [topFilter, setTopFilter] = useState<TopFilter>(10)
  const visible = topFilter === 'all' ? data : data.slice(0, topFilter)
  const maxCount = Math.max(...visible.map(d => d.project_count))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Tech Stack</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {data.length} technologies across projects
        </span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
          {([5, 10, 15, 'all'] as TopFilter[]).map(v => (
            <button key={v} onClick={() => setTopFilter(v)} style={{
              padding: '3px 8px', fontSize: 10, fontWeight: 500, border: 'none',
              background: topFilter === v ? 'var(--surface2)' : 'transparent',
              color: topFilter === v ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'var(--font)',
              borderRight: v !== 'all' ? '1px solid var(--border2)' : 'none',
            }}>{v === 'all' ? 'All' : `Top ${v}`}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(item => {
          const pct = (item.project_count / maxCount) * 100
          const color = getColor(item.tech)
          return (
            <div key={item.tech} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${pct}%`, background: color, opacity: 0.08,
                transition: 'width 0.3s',
              }} />
              <span style={{
                width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0,
                position: 'relative',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 80, position: 'relative' }}>
                {item.tech}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', position: 'relative' }}>
                {item.project_count} project{item.project_count !== 1 ? 's' : ''}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)', position: 'relative', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.projects.join(', ')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
