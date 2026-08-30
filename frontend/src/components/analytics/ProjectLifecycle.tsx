import React, { useMemo, useRef, useEffect, useState } from 'react'
import type { LifecycleItem } from '../../types'

interface Props {
  data: LifecycleItem[]
}

export function ProjectLifecycle({ data }: Props) {
  const { months, minDate, monthCount, barWidth } = useMemo(() => {
    if (data.length === 0) {
      const now = new Date()
      now.setDate(1)
      return { months: [], minDate: now, monthCount: 0, barWidth: 720 }
    }

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

    return { months, minDate, monthCount, barWidth: Math.max(900, monthCount * 64) }
  }, [data])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollPct, setScrollPct] = useState(1000)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const maxScroll = el.scrollWidth - el.clientWidth
      el.scrollLeft = maxScroll
      setScrollPct(maxScroll > 0 ? 1000 : 0)
    })
    return () => cancelAnimationFrame(frame)
  }, [data])

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

  const ROW_HEIGHT = 32
  const LABEL_WIDTH = 180
  const HEADER_HEIGHT = 26
  const chartWidth = barWidth
  const colWidth = chartWidth / Math.max(monthCount, 1)

  function monthOffset(dateStr: string): number {
    const d = new Date(dateStr)
    return (d.getFullYear() - minDate.getFullYear()) * 12 + d.getMonth() - minDate.getMonth() +
      d.getDate() / 30
  }

  function scrollToPct(value: number) {
    setScrollPct(value)
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    el.scrollLeft = maxScroll * (value / 1000)
  }

  function handleTimelineScroll() {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setScrollPct(maxScroll > 0 ? Math.round((el.scrollLeft / maxScroll) * 1000) : 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Project Lifecycle</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {data.length} projects with commit history
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)`,
        alignItems: 'start',
        marginBottom: 8,
      }}>
        <div />
        <input
          className="lifecycle-range"
          type="range"
          aria-label="Scroll project lifecycle timeline"
          min={0}
          max={1000}
          value={scrollPct}
          onChange={e => scrollToPct(Number(e.currentTarget.value))}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)`,
        alignItems: 'start',
      }}>
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: 'var(--surface)',
          boxShadow: '12px 0 18px -18px rgba(0,0,0,0.8)',
        }}>
          <div style={{
            height: HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            fontSize: 9,
            fontFamily: 'var(--mono)',
            color: 'var(--muted)',
          }}>
            Project
          </div>
          {data.map(project => (
            <div key={project.project_id} style={{
              height: ROW_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              paddingRight: 12,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }} title={project.project_name}>
              {project.project_name}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="lifecycle-timeline"
          onScroll={handleTimelineScroll}
          style={{
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
          }}
        >
          <svg width={chartWidth + 56} height={data.length * ROW_HEIGHT + HEADER_HEIGHT} style={{ display: 'block' }}>
          {/* Month labels */}
          {months.map((m, i) => (
            <g key={i}>
              <text x={i * colWidth} y={12} fill="var(--muted)" fontSize={9} fontFamily="var(--mono)">
                {m.label}
              </text>
              <line x1={i * colWidth} y1={18} x2={i * colWidth} y2={data.length * ROW_HEIGHT + 20} stroke="var(--border)" strokeDasharray="2 4" />
            </g>
          ))}

          {/* Project rows */}
          {data.map((project, idx) => {
            const y = idx * ROW_HEIGHT + HEADER_HEIGHT
            const startX = monthOffset(project.first_commit) * colWidth
            const endX = monthOffset(project.last_commit) * colWidth
            const barLen = Math.max(endX - startX, 4)

            // Activity intensity from monthly data
            const maxMonthly = Math.max(...project.monthly_activity.map(m => m.commits), 1)

            return (
              <g key={project.project_id}>
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
                      x={mOffset * colWidth}
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
    </div>
  )
}
