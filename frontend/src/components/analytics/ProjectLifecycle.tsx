import React, { useMemo } from 'react'
import type { LifecycleItem } from '../../types'

interface Props {
  data: LifecycleItem[]
}

export function ProjectLifecycle({ data }: Props) {
  if (data.length === 0) {
    return (
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Project Lifecycle</h3>
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
          No commit data yet.
        </div>
      </div>
    )
  }

  const { months, minDate, monthCount, barWidth } = useMemo(() => {
    const allDates = data.flatMap(p => [new Date(p.first_commit), new Date(p.last_commit)])
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))

    minDate.setDate(1)
    const monthCount = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + maxDate.getMonth() - minDate.getMonth() + 2

    const months: { label: string; offset: number }[] = []
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(minDate.getFullYear(), minDate.getMonth() + i, 1)
      months.push({
        label: d.toLocaleString('en', { month: 'short', year: i === 0 || d.getMonth() === 0 ? '2-digit' : undefined }),
        offset: i,
      })
    }

    return { months, minDate, monthCount, barWidth: Math.max(600, monthCount * 60) }
  }, [data])

  const ROW_HEIGHT = 32
  const LEFT = 180
  const chartWidth = barWidth
  const colWidth = (chartWidth - LEFT) / Math.max(monthCount, 1)

  function monthOffset(dateStr: string): number {
    const d = new Date(dateStr)
    return (d.getFullYear() - minDate.getFullYear()) * 12 + d.getMonth() - minDate.getMonth() +
      d.getDate() / 30
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Project Lifecycle</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {data.length} projects with commit history
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={chartWidth} height={data.length * ROW_HEIGHT + 30} style={{ display: 'block' }}>
          {/* Month labels */}
          {months.map((m, i) => (
            <g key={i}>
              <text x={LEFT + i * colWidth} y={12} fill="var(--muted)" fontSize={9} fontFamily="var(--mono)">
                {m.label}
              </text>
              <line x1={LEFT + i * colWidth} y1={18} x2={LEFT + i * colWidth} y2={data.length * ROW_HEIGHT + 20} stroke="var(--border)" strokeDasharray="2 4" />
            </g>
          ))}

          {/* Project rows */}
          {data.map((project, idx) => {
            const y = idx * ROW_HEIGHT + 26
            const startX = LEFT + monthOffset(project.first_commit) * colWidth
            const endX = LEFT + monthOffset(project.last_commit) * colWidth
            const barLen = Math.max(endX - startX, 4)

            // Activity intensity from monthly data
            const maxMonthly = Math.max(...project.monthly_activity.map(m => m.commits), 1)

            return (
              <g key={project.project_id}>
                {/* Project name */}
                <text x={LEFT - 8} y={y + 12} fill="var(--text)" fontSize={11} textAnchor="end" fontWeight={500}>
                  {project.project_name.length > 22 ? project.project_name.slice(0, 22) + '...' : project.project_name}
                </text>
                {/* Timeline bar */}
                <rect x={startX} y={y + 2} width={barLen} height={16} rx={3} fill="rgba(37,99,235,0.15)" />
                {/* Monthly activity segments */}
                {project.monthly_activity.map((m, mi) => {
                  const mDate = new Date(m.month + '-01')
                  const mOffset = (mDate.getFullYear() - minDate.getFullYear()) * 12 + mDate.getMonth() - minDate.getMonth()
                  const intensity = Math.min(m.commits / maxMonthly, 1)
                  return (
                    <rect
                      key={mi}
                      x={LEFT + mOffset * colWidth}
                      y={y + 2}
                      width={Math.max(colWidth - 1, 2)}
                      height={16}
                      rx={2}
                      fill={`rgba(37,99,235,${0.15 + intensity * 0.6})`}
                    >
                      <title>{m.month}: {m.commits} commits</title>
                    </rect>
                  )
                })}
                {/* Commit count */}
                <text x={endX + 6} y={y + 13} fill="var(--muted)" fontSize={9} fontFamily="var(--mono)">
                  {project.total_commits}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
