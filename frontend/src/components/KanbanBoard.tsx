import React, { useState, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useBuckets, useStates, fmtRelative, hexToRgba } from '../hooks/useProjects'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { Project, Bucket, State } from '../types'

export function KanbanBoard() {
  const { data: projects = [] } = useProjects()
  const { data: buckets = [] } = useBuckets()
  const { data: states = [] } = useStates()
  const { openDrawer } = useAppStore()
  const qc = useQueryClient()

  const [searchText, setSearchText] = useState('')
  const [filterBucket, setFilterBucket] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')

  const hasFilters = !!(searchText || filterBucket || filterPriority)

  const filtered = useMemo(() => {
    let result = projects
    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      )
    }
    if (filterBucket) result = result.filter(p => p.bucket_id === filterBucket)
    if (filterPriority) result = result.filter(p => p.priority === filterPriority)
    return result
  }, [projects, searchText, filterBucket, filterPriority])

  // Group filtered projects by state_id, sorted by kanban_position
  const byState = filtered.reduce<Record<string, Project[]>>((acc, p) => {
    const key = p.state_id ?? '_none'
    acc[key] = acc[key] ?? []
    acc[key].push(p)
    return acc
  }, {})
  for (const key of Object.keys(byState)) {
    byState[key].sort((a, b) => (a.kanban_position ?? 0) - (b.kanban_position ?? 0))
  }

  async function handleAddInState(stateId: string) {
    const defaultBucket = buckets[0]
    if (!defaultBucket) return
    const stateProjects = byState[stateId] ?? []
    const maxPos = stateProjects.length > 0 ? Math.max(...stateProjects.map(p => p.kanban_position ?? 0)) + 1 : 0
    const p = await api.projects.create({ name: 'New project', bucket_id: defaultBucket.id, state_id: stateId })
    await api.projects.update(p.id, { kanban_position: maxPos })
    qc.invalidateQueries({ queryKey: ['projects'] })
    openDrawer(p.id, 'overview')
  }

  async function handleDrop(projectId: string, newStateId: string, targetIndex: number) {
    const project = projects.find(p => p.id === projectId)
    if (!project) return

    const stateChanged = project.state_id !== newStateId
    const targetProjects = [...(byState[newStateId] ?? [])].filter(p => p.id !== projectId)

    // Insert at target index
    const idx = Math.min(targetIndex, targetProjects.length)
    targetProjects.splice(idx, 0, project)

    // Batch update positions
    const updates: Promise<any>[] = []
    if (stateChanged) {
      updates.push(api.projects.update(projectId, { state_id: newStateId, kanban_position: idx }))
    }
    targetProjects.forEach((p, i) => {
      if (p.id === projectId) {
        if (!stateChanged) updates.push(api.projects.update(p.id, { kanban_position: i }))
      } else if ((p.kanban_position ?? 0) !== i) {
        updates.push(api.projects.update(p.id, { kanban_position: i }))
      }
    })

    await Promise.all(updates)
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 54px)' }}>
      {/* Controls row */}
      <div style={{
        display: 'flex', gap: 8, padding: '16px 24px 0', flexWrap: 'wrap', alignItems: 'center',
        flexShrink: 0,
      }}>
        <input
          className="field-input"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search projects..."
          style={{ maxWidth: 200, fontSize: 12, padding: '5px 10px' }}
        />
        <select className="field-select" value={filterBucket} onChange={e => setFilterBucket(e.target.value)}
          style={{ maxWidth: 130, fontSize: 11, padding: '5px 8px' }}>
          <option value="">All Categories</option>
          {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="field-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          style={{ maxWidth: 110, fontSize: 11, padding: '5px 8px' }}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearchText(''); setFilterBucket(''); setFilterPriority('') }}>
            Clear
          </button>
        )}
        {hasFilters && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {filtered.length}/{projects.length} projects
          </span>
        )}
      </div>

      {/* Columns */}
      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto', overflowY: 'hidden',
        padding: '16px 24px 24px',
        flex: 1,
        alignItems: 'flex-start',
      }}>
      {states.map(state => (
        <KanbanColumn
          key={state.id}
          state={state}
          projects={byState[state.id] ?? []}
          buckets={buckets}
          onCardClick={id => openDrawer(id)}
          onAdd={() => handleAddInState(state.id)}
          onDrop={(projectId, targetIndex) => handleDrop(projectId, state.id, targetIndex)}
        />
      ))}
      </div>
    </div>
  )
}

function KanbanColumn({ state, projects, buckets, onCardClick, onAdd, onDrop }: {
  state: State
  projects: Project[]
  buckets: Bucket[]
  onCardClick: (id: string) => void
  onAdd: () => void
  onDrop: (projectId: string, targetIndex: number) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const bucketMap = Object.fromEntries(buckets.map(b => [b.id, b]))

  // Flat list for drop index calculation (across all swimlanes)
  const flatProjects = projects

  // Group projects by bucket within this state column
  const byBucket = projects.reduce<Record<string, Project[]>>((acc, p) => {
    acc[p.bucket_id] = acc[p.bucket_id] ?? []
    acc[p.bucket_id].push(p)
    return acc
  }, {})

  const activeBuckets = buckets.filter(b => byBucket[b.id]?.length)

  function toggleBucket(bucketId: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(bucketId)) next.delete(bucketId)
      else next.add(bucketId)
      return next
    })
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
      setDropIndex(null)
    }
  }

  function handleDropEvent(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const idx = dropIndex ?? flatProjects.length
    setDropIndex(null)
    const projectId = e.dataTransfer.getData('text/plain')
    if (projectId) onDrop(projectId, idx)
  }

  // Calculate drop index from card hover events
  function handleCardDragOver(index: number, position: 'above' | 'below') {
    setDropIndex(position === 'above' ? index : index + 1)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
      style={{
        flexShrink: 0, width: 272,
        background: dragOver ? 'var(--surface2)' : 'var(--surface)',
        border: dragOver ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 120px)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: state.color, flexShrink: 0 }} />
        <div style={{ fontSize: 12, fontWeight: 700, flex: 1, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          {state.name}
        </div>
        <span className="badge">{projects.length}</span>
      </div>

      {/* Cards */}
      <div style={{
        padding: 8, overflowY: 'auto', flex: 1,
        display: 'flex', flexDirection: 'column', gap: 4,
        minHeight: 40,
      }}>
        {activeBuckets.length === 0 && projects.length === 0 && (
          <div style={{
            fontSize: 11, color: dragOver ? 'var(--accent)' : 'var(--muted)',
            padding: '12px 4px', textAlign: 'center',
          }}>
            {dragOver ? 'Drop here' : 'No projects'}
          </div>
        )}
        {activeBuckets.map(bucket => {
          const bucketProjects = byBucket[bucket.id] ?? []
          const isCollapsed = collapsed.has(bucket.id)
          return (
            <div key={bucket.id}>
              <button
                onClick={() => toggleBucket(bucket.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '6px 6px', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--muted)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                }}
              >
                <span style={{ fontSize: 8 }}>{isCollapsed ? '▸' : '▾'}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: bucket.color, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{bucket.name}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{bucketProjects.length}</span>
              </button>
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 8px' }}>
                  {bucketProjects.map(p => {
                    const flatIdx = flatProjects.indexOf(p)
                    return (
                      <KanbanCard
                        key={p.id}
                        project={p}
                        bucket={bucket}
                        onClick={() => onCardClick(p.id)}
                        showDropAbove={dropIndex === flatIdx}
                        showDropBelow={dropIndex === flatIdx + 1 && flatIdx === flatProjects.length - 1}
                        onDragOverCard={(pos) => handleCardDragOver(flatIdx, pos)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add button */}
      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: 8, margin: '0 8px 8px',
          border: '1px dashed var(--border2)', borderRadius: 7,
          background: 'transparent', color: 'var(--muted)',
          cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12,
          transition: 'all 0.12s', flexShrink: 0,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
          ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'solid'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'
          ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'dashed'
        }}
      >
        + Add
      </button>
    </div>
  )
}

function KanbanCard({ project, bucket, onClick, showDropAbove, showDropBelow, onDragOverCard }: {
  project: Project
  bucket: Bucket
  onClick: () => void
  showDropAbove?: boolean
  showDropBelow?: boolean
  onDragOverCard?: (position: 'above' | 'below') => void
}) {
  const [dragging, setDragging] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const pendingStep = project.next_steps.find(s => !s.done)
  const goalsDone = project.sub_goals.filter(g => g.done).length
  const goalsTotal = project.sub_goals.length

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', project.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }

  function handleDragEnd() {
    setDragging(false)
  }

  function handleCardDragOver(e: React.DragEvent) {
    if (!cardRef.current || !onDragOverCard) return
    const rect = cardRef.current.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    onDragOverCard(e.clientY < midY ? 'above' : 'below')
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Drop indicator line — above */}
      {showDropAbove && (
        <div style={{ height: 2, background: 'var(--accent)', borderRadius: 1, marginBottom: 2 }} />
      )}
      <div
        ref={cardRef}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleCardDragOver}
        onClick={e => { if (!dragging) onClick() }}
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', cursor: 'grab',
          transition: 'border-color 0.12s, opacity 0.15s, transform 0.1s',
          overflow: 'hidden',
          opacity: dragging ? 0.4 : 1,
          transform: dragging ? 'scale(0.95)' : 'none',
          marginBottom: 5,
        }}
        onMouseEnter={e => { if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)' }}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{project.name}</div>

        <div style={{
          fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', minHeight: 32,
        }}>
          {project.description}
        </div>

        {project.completion_pct > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${project.completion_pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{project.completion_pct}%</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {fmtRelative(project.updated_at)}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {goalsTotal > 0 && (
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{goalsDone}/{goalsTotal}</span>
            )}
            {project.insights.length > 0 && (
              <span style={{ fontSize: 9, color: '#60a5fa', fontFamily: 'var(--mono)' }}>✦{project.insights.length}</span>
            )}
            {project.git_uncommitted && (
              <span style={{ fontSize: 9, color: '#fb923c' }} title="Uncommitted changes">!</span>
            )}
          </div>
        </div>

        {pendingStep && (
          <div style={{
            fontSize: 10, color: 'var(--muted)', marginTop: 6, paddingTop: 6,
            borderTop: '1px solid var(--border)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <span style={{ color: 'var(--accent)' }}>{'→ '}</span>{pendingStep.text}
          </div>
        )}
      </div>
      {/* Drop indicator line — below (only for last card) */}
      {showDropBelow && (
        <div style={{ height: 2, background: 'var(--accent)', borderRadius: 1, marginTop: 2 }} />
      )}
    </div>
  )
}
