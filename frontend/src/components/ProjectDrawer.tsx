import React, { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { useBuckets, useStates, fmtFull, showToast } from '../hooks/useProjects'
import { api } from '../api/client'
import { CodeAnalysis } from './CodeAnalysis'
import { ProjectAnalyticsTab } from './ProjectAnalyticsTab'
import type { Project, DrawerTab, GoalCategory } from '../types'

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  Users:       { bg: 'rgba(14,165,233,0.15)',  text: '#38bdf8' },
  Marketing:   { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24' },
  Revenue:     { bg: 'rgba(16,185,129,0.15)',  text: '#34d399' },
  Dev:         { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa' },
  Experiments: { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
  Other:       { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
}

interface Props {
  project: Project
}

export function ProjectDrawer({ project }: Props) {
  const { drawerTab, setDrawerTab, closeDrawer, openAIPanel } = useAppStore()
  const { data: buckets = [] } = useBuckets()
  const { data: states = [] } = useStates()
  const qc = useQueryClient()

  // Local editable fields
  const [name, setName] = useState(project.name)
  const [desc, setDesc] = useState(project.description)
  const [notes, setNotes] = useState(project.notes)
  const [bucketId, setBucketId] = useState(project.bucket_id)
  const [stateId, setStateId] = useState(project.state_id ?? '')
  const [completionPct, setCompletionPct] = useState(project.completion_pct)
  const [targetDate, setTargetDate] = useState(project.target_date ?? '')
  const [priority, setPriority] = useState(project.priority ?? 'medium')
  const dirty = useRef(false)

  useEffect(() => {
    setName(project.name)
    setDesc(project.description)
    setNotes(project.notes)
    setBucketId(project.bucket_id)
    setStateId(project.state_id ?? '')
    setCompletionPct(project.completion_pct)
    setTargetDate(project.target_date ?? '')
    setPriority(project.priority ?? 'medium')
    dirty.current = false
  }, [project.id])

  const saveProject = useMutation({
    mutationFn: () => api.projects.update(project.id, {
      name, description: desc, notes, bucket_id: bucketId, state_id: stateId || null,
      completion_pct: completionPct, target_date: targetDate || null, priority,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      dirty.current = false
      showToast('Saved ✓')
    },
  })

  const deleteProject = useMutation({
    mutationFn: () => api.projects.delete(project.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      closeDrawer()
      showToast('Project deleted')
    },
  })

  // Clean up untouched "New project" on unmount (covers backdrop click, X button, etc.)
  const projectRef = useRef(project)
  projectRef.current = project
  const dirtyRef = dirty

  useEffect(() => {
    return () => {
      const p = projectRef.current
      if (p.name === 'New project' && !dirtyRef.current && !p.description) {
        api.projects.delete(p.id).then(() => {
          qc.invalidateQueries({ queryKey: ['projects'] })
        })
      }
    }
  }, [project.id])

  function handleClose() {
    if (dirty.current) saveProject.mutate()
    else closeDrawer()
  }

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes',    label: 'Notes' },
    { key: 'steps',    label: 'Next Steps' },
    { key: 'goals',    label: 'Sub-Goals' },
    { key: 'code',     label: 'Code' },
    { key: 'docs',      label: `Docs${project.docs?.length ? ` (${project.docs.length})` : ''}` },
    { key: 'analytics', label: 'Analytics' },
    { key: 'insights',  label: `Insights${project.insights.length ? ` (${project.insights.length})` : ''}` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          value={name}
          onChange={e => { setName(e.target.value); dirty.current = true }}
          style={{
            fontSize: 17, fontWeight: 700, background: 'transparent', border: 'none',
            borderBottom: '1px solid transparent', color: 'var(--text)',
            fontFamily: 'var(--font)', flex: 1, outline: 'none',
            transition: 'border-color 0.12s', padding: '2px 0',
          }}
          onFocus={e => (e.target.style.borderBottomColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderBottomColor = 'transparent')}
          placeholder="Project name..."
        />
        <button className="btn btn-ghost btn-sm" onClick={handleClose}>✕</button>
        <button className="btn btn-primary btn-sm" onClick={() => saveProject.mutate()} disabled={saveProject.isPending}>
          {saveProject.isPending ? '...' : 'Save'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setDrawerTab(t.key)}
            style={{
              padding: '9px 14px', background: 'transparent', border: 'none',
              borderBottom: drawerTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, color: drawerTab === t.key ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.12s',
              textTransform: 'uppercase', letterSpacing: '0.7px', whiteSpace: 'nowrap',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {drawerTab === 'overview' && (
          <OverviewTab
            project={project}
            desc={desc} setDesc={(d: string) => { setDesc(d); dirty.current = true }}
            bucketId={bucketId} setBucketId={(b: string) => { setBucketId(b); dirty.current = true }}
            stateId={stateId} setStateId={(s: string) => { setStateId(s); dirty.current = true }}
            completionPct={completionPct} setCompletionPct={(v: number) => { setCompletionPct(v); dirty.current = true }}
            targetDate={targetDate} setTargetDate={(v: string) => { setTargetDate(v); dirty.current = true }}
            priority={priority} setPriority={(v: string) => { setPriority(v as any); dirty.current = true }}
            buckets={buckets}
            states={states}
            onAskAI={() => openAIPanel(project.id)}
            onDelete={() => { if (confirm('Delete this project?')) deleteProject.mutate() }}
          />
        )}
        {drawerTab === 'notes' && (
          <NotesTab project={project} notes={notes} setNotes={n => { setNotes(n); dirty.current = true }} />
        )}
        {drawerTab === 'steps' && <StepsTab project={project} />}
        {drawerTab === 'goals' && <GoalsTab project={project} />}
        {drawerTab === 'code'      && <CodeAnalysis project={project} />}
        {drawerTab === 'docs'      && <DocsTab project={project} />}
        {drawerTab === 'analytics' && <ProjectAnalyticsTab project={project} />}
        {drawerTab === 'insights'  && <InsightsTab project={project} />}
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ project, desc, setDesc, bucketId, setBucketId, stateId, setStateId, completionPct, setCompletionPct, targetDate, setTargetDate, priority, setPriority, buckets, states, onAskAI, onDelete }: any) {
  const qc = useQueryClient()
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const addLink = useMutation({
    mutationFn: () => api.links.create(project.id, linkLabel || linkUrl, linkUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setLinkLabel(''); setLinkUrl('')
    },
  })
  const delLink = useMutation({
    mutationFn: (linkId: string) => api.links.delete(project.id, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label className="field-label">Description</label>
        <textarea className="field-textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this project about?" />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">State</label>
          <select className="field-select" value={stateId} onChange={e => setStateId(e.target.value)}>
            {states.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Category</label>
          <select className="field-select" value={bucketId} onChange={e => setBucketId(e.target.value)}>
            {buckets.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">Completion %</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={100} step={5} value={completionPct}
              onChange={e => setCompletionPct(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{completionPct}%</span>
          </div>
          {project.ai_completion_pct != null && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, padding: '4px 8px', background: 'var(--bg)', borderRadius: 4 }}>
              AI estimates: {project.ai_completion_pct}% — {project.ai_completion_reason || 'No details'}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Target Date</label>
          <input type="date" className="field-input" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
        </div>
        <div style={{ flex: 0.6 }}>
          <label className="field-label">Priority</label>
          <select className="field-select" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="field-label">Links</label>
        {project.links.map((l: any) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 60 }}>{l.label}</span>
            <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: '#38bdf8', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</a>
            <button className="item-del" onClick={() => delLink.mutate(l.id)}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          <input className="field-input" style={{ maxWidth: 130 }} value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" />
          <input className="field-input" style={{ flex: 1, minWidth: 120 }} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." onKeyDown={e => e.key === 'Enter' && linkUrl && addLink.mutate()} />
          <button className="btn btn-sm" disabled={!linkUrl} onClick={() => addLink.mutate()}>+ Add</button>
        </div>
      </div>

      <button onClick={onAskAI} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
        background: 'var(--accent-dim)', border: '1px solid rgba(37,99,235,0.3)',
        borderRadius: 8, cursor: 'pointer', color: '#93c5fd', fontSize: 12, fontWeight: 600,
        fontFamily: 'var(--font)', transition: 'all 0.12s',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: 'pulse 2s infinite' }} />
        Ask AI about this project
      </button>

      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete Project</button>
      </div>
    </div>
  )
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

const NOTE_CATEGORIES = [
  { value: 'general', label: 'General', color: 'var(--muted)' },
  { value: 'decision', label: 'Decision', color: '#2563eb' },
  { value: 'blocker', label: 'Blocker', color: '#ef4444' },
  { value: 'idea', label: 'Idea', color: '#8b5cf6' },
  { value: 'meeting', label: 'Meeting', color: '#f59e0b' },
]

function NotesTab({ project, notes, setNotes }: { project: Project; notes: string; setNotes: (n: string) => void }) {
  const qc = useQueryClient()
  const [newNote, setNewNote] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const addNote = useMutation({
    mutationFn: () => api.projectNotes.create(project.id, newNote, newCategory),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setNewNote(''); setNewCategory('general') },
  })

  const updateNote = useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: { text?: string; category?: string } }) =>
      api.projectNotes.update(project.id, noteId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setEditingId(null) },
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => api.projectNotes.delete(project.id, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const projectNotes = project.project_notes || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Scratchpad */}
      <div>
        <label className="field-label">Quick Scratchpad</label>
        <textarea
          className="field-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Quick scratch notes... (saved with project)"
          style={{ minHeight: 80 }}
        />
      </div>

      {/* Add note */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <label className="field-label">Add Note</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className="field-select" value={newCategory} onChange={e => setNewCategory(e.target.value)}
            style={{ maxWidth: 120, fontSize: 11, padding: '5px 8px' }}>
            {NOTE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <textarea
          className="field-textarea"
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Write a note — a decision, blocker, idea, or observation..."
          style={{ minHeight: 60, marginBottom: 8 }}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey && newNote.trim()) addNote.mutate() }}
        />
        <button className="btn btn-sm btn-primary" disabled={!newNote.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
          + Add Note
        </button>
      </div>

      {/* Note journal */}
      {projectNotes.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <label className="field-label">Note History ({projectNotes.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projectNotes.map(n => {
              const cat = NOTE_CATEGORIES.find(c => c.value === n.category) || NOTE_CATEGORIES[0]
              const isEditing = editingId === n.id
              return (
                <div key={n.id} style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${cat.color}`,
                  borderRadius: 7, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                      color: cat.color,
                    }}>{cat.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', flex: 1 }}>
                      {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isEditing && (
                      <button className="item-del" style={{ fontSize: 10 }} onClick={() => { setEditingId(n.id); setEditText(n.text) }}>edit</button>
                    )}
                    <button className="item-del" onClick={() => deleteNote.mutate(n.id)}>✕</button>
                  </div>
                  {isEditing ? (
                    <div>
                      <textarea
                        className="field-textarea"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        style={{ minHeight: 60, marginBottom: 6 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => updateNote.mutate({ noteId: n.id, data: { text: editText } })}>Save</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                      {n.text}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Steps tab ─────────────────────────────────────────────────────────────────

function StepsTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')

  const addStep = useMutation({
    mutationFn: () => api.steps.create(project.id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setInput('') },
  })
  const toggleStep = useMutation({
    mutationFn: ({ stepId, done }: { stepId: string; done: boolean }) => api.steps.update(project.id, stepId, { done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
  const delStep = useMutation({
    mutationFn: (stepId: string) => api.steps.delete(project.id, stepId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div>
      <label className="field-label">Next Steps</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {project.next_steps.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No next steps yet.</p>
        )}
        {project.next_steps.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7 }}>
            <input type="checkbox" checked={s.done} onChange={e => toggleStep.mutate({ stepId: s.id, done: e.target.checked })}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: s.done ? 'var(--muted)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.text}</span>
            <button className="item-del" onClick={() => delStep.mutate(s.id)}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <input className="field-input" value={input} onChange={e => setInput(e.target.value)}
          placeholder="Add a next step..." onKeyDown={e => e.key === 'Enter' && input && addStep.mutate()} />
        <button className="btn btn-sm" disabled={!input} onClick={() => addStep.mutate()}>+ Add</button>
      </div>
    </div>
  )
}

// ── Goals tab ─────────────────────────────────────────────────────────────────

function GoalsTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [cat, setCat] = useState<GoalCategory>('Users')

  const addGoal = useMutation({
    mutationFn: () => api.goals.create(project.id, input, cat),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setInput('') },
  })
  const toggleGoal = useMutation({
    mutationFn: ({ goalId, done }: { goalId: string; done: boolean }) => api.goals.update(project.id, goalId, { done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
  const delGoal = useMutation({
    mutationFn: (goalId: string) => api.goals.delete(project.id, goalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div>
      <label className="field-label">Sub-Goals</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {project.sub_goals.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No sub-goals yet. Track users, marketing, revenue here.</p>
        )}
        {project.sub_goals.map(g => {
          const cc = CAT_COLORS[g.category] ?? CAT_COLORS.Other
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7 }}>
              <input type="checkbox" checked={g.done} onChange={e => toggleGoal.mutate({ goalId: g.id, done: e.target.checked })}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: g.done ? 'var(--muted)' : 'var(--text)', textDecoration: g.done ? 'line-through' : 'none', lineHeight: 1.5 }}>{g.text}</div>
                <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3, background: cc.bg, color: cc.text }}>{g.category}</span>
              </div>
              <button className="item-del" onClick={() => delGoal.mutate(g.id)}>✕</button>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <input className="field-input" style={{ flex: 1, minWidth: 120 }} value={input} onChange={e => setInput(e.target.value)}
          placeholder="Goal description..." onKeyDown={e => e.key === 'Enter' && input && addGoal.mutate()} />
        <select className="field-select" style={{ maxWidth: 130 }} value={cat} onChange={e => setCat(e.target.value as GoalCategory)}>
          {Object.keys(CAT_COLORS).map(c => <option key={c}>{c}</option>)}
        </select>
        <button className="btn btn-sm" disabled={!input} onClick={() => addGoal.mutate()}>+ Add</button>
      </div>
    </div>
  )
}

// ── Docs tab ─────────────────────────────────────────────────────────────────

function DocsTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [docName, setDocName] = useState('')
  const [docSource, setDocSource] = useState<'pasted' | 'file'>('pasted')
  const [docContent, setDocContent] = useState('')
  const [docFilePath, setDocFilePath] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadedContent, setLoadedContent] = useState<Record<string, string>>({})

  const addDoc = useMutation({
    mutationFn: () => api.docs.create(project.id, {
      name: docName,
      source: docSource,
      content: docSource === 'pasted' ? docContent : undefined,
      file_path: docSource === 'file' ? docFilePath : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setDocName(''); setDocContent(''); setDocFilePath('')
      showToast('Doc added')
    },
  })

  const delDoc = useMutation({
    mutationFn: (docId: string) => api.docs.delete(project.id, docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  async function toggleExpand(docId: string) {
    if (expandedId === docId) {
      setExpandedId(null)
      return
    }
    setExpandedId(docId)
    if (!loadedContent[docId]) {
      const res = await api.docs.getContent(project.id, docId)
      setLoadedContent(prev => ({ ...prev, [docId]: res.content }))
    }
  }

  const docs = project.docs || []

  return (
    <div>
      <label className="field-label">Project Documents</label>

      {docs.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
          No documents yet. Add a PRD, development plan, or other docs to give the AI advisor more context.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {docs.map(d => (
          <div key={d.id} style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
              cursor: 'pointer',
            }} onClick={() => toggleExpand(d.id)}>
              <span style={{ fontSize: 10 }}>{expandedId === d.id ? '▾' : '▸'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{d.name}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                padding: '1px 6px', borderRadius: 3,
                background: d.doc_type === 'detected' ? 'rgba(14,165,233,0.15)' : 'rgba(139,92,246,0.15)',
                color: d.doc_type === 'detected' ? '#38bdf8' : '#a78bfa',
              }}>{d.doc_type}</span>
              {d.source === 'file' && (
                <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.file_path?.split('/').pop()}
                </span>
              )}
              <button className="item-del" onClick={e => { e.stopPropagation(); delDoc.mutate(d.id) }}>✕</button>
            </div>

            {expandedId === d.id && (
              <div style={{
                padding: '8px 12px', borderTop: '1px solid var(--border)',
                fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                fontFamily: 'var(--mono)', background: 'var(--surface)',
              }}>
                {loadedContent[d.id] ?? d.summary ?? 'Loading...'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add doc form */}
      <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <label className="field-label">Add Document</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="field-input" style={{ flex: 1 }} value={docName} onChange={e => setDocName(e.target.value)} placeholder="Document name (e.g. PRD, Architecture)" />
          <select className="field-select" style={{ maxWidth: 120 }} value={docSource} onChange={e => setDocSource(e.target.value as 'pasted' | 'file')}>
            <option value="pasted">Paste</option>
            <option value="file">File path</option>
          </select>
        </div>

        {docSource === 'pasted' ? (
          <textarea className="field-textarea" value={docContent} onChange={e => setDocContent(e.target.value)} placeholder="Paste document content..." style={{ minHeight: 100, marginBottom: 8 }} />
        ) : (
          <input className="field-input" value={docFilePath} onChange={e => setDocFilePath(e.target.value)} placeholder="/path/to/document.md" style={{ marginBottom: 8 }} />
        )}

        <button className="btn btn-sm" disabled={!docName || (!docContent && !docFilePath)} onClick={() => addDoc.mutate()}>
          + Add Doc
        </button>
      </div>
    </div>
  )
}


// ── Insights tab ──────────────────────────────────────────────────────────────

function InsightsTab({ project }: { project: Project }) {
  const qc = useQueryClient()

  const delInsight = useMutation({
    mutationFn: (insightId: string) => api.insights.delete(project.id, insightId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const { openAIPanel } = useAppStore()

  if (project.insights.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
        <p style={{ fontSize: 12, lineHeight: 1.8 }}>No insights saved yet.<br />Chat with the AI about this project and save the moments that matter.</p>
        <button
          onClick={() => openAIPanel(project.id)}
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(37,99,235,0.3)', background: 'var(--accent-dim)', color: '#93c5fd', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)' }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Ask AI
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...project.insights].reverse().map(ins => (
        <div key={ins.id} style={{
          background: 'var(--bg)', border: '1px solid rgba(37,99,235,0.2)',
          borderLeft: '3px solid rgba(37,99,235,0.5)',
          borderRadius: 8, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'var(--mono)', display: 'flex', gap: 8 }}>
              <span>✦ AI Insight</span>
              <span>{fmtFull(ins.saved_at)}</span>
            </div>
            <button className="item-del" onClick={() => delInsight.mutate(ins.id)}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{ins.text}</div>
          {ins.prompt && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
              Prompted by: "{ins.prompt}"
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
