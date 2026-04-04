import React, { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useProjects, useBuckets, useStates, useFocuses, fmtRelative, hexToRgba } from '../hooks/useProjects'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { Project, State, WeeklyFocus } from '../types'

export function FocusView() {
  const { data: projects = [] } = useProjects()
  const { data: states = [] } = useStates()
  const { data: focuses = [] } = useFocuses()
  const { openDrawer } = useAppStore()

  const { data: buckets = [] } = useBuckets()
  const stateMap = Object.fromEntries(states.map(s => [s.id, s]))
  const bucketMap = Object.fromEntries(buckets.map(b => [b.id, b]))
  const focusedIds = new Set(focuses.map(f => f.project_id))
  const unfocusedProjects = projects.filter(p => !focusedIds.has(p.id))

  // Projects with target dates
  const withDates = projects.filter(p => p.target_date)

  return (
    <div style={{ padding: 24, paddingBottom: 100, maxWidth: 1100, margin: '0 auto' }}>

      {/* Section 1: This Week's Focus */}
      <ThisWeekFocus
        projects={projects}
        focuses={focuses}
        stateMap={stateMap}
        bucketMap={bucketMap}
        unfocusedProjects={unfocusedProjects}
        onOpenDrawer={openDrawer}
      />

      {/* Section 2: Release Timeline */}
      {withDates.length > 0 && (
        <ReleaseTimeline projects={withDates} stateMap={stateMap} />
      )}

      {/* Section 3: Portfolio Progress */}
      <PortfolioProgress
        projects={projects}
        states={states}
        stateMap={stateMap}
        onOpenDrawer={openDrawer}
      />
    </div>
  )
}


// ── This Week's Focus ────────────────────────────────────────────────────────

function ThisWeekFocus({ projects, focuses, stateMap, bucketMap, unfocusedProjects, onOpenDrawer }: {
  projects: Project[]
  focuses: WeeklyFocus[]
  stateMap: Record<string, { name: string; color: string }>
  bucketMap: Record<string, { name: string; color: string }>
  unfocusedProjects: Project[]
  onOpenDrawer: (id: string) => void
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const addFocus = useMutation({
    mutationFn: (projectId: string) => api.focus.create({ project_id: projectId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['focuses'] }); setAdding(false) },
  })

  const removeFocus = useMutation({
    mutationFn: (focusId: string) => api.focus.delete(focusId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['focuses'] }),
  })

  const updateFocus = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      api.focus.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['focuses'] }),
  })

  async function handleDrop(draggedId: string, targetIdx: number) {
    const ordered = [...focuses].sort((a, b) => a.position - b.position)
    const dragged = ordered.find(f => f.id === draggedId)
    if (!dragged) return
    const without = ordered.filter(f => f.id !== draggedId)
    without.splice(targetIdx, 0, dragged)
    // Batch update positions
    const updates = without.map((f, i) =>
      f.position !== i ? api.focus.update(f.id, { position: i }) : null
    ).filter(Boolean)
    await Promise.all(updates)
    qc.invalidateQueries({ queryKey: ['focuses'] })
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))
  const sortedFocuses = [...focuses].sort((a, b) => a.position - b.position)

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Current Focus</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {focuses.length} project{focuses.length !== 1 ? 's' : ''} in focus
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setAdding(!adding)}>
          + Add to Focus
        </button>
      </div>

      {adding && (
        <div style={{
          marginBottom: 14, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {unfocusedProjects.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>All projects are already in focus.</span>
          ) : (
            unfocusedProjects.map(p => (
              <button
                key={p.id}
                className="btn btn-sm"
                onClick={() => addFocus.mutate(p.id)}
                disabled={addFocus.isPending}
              >{p.name}</button>
            ))
          )}
        </div>
      )}

      {focuses.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--muted)',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
          <p style={{ fontSize: 13 }}>No projects in focus yet. Add projects you want to commit to.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, alignItems: 'stretch' }}>
        {sortedFocuses.map((f, idx) => {
          const project = projectMap[f.project_id]
          if (!project) return null
          const state = stateMap[project.state_id ?? '']
          const bucket = bucketMap[project.bucket_id]
          return (
            <FocusCard
              key={f.id}
              focus={f}
              project={project}
              state={state}
              bucket={bucket}
              index={idx}
              isDragging={dragId === f.id}
              showDropBefore={dropIndex === idx && dragId !== f.id}
              onDragStart={() => setDragId(f.id)}
              onDragEnd={() => { setDragId(null); setDropIndex(null) }}
              onDragOver={(pos) => setDropIndex(pos === 'before' ? idx : idx + 1)}
              onDrop={() => { if (dragId) { handleDrop(dragId, idx); setDragId(null); setDropIndex(null) } }}
              onRemove={() => removeFocus.mutate(f.id)}
              onUpdate={(data) => updateFocus.mutate({ id: f.id, data })}
              onOpenDrawer={() => onOpenDrawer(project.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function FocusCard({ focus, project, state, bucket, index, isDragging, showDropBefore, onDragStart, onDragEnd, onDragOver, onDrop, onRemove, onUpdate, onOpenDrawer }: {
  focus: WeeklyFocus
  project: Project
  state?: { name: string; color: string }
  bucket?: { name: string; color: string }
  index: number
  isDragging: boolean
  showDropBefore: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (pos: 'before' | 'after') => void
  onDrop: () => void
  onRemove: () => void
  onUpdate: (data: { commitment?: string; tasks?: any[]; notes?: string; notes_pinned?: boolean }) => void
  onOpenDrawer: () => void
}) {
  const [tasks, setTasks] = useState<{ text: string; done: boolean }[]>(focus.tasks || [])
  const [newTask, setNewTask] = useState('')
  const [notes, setNotes] = useState(focus.notes || '')
  const [notesPinned, setNotesPinned] = useState(focus.notes_pinned)
  const [showNotes, setShowNotes] = useState(focus.notes_pinned)
  const pct = project.completion_pct

  function addTask() {
    if (!newTask.trim()) return
    const updated = [...tasks, { text: newTask.trim(), done: false }]
    setTasks(updated)
    setNewTask('')
    onUpdate({ tasks: updated })
  }

  function toggleTask(idx: number) {
    const updated = tasks.map((t, i) => i === idx ? { ...t, done: !t.done } : t)
    setTasks(updated)
    onUpdate({ tasks: updated })
  }

  function removeTask(idx: number) {
    const updated = tasks.filter((_, i) => i !== idx)
    setTasks(updated)
    onUpdate({ tasks: updated })
  }

  function saveNotes() {
    if (notes !== (focus.notes || '')) onUpdate({ notes })
  }

  function togglePin() {
    const pinned = !notesPinned
    setNotesPinned(pinned)
    setShowNotes(pinned || showNotes)
    onUpdate({ notes_pinned: pinned })
  }

  const cardRef = useRef<HTMLDivElement>(null)

  function handleCardDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    onDragOver(e.clientX < midX ? 'before' : 'after')
  }

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onDragOver={handleCardDragOver}
      onDrop={e => { e.preventDefault(); onDrop() }}
      style={{
      background: 'var(--surface)',
      border: showDropBefore ? '1px solid var(--accent)' : '1px solid var(--border)',
      borderRadius: 12,
      opacity: isDragging ? 0.4 : 1,
      transform: isDragging ? 'scale(0.97)' : 'none',
      cursor: 'grab',
      transition: 'opacity 0.15s, transform 0.15s, border-color 0.15s',
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          onClick={onOpenDrawer}
          style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 1 }}
        >{project.name}</span>
        {state && (
          <span style={{
            padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase', background: hexToRgba(state.color, 0.15), color: state.color,
          }}>{state.name}</span>
        )}
        <button className="item-del" onClick={onRemove} title="Remove from focus">✕</button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--accent)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
      </div>

      {/* Target date */}
      {project.target_date && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Target: {new Date(project.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {new Date(project.target_date) < new Date() && (
            <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: 6 }}>overdue</span>
          )}
        </div>
      )}

      {/* Weekly tasks */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          Weekly Goals {tasks.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>({tasks.filter(t => t.done).length}/{tasks.length})</span>}
        </div>
        {tasks.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
            <input type="checkbox" checked={t.done} onChange={() => toggleTask(i)}
              style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 12, color: t.done ? 'var(--muted)' : 'var(--text)',
              textDecoration: t.done ? 'line-through' : 'none',
            }}>{t.text}</span>
            <button className="item-del" onClick={() => removeTask(i)} style={{ fontSize: 10, padding: '0 2px' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input
            className="field-input"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Add a goal..."
            style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
          />
        </div>
      </div>

      {/* Notes — pinned or expandable */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>
            Notes
          </span>
          <button
            onClick={togglePin}
            title={notesPinned ? 'Unpin notes' : 'Pin notes to card'}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 12, color: notesPinned ? 'var(--accent)' : 'var(--muted)',
              padding: '0 2px', transition: 'color 0.1s',
            }}
          >{notesPinned ? '📌' : '📌'}</button>
          {!notesPinned && (
            <button
              onClick={() => setShowNotes(!showNotes)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 9, color: 'var(--muted)', padding: '0 2px',
              }}
            >{showNotes ? '▾ hide' : '▸ show'}</button>
          )}
        </div>
        {(showNotes || notesPinned) && (
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Quick notes..."
            style={{
              width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 8px', fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font)',
              resize: 'vertical', minHeight: 40, outline: 'none', lineHeight: 1.5,
            }}
          />
        )}
      </div>

      {/* Next steps preview from project */}
      {project.next_steps.filter(s => !s.done).length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>From project steps</div>
          {project.next_steps.filter(s => !s.done).slice(0, 3).map(s => (
            <div key={s.id} style={{ padding: '2px 0' }}>
              <span style={{ color: 'var(--accent)' }}>{'→ '}</span>{s.text}
            </div>
          ))}
        </div>
      )}

      {/* Priority + Category footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 'auto' }}>
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          color: project.priority === 'high' ? '#ef4444' : project.priority === 'low' ? 'var(--muted)' : 'var(--text)',
        }}>{project.priority}</span>
        {bucket && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: bucket.color, flexShrink: 0 }} />
            {bucket.name}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
          {fmtRelative(project.updated_at)}
        </span>
      </div>
    </div>
  )
}


// ── Release Timeline ─────────────────────────────────────────────────────────

function ReleaseTimeline({ projects, stateMap }: {
  projects: Project[]
  stateMap: Record<string, { name: string; color: string }>
}) {
  const sorted = [...projects].sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
  const now = new Date()
  const earliest = new Date(Math.min(now.getTime(), ...sorted.map(p => new Date(p.target_date!).getTime())))
  const latest = new Date(Math.max(...sorted.map(p => new Date(p.target_date!).getTime())))
  const padMs = 86400000 * 7 // 1 week padding on each side
  const rangeStart = new Date(earliest.getTime() - padMs)
  const rangeEnd = new Date(latest.getTime() + padMs)
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  const toPct = (d: Date) => ((d.getTime() - rangeStart.getTime()) / rangeMs) * 100
  const nowPct = toPct(now)

  // Build month tick marks across the range
  const ticks: { label: string; pct: number }[] = []
  const tickDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  while (tickDate <= rangeEnd) {
    const pct = toPct(tickDate)
    if (pct >= 0 && pct <= 100) {
      ticks.push({
        label: tickDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pct,
      })
    }
    tickDate.setMonth(tickDate.getMonth() + 1)
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Release Timeline</h2>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '16px 20px 8px', position: 'relative',
      }}>
        {/* Time axis along the top */}
        <div style={{ position: 'relative', height: 22, marginBottom: 8 }}>
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <span style={{
                position: 'absolute', left: `${t.pct}%`, top: 0,
                fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)',
                transform: 'translateX(-50%)', whiteSpace: 'nowrap',
              }}>{t.label}</span>
              <div style={{
                position: 'absolute', left: `${t.pct}%`, top: 16, bottom: -4,
                width: 1, background: 'var(--border)', opacity: 0.5,
              }} />
            </React.Fragment>
          ))}
          {/* Today marker in axis */}
          <span style={{
            position: 'absolute', left: `${nowPct}%`, top: 0,
            fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700,
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          }}>Today</span>
        </div>

        {/* Rows */}
        <div style={{ position: 'relative' }}>
          {/* Today vertical line through rows */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${nowPct}%`,
            width: 1, background: 'var(--accent)', opacity: 0.35,
            zIndex: 1, pointerEvents: 'none',
          }} />

          {sorted.map(p => {
            const targetDate = new Date(p.target_date!)
            const targetPct = toPct(targetDate)
            const isOverdue = targetDate < now
            const barColor = isOverdue ? '#ef4444' : p.completion_pct >= 75 ? '#22c55e' : p.completion_pct >= 50 ? '#f59e0b' : 'var(--accent)'

            // Bar spans from timeline start (left edge) to target date
            const barLeft = 0
            const barWidth = Math.max(targetPct, 1)
            const completionWidth = Math.min(p.completion_pct, 100)

            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '6px 0' }}>
                <div style={{ flex: 1, position: 'relative', height: 22 }}>
                  {/* Track: from start to target date */}
                  <div style={{
                    position: 'absolute', top: 3, bottom: 3, left: `${barLeft}%`,
                    width: `${barWidth}%`,
                    background: 'var(--border)', borderRadius: 4, overflow: 'hidden',
                  }}>
                    {/* Completion fill within the track */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      width: `${completionWidth}%`,
                      background: barColor, borderRadius: 4, opacity: 0.8,
                    }} />
                  </div>
                  {/* Project name inside the bar */}
                  <span style={{
                    position: 'absolute', left: `${barLeft}%`, top: 0, bottom: 0,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: 8, fontSize: 11, fontWeight: 600,
                    color: 'var(--text)', whiteSpace: 'nowrap', zIndex: 2,
                    maxWidth: `${barWidth}%`, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.name}
                  </span>
                  {/* Target date label at the end of the track */}
                  {(() => {
                    const diffMs = targetDate.getTime() - now.getTime()
                    const diffDays = Math.ceil(diffMs / 86400000)
                    const daysLabel = isOverdue
                      ? `${Math.abs(diffDays)}d overdue`
                      : diffDays === 0 ? 'today' : diffDays === 1 ? '1d left' : `${diffDays}d left`
                    return (
                      <span style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${barWidth}%`, marginLeft: 6,
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 9, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', zIndex: 2,
                        color: isOverdue ? '#ef4444' : 'var(--muted)',
                      }}>
                        {targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span style={{ color: isOverdue ? '#ef4444' : 'var(--muted)', opacity: 0.8 }}>
                          {daysLabel}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>{p.completion_pct}%</span>
                      </span>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tick grid lines extending through rows */}
        <div style={{
          position: 'absolute', top: 38, bottom: 8, left: 20, right: 20,
          pointerEvents: 'none',
        }}>
          {ticks.map((t, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
              width: 1, background: 'var(--border)', opacity: 0.3,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Portfolio Progress ───────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
type ProgressSort = 'name' | 'state' | 'priority' | 'completion' | 'target' | 'activity'
type ProgressDir = 'asc' | 'desc'

const HIDDEN_BY_DEFAULT = new Set(['stalled', 'archived'])

function PortfolioProgress({ projects, states, stateMap, onOpenDrawer }: {
  projects: Project[]
  states: State[]
  stateMap: Record<string, { name: string; color: string }>
  onOpenDrawer: (id: string) => void
}) {
  const [sortField, setSortField] = useState<ProgressSort>('priority')
  const [sortDir, setSortDir] = useState<ProgressDir>('asc')
  const [hiddenStates, setHiddenStates] = useState<Set<string>>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem('vf-progress-hidden-states')
    if (saved) {
      try { return new Set(JSON.parse(saved)) } catch { /* fall through */ }
    }
    const hidden = new Set<string>()
    for (const s of states) {
      if (HIDDEN_BY_DEFAULT.has(s.name.toLowerCase())) hidden.add(s.id)
    }
    return hidden
  })
  const now = new Date()

  function toggleStateFilter(stateId: string) {
    setHiddenStates(prev => {
      const next = new Set(prev)
      if (next.has(stateId)) next.delete(stateId)
      else next.add(stateId)
      localStorage.setItem('vf-progress-hidden-states', JSON.stringify([...next]))
      return next
    })
  }

  function toggleSort(field: ProgressSort) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }

  const indicator = (field: ProgressSort) =>
    sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const visible = projects.filter(p => !hiddenStates.has(p.state_id ?? ''))

  const sorted = [...visible].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'state': cmp = (stateMap[a.state_id ?? '']?.name ?? '').localeCompare(stateMap[b.state_id ?? '']?.name ?? ''); break
      case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1); break
      case 'completion': cmp = a.completion_pct - b.completion_pct; break
      case 'target': {
        const aT = a.target_date ? new Date(a.target_date).getTime() : Infinity
        const bT = b.target_date ? new Date(b.target_date).getTime() : Infinity
        cmp = aT - bT; break
      }
      case 'activity': cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(); break
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  const gridCols = '1fr 90px 70px 140px 90px 70px'
  const headerStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.7px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Portfolio Progress</h2>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {states.map(s => {
            const active = !hiddenStates.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggleStateFilter(s.id)}
                style={{
                  padding: '2px 9px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                  border: '1px solid',
                  borderColor: active ? hexToRgba(s.color, 0.4) : 'var(--border)',
                  background: active ? hexToRgba(s.color, 0.12) : 'transparent',
                  color: active ? s.color : 'var(--muted)',
                  cursor: 'pointer', transition: 'all 0.12s',
                  textTransform: 'uppercase', letterSpacing: '0.3px',
                  opacity: active ? 1 : 0.5,
                }}
              >{s.name}</button>
            )
          })}
        </div>
      </div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={headerStyle} onClick={() => toggleSort('name')}>Project{indicator('name')}</span>
          <span style={headerStyle} onClick={() => toggleSort('state')}>State{indicator('state')}</span>
          <span style={headerStyle} onClick={() => toggleSort('priority')}>Priority{indicator('priority')}</span>
          <span style={headerStyle} onClick={() => toggleSort('completion')}>Completion{indicator('completion')}</span>
          <span style={headerStyle} onClick={() => toggleSort('target')}>Target{indicator('target')}</span>
          <span style={{ ...headerStyle, textAlign: 'right' }} onClick={() => toggleSort('activity')}>Activity{indicator('activity')}</span>
        </div>

        {sorted.map(p => {
          const state = stateMap[p.state_id ?? '']
          const isOverdue = p.target_date && new Date(p.target_date) < now
          return (
            <div
              key={p.id}
              onClick={() => onOpenDrawer(p.id)}
              style={{
                display: 'grid', gridTemplateColumns: gridCols,
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background 0.1s',
                alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              {state ? (
                <span style={{
                  padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase', background: hexToRgba(state.color, 0.15), color: state.color,
                  justifySelf: 'start',
                }}>{state.name}</span>
              ) : <span />}
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                color: p.priority === 'high' ? '#ef4444' : p.priority === 'low' ? 'var(--muted)' : 'var(--text)',
              }}>{p.priority}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', maxWidth: 70 }}>
                  <div style={{ width: `${p.completion_pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', minWidth: 34, textAlign: 'right' }}>{p.completion_pct}%</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: isOverdue ? '#ef4444' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                {p.target_date ? new Date(p.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', textAlign: 'right' }}>
                {fmtRelative(p.updated_at)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
