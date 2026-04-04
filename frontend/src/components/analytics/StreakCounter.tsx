import React from 'react'
import type { StreakData } from '../../types'

interface Props {
  data: StreakData
}

export function StreakCounter({ data }: Props) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <StreakCard
        label="Current Streak"
        value={data.current_streak}
        unit="days"
        accent={data.current_streak > 0 ? '#22c55e' : 'var(--muted)'}
      />
      <StreakCard
        label="Longest Streak"
        value={data.longest_streak}
        unit="days"
        accent="#f59e0b"
      />
      <StreakCard
        label="Days Tracked"
        value={data.days_tracked}
        unit="since first commit"
        accent="#8b5cf6"
      />
      <StreakCard
        label="Active Days"
        value={data.total_active_days}
        unit={data.days_tracked > 0 ? `${Math.round((data.total_active_days / data.days_tracked) * 100)}% of tracked` : 'total'}
        accent="#2563eb"
      />
    </div>
  )
}

function StreakCard({ label, value, unit, accent }: { label: string; value: number; unit: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.9px', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', color: accent }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{unit}</div>
    </div>
  )
}

// Compact inline version for the dashboard header
export function StreakBadge({ data }: Props) {
  if (data.current_streak === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 6,
      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
      fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
    }}>
      {data.current_streak}d streak
    </span>
  )
}
