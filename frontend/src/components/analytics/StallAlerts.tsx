import React from 'react'
import type { HealthItem } from '../../types'

interface Props {
  data: HealthItem[]
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active:  { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', label: 'Active' },
  cooling: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Cooling' },
  dormant: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', label: 'Dormant' },
}

export function StallAlerts({ data }: Props) {
  const transitions = data.filter(d => d.transition)
  const dormant = data.filter(d => d.status === 'dormant')
  const cooling = data.filter(d => d.status === 'cooling')

  if (data.length === 0) return null

  const active = data.filter(d => d.status === 'active').length
  const coolingCount = cooling.length
  const dormantCount = dormant.length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Portfolio Health</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <HealthBadge count={active} status="active" />
          <HealthBadge count={coolingCount} status="cooling" />
          <HealthBadge count={dormantCount} status="dormant" />
        </div>
      </div>

      {transitions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {transitions.map(item => (
            <div key={item.project_id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
              marginBottom: 4, fontSize: 12,
            }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.project_name}</span>
              <StatusBadge status={item.transition!.from} />
              <span style={{ color: 'var(--muted)' }}>→</span>
              <StatusBadge status={item.transition!.to} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
        {data.map(item => {
          const s = STATUS_STYLES[item.status] ?? STATUS_STYLES.dormant
          return (
            <div key={item.project_id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.project_name}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                {item.commits_7d}/{item.commits_30d}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HealthBadge({ count, status }: { count: number; status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.dormant
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ fontFamily: 'var(--mono)' }}>{count}</span>
      {s.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.dormant
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.3px',
    }}>{s.label}</span>
  )
}
