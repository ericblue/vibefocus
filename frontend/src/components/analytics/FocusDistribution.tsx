import React, { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { FocusItem } from '../../types'

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#0ea5e9', '#ef4444', '#ec4899']

interface Props {
  data: FocusItem[]
  onPeriodChange?: (period: string) => void
}

export function FocusDistribution({ data, onPeriodChange }: Props) {
  const [period, setPeriod] = useState('month')

  const handlePeriod = (p: string) => {
    setPeriod(p)
    onPeriodChange?.(p)
  }

  if (data.length === 0) {
    return (
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Focus Distribution</h3>
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
          No commit data yet.
        </div>
      </div>
    )
  }

  const chartData = data.map(d => ({
    name: d.project_name,
    value: d.commits,
    percentage: d.percentage,
    lines: d.lines_changed,
  }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Focus Distribution</h3>
        <div style={{ display: 'flex', gap: 2 }}>
          {['week', 'month', 'quarter'].map(p => (
            <button
              key={p}
              onClick={() => handlePeriod(p)}
              style={{
                padding: '3px 9px', borderRadius: 4, border: 'none',
                background: period === p ? 'var(--surface2)' : 'transparent',
                color: period === p ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font)',
                fontWeight: 600, textTransform: 'capitalize',
              }}
            >{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <ResponsiveContainer width="50%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="value"
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              formatter={(value, name, props) => [`${(props.payload as any).percentage}% (${value} commits)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.slice(0, 8).map((item, i) => (
            <div key={item.project_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.project_name}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', flexShrink: 0 }}>
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
