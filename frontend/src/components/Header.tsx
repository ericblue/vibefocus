import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { useBuckets, useStates, useProjects, showToast } from '../hooks/useProjects'
import { api } from '../api/client'
import type { Bucket, State } from '../types'

export function Header() {
  const { view, setView, openDrawer, openAIPanel, theme, toggleTheme } = useAppStore()
  const { data: buckets = [] } = useBuckets()
  const { data: states = [] } = useStates()
  const { data: projects = [] } = useProjects()
  const [showBuckets, setShowBuckets] = useState(false)
  const [showStates, setShowStates] = useState(false)

  const qc = useQueryClient()

  function handleNewProject() {
    const defaultBucket = buckets[0]
    const defaultState = states[0]
    if (!defaultBucket) return
    api.projects.create({
      name: 'New project',
      bucket_id: defaultBucket.id,
      state_id: defaultState?.id ?? null,
    }).then(p => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      openDrawer(p.id, 'overview')
    })
  }

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 24px', height: 54,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 20,
        flexShrink: 0,
      }}>
        <div className="header-logo">
          <img src="/vibefocus-icon.svg" alt="VibeFocus" style={{ width: 60, height: 60, objectFit: 'contain' }} />
        </div>

        <nav style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {(['dashboard', 'kanban', 'focus', 'analytics'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 13px', borderRadius: 6, border: 'none',
              background: view === v ? 'var(--surface2)' : 'transparent',
              color: view === v ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13,
              fontWeight: 500, transition: 'all 0.12s', textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-icon" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="btn-icon" onClick={() => setView('settings')} title="Settings" style={{ fontSize: 15 }}>
            ⚙
          </button>
          <button className="btn" onClick={() => setShowStates(true)}>
            ⚙ States
          </button>
          <button className="btn" onClick={() => setShowBuckets(true)}>
            ⚙ Categories
          </button>
          <button className="btn" onClick={handleNewProject}>
            + New
          </button>
          <button onClick={() => openAIPanel()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '6px 14px', borderRadius: 7,
            border: '1px solid rgba(37,99,235,0.4)',
            background: 'var(--accent-dim)', color: '#93c5fd',
            cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Ask AI
          </button>
        </div>
      </header>

      {showBuckets && (
        <ItemManager
          title="Manage Categories"
          subtitle="Rename, recolor, or add project categories."
          items={buckets}
          queryKey="buckets"
          api={api.buckets}
          onClose={() => setShowBuckets(false)}
        />
      )}
      {showStates && (
        <ItemManager
          title="Manage States"
          subtitle="Rename, recolor, or add lifecycle states (kanban columns)."
          items={states}
          queryKey="states"
          api={api.states}
          onClose={() => setShowStates(false)}
        />
      )}
    </>
  )
}

// ── Generic Item Manager Modal (shared by Buckets & States) ───────────────────

function ItemManager({ title, subtitle, items, queryKey, api: itemApi, onClose }: {
  title: string
  subtitle: string
  items: (Bucket | State)[]
  queryKey: string
  api: { create: any; update: any; delete: any }
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2563eb')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const updateItem = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      itemApi.update(id, { name, color }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  })

  const deleteItem = useMutation({
    mutationFn: (id: string) => itemApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    onError: (err: Error) => showToast(err.message.includes('409') ? 'Cannot delete — projects still assigned' : 'Delete failed'),
  })

  const createItem = useMutation({
    mutationFn: () => itemApi.create({ name: newName, color: newColor, position: items.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setNewName('')
      showToast(`"${newName}" added`)
    },
  })

  async function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setOverIdx(null)
      return
    }
    // Reorder: build new position list and update all affected items
    const reordered = [...items]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // Update positions for all items that changed
    const updates = reordered
      .map((item, i) => ({ id: item.id, position: i }))
      .filter((u, i) => items[i]?.id !== u.id || items[i]?.position !== u.position)

    for (const u of updates) {
      await itemApi.update(u.id, { position: u.position })
    }
    qc.invalidateQueries({ queryKey: [queryKey] })
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 14, width: 'min(480px, 94vw)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{subtitle} Drag to reorder.</p>

          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              isDragOver={overIdx === idx && dragIdx !== idx}
              onUpdate={(name, color) => updateItem.mutate({ id: item.id, name, color })}
              onDelete={() => {
                if (!confirm(`Delete "${item.name}"?`)) return
                deleteItem.mutate(item.id)
              }}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={() => setOverIdx(idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            />
          ))}

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <label className="field-label">Add New</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="field-input"
                style={{ flex: 1 }}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name..."
                onKeyDown={e => e.key === 'Enter' && newName && createItem.mutate()}
              />
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--border2)', cursor: 'pointer', padding: 3, background: 'transparent' }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={!newName || createItem.isPending}
                onClick={() => createItem.mutate()}
              >Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item, isDragOver, onUpdate, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  item: Bucket | State
  isDragOver?: boolean
  onUpdate: (name: string, color: string) => void
  onDelete: () => void
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}) {
  const [name, setName] = useState(item.name)
  const [color, setColor] = useState(item.color)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver?.() }}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, marginBottom: 7,
        borderTopColor: isDragOver ? 'var(--accent)' : 'var(--border)',
        borderTopWidth: isDragOver ? 2 : 1,
        cursor: 'grab', transition: 'border-color 0.1s',
      }}
    >
      <span style={{ color: 'var(--muted)', fontSize: 11, cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>
      <input
        type="color" value={color}
        onChange={e => { setColor(e.target.value); onUpdate(name, e.target.value) }}
        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid var(--border2)', cursor: 'pointer', padding: 2, background: 'transparent' }}
      />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => onUpdate(name, color)}
        onKeyDown={e => e.key === 'Enter' && onUpdate(name, color)}
        style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500, outline: 'none' }}
      />
      <button className="item-del" onClick={onDelete}>✕</button>
    </div>
  )
}
