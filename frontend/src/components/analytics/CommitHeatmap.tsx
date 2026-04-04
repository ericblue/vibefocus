import React, { useMemo, useState } from 'react'
import type { HeatmapDay } from '../../types'
import type { Project } from '../../types'

interface Props {
  data: HeatmapDay[]
  projects?: Project[]
  onFilterChange?: (projectId: string | undefined, days: number | undefined) => void
  title?: string
}

const CELL_SIZE = 13
const CELL_GAP = 2
const TOTAL = CELL_SIZE + CELL_GAP
const DAYS_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type DateRange = '4w' | '3m' | '6m' | '1y'
type ViewMode = 'grid' | 'daily'

const DATE_RANGES: { value: DateRange; label: string; days: number; weeks: number }[] = [
  { value: '4w', label: '4 Weeks', days: 28, weeks: 4 },
  { value: '3m', label: '3 Months', days: 90, weeks: 13 },
  { value: '6m', label: '6 Months', days: 182, weeks: 26 },
  { value: '1y', label: '1 Year', days: 365, weeks: 52 },
]

function getColor(count: number, isDark: boolean): string {
  if (count === 0) return isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
  if (count <= 2) return isDark ? 'rgba(37,99,235,0.3)' : 'rgba(37,99,235,0.2)'
  if (count <= 5) return isDark ? 'rgba(37,99,235,0.55)' : 'rgba(37,99,235,0.4)'
  if (count <= 10) return isDark ? 'rgba(37,99,235,0.8)' : 'rgba(37,99,235,0.6)'
  return '#2563eb'
}

export function CommitHeatmap({ data, projects, onFilterChange, title = 'Commit Activity' }: Props) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('1y')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [year, setYear] = useState(new Date().getFullYear())
  const currentYear = new Date().getFullYear()

  const rangeConfig = DATE_RANGES.find(r => r.value === dateRange)!
  const canToggleView = dateRange === '4w' || dateRange === '3m'

  function handleProjectChange(projectId: string) {
    setSelectedProject(projectId)
    onFilterChange?.(projectId || undefined, rangeConfig.days)
  }

  function handleRangeChange(range: DateRange) {
    setDateRange(range)
    if (range !== '4w' && range !== '3m') setViewMode('grid')
    if (range !== '1y') setYear(currentYear) // reset year when switching away from 1y
    const config = DATE_RANGES.find(r => r.value === range)!
    onFilterChange?.(selectedProject || undefined, config.days)
  }

  // Re-fetch when year changes (need enough days to cover the selected year)
  function handleYearChange(newYear: number) {
    setYear(newYear)
    if (newYear === currentYear) {
      onFilterChange?.(selectedProject || undefined, 365)
    } else {
      // Calculate days from today back to Jan 1 of selected year
      const daysBack = Math.ceil((Date.now() - new Date(newYear, 0, 1).getTime()) / 86400000) + 1
      onFilterChange?.(selectedProject || undefined, daysBack)
    }
  }

  // Grid data (used by both views)
  const { grid, weeks, months, weekSummaries } = useMemo(() => {
    const map = new Map(data.map(d => [d.day, d.commits]))
    const today = new Date()
    const grid: { date: string; count: number; col: number; row: number }[] = []

    let endOfWeek: Date
    let startDate: Date

    if (dateRange === '1y' && year !== currentYear) {
      // Show the full selected year: Jan 1 – Dec 31
      startDate = new Date(year, 0, 1)
      endOfWeek = new Date(year, 11, 31)
      // Extend to full weeks
      endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()))
    } else {
      endOfWeek = new Date(today)
      endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()))
      startDate = new Date(endOfWeek)
      startDate.setDate(startDate.getDate() - (rangeConfig.weeks * 7) + 1)
    }

    let col = 0
    const d = new Date(startDate)
    d.setDate(d.getDate() - d.getDay())

    const months: { label: string; col: number }[] = []
    let lastMonth = -1
    const weeklyCommits: Map<number, { total: number; startDate: string; endDate: string }> = new Map()

    while (d <= endOfWeek) {
      const row = d.getDay()
      const dateStr = d.toISOString().slice(0, 10)
      const count = map.get(dateStr) ?? 0
      grid.push({ date: dateStr, count, col, row })

      const ws = weeklyCommits.get(col) ?? { total: 0, startDate: dateStr, endDate: dateStr }
      ws.total += count
      ws.endDate = dateStr
      weeklyCommits.set(col, ws)

      if (d.getMonth() !== lastMonth && row === 0) {
        months.push({ label: d.toLocaleString('en', { month: 'short' }), col })
        lastMonth = d.getMonth()
      }

      d.setDate(d.getDate() + 1)
      if (d.getDay() === 0) col++
    }

    const weekSummaries = Array.from(weeklyCommits.entries()).map(([col, ws]) => ({ col, ...ws }))
    return { grid, weeks: col + 1, months, weekSummaries }
  }, [data, rangeConfig, year, dateRange, currentYear])

  // Daily timeline data
  const dailyData = useMemo(() => {
    if (!canToggleView) return []
    const map = new Map(data.map(d => [d.day, d.commits]))
    const today = new Date()
    const days: { date: string; dow: number; count: number; monthLabel: string | null }[] = []

    const start = new Date(today)
    start.setDate(start.getDate() - rangeConfig.days + 1)

    let lastMonth = -1
    const d = new Date(start)
    while (d <= today) {
      const dateStr = d.toISOString().slice(0, 10)
      const count = map.get(dateStr) ?? 0
      const monthLabel = d.getMonth() !== lastMonth
        ? d.toLocaleString('en', { month: 'short', day: 'numeric' })
        : null
      if (d.getMonth() !== lastMonth) lastMonth = d.getMonth()
      days.push({ date: dateStr, dow: d.getDay(), count, monthLabel })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [data, rangeConfig, canToggleView])

  const filteredTotal = grid.reduce((s, c) => s + c.count, 0)
  const activeDays = grid.filter(c => c.count > 0).length
  const totalDays = grid.length
  const bestWeek = weekSummaries.reduce((best, w) => w.total > best.total ? w : best, { total: 0, startDate: '', endDate: '', col: 0 })
  const maxDaily = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.count), 1) : 1

  const projectsWithPath = projects?.filter(p => p.local_path) ?? []

  return (
    <div>
      {/* Header with controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>{title}</h3>

        {/* Project filter */}
        {projectsWithPath.length > 0 && (
          <select
            className="field-select"
            value={selectedProject}
            onChange={e => handleProjectChange(e.target.value)}
            style={{ maxWidth: 160, fontSize: 11, padding: '4px 8px' }}
          >
            <option value="">All Projects</option>
            {projectsWithPath.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Date range toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
          {DATE_RANGES.map((r, i) => (
            <button
              key={r.value}
              onClick={() => handleRangeChange(r.value)}
              style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 500, border: 'none',
                background: dateRange === r.value ? 'var(--surface2)' : 'transparent',
                color: dateRange === r.value ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer', fontFamily: 'var(--font)',
                borderRight: i < DATE_RANGES.length - 1 ? '1px solid var(--border2)' : 'none',
              }}
            >{r.label}</button>
          ))}
        </div>

        {/* Year navigation (only for 1y) */}
        {dateRange === '1y' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => handleYearChange(year - 1)}
              style={{
                background: 'transparent', border: '1px solid var(--border2)', borderRadius: 4,
                color: 'var(--muted)', cursor: 'pointer', padding: '2px 6px', fontSize: 11,
                fontFamily: 'var(--mono)', transition: 'color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
            >{'◀'}</button>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', minWidth: 40, textAlign: 'center' }}>
              {year}
            </span>
            <button
              onClick={() => handleYearChange(Math.min(year + 1, currentYear))}
              disabled={year >= currentYear}
              style={{
                background: 'transparent', border: '1px solid var(--border2)', borderRadius: 4,
                color: year >= currentYear ? 'var(--border2)' : 'var(--muted)',
                cursor: year >= currentYear ? 'default' : 'pointer',
                padding: '2px 6px', fontSize: 11, fontFamily: 'var(--mono)', transition: 'color 0.1s',
              }}
              onMouseEnter={e => { if (year < currentYear) e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { if (year < currentYear) e.currentTarget.style.color = 'var(--muted)' }}
            >{'▶'}</button>
          </div>
        )}

        {/* View mode toggle (only for 4w / 3m) */}
        {canToggleView && (
          <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
            {(['grid', 'daily'] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '3px 8px', fontSize: 10, fontWeight: 500, border: 'none',
                  background: viewMode === v ? 'var(--surface2)' : 'transparent',
                  color: viewMode === v ? 'var(--text)' : 'var(--muted)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                  borderRight: i === 0 ? '1px solid var(--border2)' : 'none',
                }}
              >{v === 'grid' ? 'Grid' : 'Daily'}</button>
            ))}
          </div>
        )}

        <span style={{ flex: 1 }} />

        {/* Stats summary */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {filteredTotal.toLocaleString()} commits
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {activeDays}/{totalDays} days active
          </span>
          {bestWeek.total > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }} title={`${bestWeek.startDate} – ${bestWeek.endDate}`}>
              best week: {bestWeek.total}
            </span>
          )}
        </div>
      </div>

      {/* Grid view (default) */}
      {viewMode === 'grid' && (
        <>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <svg
              width={weeks * TOTAL + 30}
              height={7 * TOTAL + 24}
              style={{ display: 'block' }}
            >
              {months.map((m, i) => (
                <text key={i} x={m.col * TOTAL + 30} y={10} fill="var(--muted)" fontSize={9} fontFamily="var(--mono)">
                  {m.label}
                </text>
              ))}
              {DAYS_LABELS.map((label, i) => (
                label ? (
                  <text key={i} x={0} y={i * TOTAL + 24 + 10} fill="var(--muted)" fontSize={9} fontFamily="var(--mono)">
                    {label}
                  </text>
                ) : null
              ))}
              {grid.map((cell, i) => (
                <rect
                  key={i}
                  x={cell.col * TOTAL + 30}
                  y={cell.row * TOTAL + 16}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  fill={getColor(cell.count, isDark)}
                  style={{ transition: 'fill 0.15s' }}
                >
                  <title>{cell.date}: {cell.count} commit{cell.count !== 1 ? 's' : ''}</title>
                </rect>
              ))}
            </svg>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginRight: 4 }}>Less</span>
            {[0, 1, 3, 6, 11].map(n => (
              <div key={n} style={{ width: 11, height: 11, borderRadius: 2, background: getColor(n, isDark) }} />
            ))}
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>More</span>
          </div>
        </>
      )}

      {/* Daily timeline view */}
      {viewMode === 'daily' && canToggleView && (
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 'fit-content' }}>
            {/* Week rows */}
            {(() => {
              // Group days into weeks (Sun-Sat)
              const weeks: typeof dailyData[] = []
              let currentWeek: typeof dailyData = []
              for (const day of dailyData) {
                if (day.dow === 0 && currentWeek.length > 0) {
                  weeks.push(currentWeek)
                  currentWeek = []
                }
                currentWeek.push(day)
              }
              if (currentWeek.length > 0) weeks.push(currentWeek)

              const barHeight = 28
              const dayWidth = dateRange === '4w' ? 32 : 11

              return (
                <>
                  {/* Day-of-week header */}
                  {dateRange === '4w' && (
                    <div style={{ display: 'flex', gap: 0, marginBottom: 2 }}>
                      {DOW_SHORT.map(d => (
                        <div key={d} style={{
                          width: dayWidth, textAlign: 'center',
                          fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)', fontWeight: 600,
                        }}>{d}</div>
                      ))}
                    </div>
                  )}

                  {weeks.map((week, wi) => {
                    // Week label
                    const weekStart = week[0]
                    const weekLabel = new Date(weekStart.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })

                    return (
                      <div key={wi} style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 2 }}>
                        {/* Pad leading empty days for partial first week */}
                        {wi === 0 && week[0].dow > 0 && (
                          Array.from({ length: week[0].dow }).map((_, i) => (
                            <div key={`pad-${i}`} style={{ width: dayWidth, height: barHeight }} />
                          ))
                        )}
                        {week.map(day => (
                          <div
                            key={day.date}
                            title={`${day.date} (${DOW_SHORT[day.dow]}): ${day.count} commit${day.count !== 1 ? 's' : ''}`}
                            style={{
                              width: dayWidth,
                              height: barHeight,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              position: 'relative',
                            }}
                          >
                            {/* Bar */}
                            <div style={{
                              width: dateRange === '4w' ? 22 : 8,
                              height: day.count > 0 ? Math.max(4, (day.count / maxDaily) * (barHeight - 4)) : 2,
                              background: day.count > 0 ? getColor(day.count, isDark) : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                              borderRadius: 2,
                              transition: 'height 0.2s',
                            }} />
                            {/* Commit count for 4w view */}
                            {dateRange === '4w' && day.count > 0 && (
                              <span style={{
                                fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--mono)',
                                position: 'absolute', top: -1,
                              }}>{day.count}</span>
                            )}
                          </div>
                        ))}
                        {/* Week label on the right */}
                        <span style={{
                          fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)',
                          marginLeft: 8, whiteSpace: 'nowrap', minWidth: 50,
                        }}>
                          {weekLabel}
                          <span style={{ marginLeft: 6, color: 'var(--accent)', fontWeight: 600 }}>
                            {week.reduce((s, d) => s + d.count, 0) || ''}
                          </span>
                        </span>
                      </div>
                    )
                  })}

                  {/* Day-of-week footer for 3m (since header would be too cramped) */}
                  {dateRange === '3m' && (
                    <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
                      {DOW_SHORT.map(d => (
                        <div key={d} style={{
                          width: dayWidth, textAlign: 'center',
                          fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--mono)',
                        }}>{d.charAt(0)}</div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
