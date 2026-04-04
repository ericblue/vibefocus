import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ContributionPatterns as PatternsType } from '../../types'

interface Props {
  data: PatternsType
}

export function ContributionPatterns({ data }: Props) {
  if (!data.by_hour?.length && !data.by_dow?.length) {
    return (
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Contribution Patterns</h3>
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
          No commit data yet.
        </div>
      </div>
    )
  }

  const peakHour = data.by_hour.reduce((max, h) => h.commits > max.commits ? h : max, data.by_hour[0])
  const peakDay = data.by_dow.reduce((max, d) => d.commits > max.commits ? d : max, data.by_dow[0])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Contribution Patterns</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Peak: {peakDay?.day}s at {peakHour?.hour}:00
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* By hour */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
            Time of Day
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data.by_hour} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: 'var(--muted)' }}
                tickFormatter={(h: number) => h % 4 === 0 ? `${h}` : ''}
              />
              <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(h) => `${h}:00`}
              />
              <Bar dataKey="commits" fill="#2563eb" radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By day of week */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
            Day of Week
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data.by_dow} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="commits" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
