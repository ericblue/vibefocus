import React, { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useBuckets, useStates, fmtRelative, hexToRgba } from '../hooks/useProjects'
import { useAppStore } from '../store/appStore'
import { api } from '../api/client'
import type { Project, Bucket, State } from '../types'

type SortField = 'name' | 'updated_at' | 'completion_pct' | 'priority' | 'state' | 'category'
type SortDir = 'asc' | 'desc'
type ViewStyle = 'cards' | 'table'

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function Dashboard() {
  const { data: projects = [] } = useProjects()
  const { data: buckets = [] } = useBuckets()
  const { data: states = [] } = useStates()
  const { openDrawer } = useAppStore()

  const [viewStyle, setViewStyle] = useState<ViewStyle>(() => (localStorage.getItem('vf-dash-view') as ViewStyle) || 'cards')
  const [sortField, setSortField] = useState<SortField>(() => (localStorage.getItem('vf-dash-sort') as SortField) || 'updated_at')
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem('vf-dash-dir') as SortDir) || 'desc')
  const [filterState, setFilterState] = useState<string>(() => localStorage.getItem('vf-dash-fstate') || '')
  const [filterBucket, setFilterBucket] = useState<string>(() => localStorage.getItem('vf-dash-fbucket') || '')
  const [filterPriority, setFilterPriority] = useState<string>(() => localStorage.getItem('vf-dash-fpriority') || '')
  const [searchText, setSearchText] = useState('')

  const stateMap = Object.fromEntries(states.map(s => [s.id, s]))
  const bucketMap = Object.fromEntries(buckets.map(b => [b.id, b]))

  // Count projects per state for stat cards
  const byState = projects.reduce<Record<string, number>>((acc, p) => {
    const key = p.state_id ?? '_none'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...projects]

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      )
    }
    if (filterState) result = result.filter(p => p.state_id === filterState)
    if (filterBucket) result = result.filter(p => p.bucket_id === filterBucket)
    if (filterPriority) result = result.filter(p => p.priority === filterPriority)

    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'updated_at': cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(); break
        case 'completion_pct': cmp = a.completion_pct - b.completion_pct; break
        case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1); break
        case 'state': cmp = (stateMap[a.state_id ?? '']?.name ?? '').localeCompare(stateMap[b.state_id ?? '']?.name ?? ''); break
        case 'category': cmp = (bucketMap[a.bucket_id]?.name ?? '').localeCompare(bucketMap[b.bucket_id]?.name ?? ''); break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [projects, searchText, filterState, filterBucket, filterPriority, sortField, sortDir, stateMap, bucketMap])

  // Persist helpers
  function persistViewStyle(v: ViewStyle) { setViewStyle(v); localStorage.setItem('vf-dash-view', v) }
  function persistSort(f: SortField, d: SortDir) { setSortField(f); setSortDir(d); localStorage.setItem('vf-dash-sort', f); localStorage.setItem('vf-dash-dir', d) }
  function persistFilterState(v: string) { setFilterState(v); localStorage.setItem('vf-dash-fstate', v) }
  function persistFilterBucket(v: string) { setFilterBucket(v); localStorage.setItem('vf-dash-fbucket', v) }
  function persistFilterPriority(v: string) { setFilterPriority(v); localStorage.setItem('vf-dash-fpriority', v) }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      const d = sortDir === 'asc' ? 'desc' : 'asc'
      persistSort(field, d)
    } else {
      persistSort(field, field === 'name' ? 'asc' : 'desc')
    }
  }

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const hasFilters = !!(filterState || filterBucket || filterPriority || searchText)

  // Show onboarding when no projects exist
  if (projects.length === 0) {
    return <Onboarding buckets={buckets} states={states} />
  }

  return (
    <div style={{ padding: 24, paddingBottom: 100 }}>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Total" value={projects.length} sub="projects" />
        {states
          .filter(s => (byState[s.id] ?? 0) > 0)
          .map(s => (
            <StatCard key={s.id} label={s.name} value={byState[s.id] ?? 0} sub="projects" accent={s.color} />
          ))}
      </div>

      {/* Controls row */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Search */}
        <input
          className="field-input"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search projects..."
          style={{ maxWidth: 200, fontSize: 12, padding: '5px 10px' }}
        />

        {/* Filters */}
        <select className="field-select" value={filterState} onChange={e => persistFilterState(e.target.value)}
          style={{ maxWidth: 120, fontSize: 11, padding: '5px 8px' }}>
          <option value="">All States</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select className="field-select" value={filterBucket} onChange={e => persistFilterBucket(e.target.value)}
          style={{ maxWidth: 130, fontSize: 11, padding: '5px 8px' }}>
          <option value="">All Categories</option>
          {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select className="field-select" value={filterPriority} onChange={e => persistFilterPriority(e.target.value)}
          style={{ maxWidth: 110, fontSize: 11, padding: '5px 8px' }}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { persistFilterState(''); persistFilterBucket(''); persistFilterPriority(''); setSearchText('') }}>
            Clear
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Sort (for cards view) */}
        {viewStyle === 'cards' && (
          <select className="field-select" value={`${sortField}:${sortDir}`}
            onChange={e => { const [f, d] = e.target.value.split(':'); persistSort(f as SortField, d as SortDir) }}
            style={{ maxWidth: 150, fontSize: 11, padding: '5px 8px' }}>
            <option value="updated_at:desc">Last Updated</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
            <option value="completion_pct:desc">Completion % High</option>
            <option value="completion_pct:asc">Completion % Low</option>
            <option value="priority:asc">Priority High First</option>
            <option value="priority:desc">Priority Low First</option>
          </select>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
          {(['cards', 'table'] as const).map(v => (
            <button key={v} onClick={() => persistViewStyle(v)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 500, border: 'none',
              background: viewStyle === v ? 'var(--surface2)' : 'transparent',
              color: viewStyle === v ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'var(--font)', textTransform: 'capitalize',
            }}>{v === 'cards' ? '▦ Cards' : '☰ Table'}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {viewStyle === 'cards' ? (
        <CardsView projects={filtered} bucketMap={bucketMap} stateMap={stateMap} openDrawer={openDrawer} />
      ) : (
        <TableView
          projects={filtered} bucketMap={bucketMap} stateMap={stateMap}
          openDrawer={openDrawer} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} sortIndicator={sortIndicator}
        />
      )}

    </div>
  )
}


// ── Cards View ──────────────────────────────────────────────────────────────

function CardsView({ projects, bucketMap, stateMap, openDrawer }: {
  projects: Project[]
  bucketMap: Record<string, Bucket>
  stateMap: Record<string, State>
  openDrawer: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
      {projects.map(p => (
        <ProjectCard
          key={p.id}
          project={p}
          bucket={bucketMap[p.bucket_id]}
          state={stateMap[p.state_id ?? ''] ?? null}
          onClick={() => openDrawer(p.id)}
        />
      ))}
    </div>
  )
}


// ── Table View ──────────────────────────────────────────────────────────────

function TableView({ projects, bucketMap, stateMap, openDrawer, sortField, sortDir, toggleSort, sortIndicator }: {
  projects: Project[]
  bucketMap: Record<string, Bucket>
  stateMap: Record<string, State>
  openDrawer: (id: string) => void
  sortField: SortField
  sortDir: SortDir
  toggleSort: (field: SortField) => void
  sortIndicator: (field: SortField) => string
}) {
  const headerStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.7px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...headerStyle, padding: '10px 14px', textAlign: 'left' }} onClick={() => toggleSort('name')}>
              Name{sortIndicator('name')}
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'left' }} onClick={() => toggleSort('state')}>
              State{sortIndicator('state')}
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'left' }} onClick={() => toggleSort('category')}>
              Category{sortIndicator('category')}
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'left' }} onClick={() => toggleSort('priority')}>
              Priority{sortIndicator('priority')}
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'left', minWidth: 100 }} onClick={() => toggleSort('completion_pct')}>
              Completion{sortIndicator('completion_pct')}
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'left' }}>
              Target
            </th>
            <th style={{ ...headerStyle, padding: '10px 8px', textAlign: 'right' }} onClick={() => toggleSort('updated_at')}>
              Updated{sortIndicator('updated_at')}
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => {
            const state = stateMap[p.state_id ?? '']
            const bucket = bucketMap[p.bucket_id]
            const isOverdue = p.target_date && new Date(p.target_date) < new Date()
            return (
              <tr
                key={p.id}
                onClick={() => openDrawer(p.id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{p.name}</td>
                <td style={{ padding: '10px 8px' }}>
                  {state && (
                    <span style={{
                      padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                      textTransform: 'uppercase', background: hexToRgba(state.color, 0.15), color: state.color,
                    }}>{state.name}</span>
                  )}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {bucket && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: bucket.color, flexShrink: 0 }} />
                      {bucket.name}
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    color: p.priority === 'high' ? '#ef4444' : p.priority === 'low' ? 'var(--muted)' : 'var(--text)',
                  }}>{p.priority}</span>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', maxWidth: 60 }}>
                      <div style={{ width: `${p.completion_pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', minWidth: 26 }}>{p.completion_pct}%</span>
                  </div>
                </td>
                <td style={{ padding: '10px 8px', fontSize: 11, fontFamily: 'var(--mono)', color: isOverdue ? '#ef4444' : 'var(--muted)' }}>
                  {p.target_date ? new Date(p.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  {fmtRelative(p.updated_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


// ── Onboarding ──────────────────────────────────────────────────────────────

function Onboarding({ buckets, states }: { buckets: Bucket[]; states: State[] }) {
  const { openDrawer } = useAppStore()
  const qc = useQueryClient()
  const [step, setStep] = useState<'welcome' | 'create'>('welcome')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? '')
  const [stateId, setStateId] = useState(states[0]?.id ?? '')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!name.trim() || !bucketId) return
    setCreating(true)
    const p = await api.projects.create({
      name: name.trim(),
      description: desc,
      bucket_id: bucketId,
      state_id: stateId || null,
      local_path: localPath || null,
    })
    qc.invalidateQueries({ queryKey: ['projects'] })
    openDrawer(p.id, 'overview')
    setCreating(false)
  }

  const features = [
    { title: 'Portfolio Dashboard', desc: 'See all your projects at a glance with cards or table view, filters, and sort.', icon: '1' },
    { title: 'Kanban Board', desc: 'Drag-and-drop projects across lifecycle states: Idea, Building, MVP, Launched.', icon: '2' },
    { title: 'Weekly Focus', desc: 'Pick projects to commit to this week. Set goals, track progress, stay focused.', icon: '3' },
    { title: 'AI Advisor', desc: 'Chat with an AI that knows your code, git history, and project docs.', icon: '4' },
    { title: 'Code Analysis', desc: 'Auto-detect tech stack, TODOs, completion %, and health signals from your repos.', icon: '5' },
    { title: 'Analytics', desc: 'Commit heatmaps, velocity charts, stall alerts, and contribution patterns.', icon: '6' },
  ]

  if (step === 'welcome') {
    return (
      <div style={{ padding: '40px 24px 100px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            Welcome to VibeFocus
          </h1>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Portfolio intelligence for multi-project builders.
          </p>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto', marginBottom: 8 }}>
            Stop juggling projects. Start shipping what matters.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
            AI tools let you ship faster — but more projects mean more to track.
            VibeFocus gives you one unified view across everything you're building:
            completion tracking, health signals, code-aware insights, and clear answers
            to <em>"what needs my attention right now?"</em>
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12, marginBottom: 32,
        }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '16px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
              }}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => setStep('create')}
            style={{ padding: '10px 28px', fontSize: 14 }}
          >
            Create Your First Project
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 24px 100px', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Create Your First Project</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Add a project you're working on. You can always add more later.
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <label className="field-label">Project Name *</label>
          <input
            className="field-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My Awesome App"
            autoFocus
          />
        </div>

        <div>
          <label className="field-label">Description</label>
          <textarea
            className="field-textarea"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="What is this project about?"
            style={{ minHeight: 60 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">State</label>
            <select className="field-select" value={stateId} onChange={e => setStateId(e.target.value)}>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Category</label>
            <select className="field-select" value={bucketId} onChange={e => setBucketId(e.target.value)}>
              {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label">Local Path <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — enables code analysis)</span></label>
          <input
            className="field-input"
            value={localPath}
            onChange={e => setLocalPath(e.target.value)}
            placeholder="/Users/you/code/my-project"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={() => setStep('welcome')}>Back</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            style={{ flex: 1 }}
          >
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
        You can also create projects from the "+ New" button in the header anytime.
      </p>
    </div>
  )
}


// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.9px', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>
    </div>
  )
}


// ── Project Card ────────────────────────────────────────────────────────────

export function ProjectCard({ project, bucket, state, onClick }: { project: Project; bucket: Bucket; state: State | null; onClick: () => void }) {
  const pendingStep = project.next_steps.find(s => !s.done)
  const goalsDone = project.sub_goals.filter(g => g.done).length
  const goalsTotal = project.sub_goals.length
  const hasInsights = project.insights.length > 0
  const hasCode = !!(project.local_path || project.github_url)

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.1s',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
      }}
    >
      {/* Accent bar */}
      {bucket && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: bucket.color }} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{project.name}</div>
        {state && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: hexToRgba(state.color, 0.15), color: state.color,
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            flexShrink: 0,
          }}>{state.name}</span>
        )}
        {project.priority === 'high' && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>HIGH</span>
        )}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        minHeight: 36,
      }}>
        {project.description || 'No description yet.'}
      </div>

      {/* Completion bar */}
      {project.completion_pct > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${project.completion_pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{project.completion_pct}%</span>
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {goalsTotal > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {goalsDone}/{goalsTotal}
          </span>
        )}

        {hasInsights && (
          <span style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'var(--mono)' }}>
            ✦ {project.insights.length}
          </span>
        )}

        {hasCode && (
          <span style={{ fontSize: 10, color: 'var(--muted)' }} title="Has code links">code</span>
        )}

        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
          {fmtRelative(project.updated_at)}
        </span>
      </div>

      {/* Next step preview */}
      {pendingStep && (
        <div style={{
          fontSize: 11, color: 'var(--muted)', marginTop: 8, paddingTop: 8,
          borderTop: '1px solid var(--border)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <span style={{ color: 'var(--accent)' }}>{'→ '}</span>{pendingStep.text}
        </div>
      )}
    </div>
  )
}
