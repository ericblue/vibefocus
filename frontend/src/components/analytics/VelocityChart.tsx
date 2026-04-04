import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { VelocityWeek, ProjectVelocityWeek } from '../../types'

interface PortfolioProps {
  data: VelocityWeek[]
}

interface ProjectProps {
  data: ProjectVelocityWeek[]
}

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#0ea5e9', '#ef4444', '#ec4899']

export function VelocityChart({ data }: PortfolioProps) {
  const { chartData, projectNames } = useMemo(() => {
    const weeks = new Map<string, Record<string, number>>()
    const names = new Set<string>()

    for (const row of data) {
      names.add(row.project_name)
      const existing = weeks.get(row.week) ?? {}
      existing[row.project_name] = row.commits
      weeks.set(row.week, existing)
    }

    const projectNames = Array.from(names)
    const chartData = Array.from(weeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, projects]) => ({ week: week.slice(5), ...projects }))

    return { chartData, projectNames }
  }, [data])

  if (chartData.length === 0) {
    return <EmptyState label="Velocity Trends" />
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Velocity Trends</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval="preserveStartEnd" label={{ value: 'Week', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} label={{ value: 'Commits', angle: -90, position: 'insideLeft', offset: 16, fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--muted)' }}
          />
          {projectNames.map((name, i) => (
            <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === projectNames.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ProjectVelocityChart({ data }: ProjectProps) {
  const chartData = useMemo(
    () => data.map(d => ({ ...d, week: d.week.slice(5) })),
    [data]
  )

  if (chartData.length === 0) return <EmptyState label="Velocity" />

  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Velocity</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval="preserveStartEnd" label={{ value: 'Week', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} label={{ value: 'Commits', angle: -90, position: 'insideLeft', offset: 16, fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="commits" fill="#2563eb" radius={[2, 2, 0, 0]} name="Commits" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Inline sparkline for project cards
export function VelocitySparkline({ data }: { data: ProjectVelocityWeek[] }) {
  if (data.length < 2) return null

  const max = Math.max(...data.map(d => d.commits), 1)
  const width = 80
  const height = 24
  const barWidth = Math.max(2, (width / data.length) - 1)

  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      {data.slice(-12).map((d, i, arr) => {
        const barH = (d.commits / max) * (height - 2)
        return (
          <rect
            key={i}
            x={i * (barWidth + 1)}
            y={height - barH - 1}
            width={barWidth}
            height={Math.max(1, barH)}
            rx={1}
            fill={i === arr.length - 1 ? '#2563eb' : 'rgba(37,99,235,0.4)'}
          />
        )
      })}
    </svg>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{label}</h3>
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
        No commit data yet. Sync git logs to see velocity trends.
      </div>
    </div>
  )
}
