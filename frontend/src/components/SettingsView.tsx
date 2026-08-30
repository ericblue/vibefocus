import React, { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, showToast } from '../hooks/useProjects'
import { api } from '../api/client'
import type { ScanConfig, ScanResult } from '../types'

const BASE = '/api'

export function SettingsView() {
  return (
    <div style={{ padding: 24, paddingBottom: 100, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      <ScanSection />
      <ExportSection />
      <ImportSection />
    </div>
  )
}


// ── Scan Local Repos ─────────────────────────────────────────────────────────

function ScanSection() {
  const qc = useQueryClient()
  const [config, setConfig] = useState<ScanConfig | null>(null)
  const [customRoot, setCustomRoot] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [configError, setConfigError] = useState(false)

  useEffect(() => {
    api.data.scanConfig()
      .then(d => {
        setConfig(d)
        if (d.projects_dir_raw || d.projects_dir) {
          setCustomRoot(d.projects_dir_raw ?? d.projects_dir ?? '')
        }
      })
      .catch(() => setConfigError(true))
  }, [])

  const trimmedRoot = customRoot.trim()
  const canScan = !!trimmedRoot && !scanning
  const configuredPathMissing = !!config?.configured && !config.exists && customRoot === (config.projects_dir_raw ?? config.projects_dir ?? '')

  async function handleScan() {
    setScanning(true)
    setResult(null)
    try {
      const data = await api.data.scan({ root: trimmedRoot, recursive })
      setResult(data)
      qc.invalidateQueries({ queryKey: ['projects'] })
      showToast(`Scan complete: ${data.created} new, ${data.updated} updated`)
    } catch (e: any) {
      showToast(`Scan failed: ${e.message}`)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 24, marginBottom: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Import Local Git Repositories</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Point VibeFocus at the parent folder where your git repositories live. The backend scans that folder,
        creates missing projects, updates matching projects, and refreshes lightweight git stats. Commit history stays out of the import and can be synced later from Analytics.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="field-label">Directory visible to the backend</label>
          <input
            type="text"
            value={customRoot}
            onChange={e => setCustomRoot(e.target.value)}
            placeholder="e.g. ~/code or /Users/you/Development"
            className="field-input"
          />
          <div style={{ fontSize: 11, color: configuredPathMissing ? '#f59e0b' : 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
            {configError && 'Could not read scan configuration. You can still enter a directory manually.'}
            {!configError && !config?.configured && (
              <>No default is configured. Enter a path here or set <InlineCode>PROJECTS_DIR</InlineCode> in <InlineCode>backend/.env</InlineCode>.</>
            )}
            {!configError && config?.configured && config.exists && (
              <>Configured default: <InlineCode>{config.projects_dir ?? config.projects_dir_raw}</InlineCode></>
            )}
            {configuredPathMissing && (
              <>Configured path is not reachable from the backend: <InlineCode>{config?.projects_dir ?? config?.projects_dir_raw}</InlineCode>. If you run Docker, mount that folder with <InlineCode>PROJECTS_DIR=/path/to/repos make docker-run</InlineCode>.</>
            )}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={recursive}
            onChange={e => setRecursive(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            Search subdirectories
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
              Use this when your repos are nested under team, client, or workspace folders.
            </span>
          </span>
        </label>

        {scanning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
            color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <span className="spinner" />
            <span>
              Scanning repositories and refreshing project metadata. Commit history will not be imported.
            </span>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={!canScan}
          style={{ alignSelf: 'flex-start' }}
        >
          {scanning ? 'Scanning...' : 'Scan Repositories'}
        </button>

        {result && (
          <div style={{
            padding: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 8, fontSize: 12,
          }}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 6 }}>
              Scan complete - {result.total} repos found in {result.root}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>{result.created}</strong> new &nbsp;·&nbsp;
              <strong>{result.updated}</strong> updated &nbsp;·&nbsp;
              <strong>{result.skipped}</strong> skipped
            </div>
            <div style={{ marginBottom: 8, color: 'var(--muted)' }}>
              Commit history was not imported. Use Analytics sync when you want heatmaps, velocity, and health history.
            </div>
            {result.projects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {result.projects.map((p, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{
                      display: 'inline-block', width: 58,
                      color: p.action === 'created' ? '#10b981' : p.action === 'skipped' ? '#f59e0b' : 'var(--muted)',
                      fontWeight: p.action === 'created' || p.action === 'skipped' ? 600 : 400,
                    }}>{p.action}</span>
                    {p.name}
                    {p.error && <span style={{ color: '#f59e0b' }}> - {p.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>
}


// ── Export ───────────────────────────────────────────────────────────────────

function ExportSection() {
  const { data: projects = [] } = useProjects()
  const [exporting, setExporting] = useState<string | null>(null)

  async function download(url: string, label: string) {
    setExporting(label)
    try {
      const res = await fetch(`${BASE}${url}`)
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const filename = res.headers.get('content-disposition')?.match(/filename=(.+)/)?.[1] || `vibefocus-export.${label}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(`${label} exported`)
    } catch (e: any) {
      showToast(`Export failed: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 24, marginBottom: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Export Data</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Download your portfolio data in various formats.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Full JSON export */}
        <ExportRow
          title="Full Portfolio (JSON)"
          desc="All projects, steps, goals, docs, insights, focuses, and chat sessions."
          onClick={() => download('/data/export', 'json')}
          loading={exporting === 'json'}
        />

        {/* CSV export */}
        <ExportRow
          title="Portfolio Summary (CSV)"
          desc="Flat spreadsheet with one row per project — name, state, completion, priority, dates."
          onClick={() => download('/data/export-csv', 'csv')}
          loading={exporting === 'csv'}
        />

        {/* Database backup */}
        <ExportRow
          title="Database Backup (SQLite)"
          desc="Download the raw SQLite database file. Full backup of everything."
          onClick={() => download('/data/export-db', 'db')}
          loading={exporting === 'db'}
        />

        {/* Per-project exports */}
        {projects.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Per-Project Export
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => download(`/data/export/${p.id}`, `json-${p.id}`)}
                    disabled={!!exporting}
                    title="Export as JSON"
                  >{p.name} (JSON)</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => download(`/data/export-markdown/${p.id}`, `md-${p.id}`)}
                    disabled={!!exporting}
                    title="Export as Markdown report"
                  >MD</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExportRow({ title, desc, onClick, loading }: {
  title: string; desc: string; onClick: () => void; loading: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <button className="btn btn-sm btn-primary" onClick={onClick} disabled={loading}>
        {loading ? 'Exporting...' : 'Download'}
      </button>
    </div>
  )
}


// ── Import ───────────────────────────────────────────────────────────────────

function ImportSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'merge' | 'overwrite'>('merge')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function handleFileSelect(file: File) {
    setSelectedFile(file)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${BASE}/data/import/preview`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.detail || 'Preview failed')
        setPreview(null)
        return
      }
      setPreview(await res.json())
    } catch {
      showToast('Failed to read file')
    }
  }

  async function handleImport() {
    if (!selectedFile) return
    setImporting(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await fetch(`${BASE}/data/import?mode=${mode}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.detail || 'Import failed')
      } else {
        setResult(data)
        showToast('Import complete')
        setPreview(null)
        setSelectedFile(null)
        // Refresh all data
        window.location.reload()
      }
    } catch {
      showToast('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 24,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Import Data</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Restore from a VibeFocus JSON export file.
      </p>

      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFileSelect(file)
        }}
      />

      {!preview && !result && (
        <button
          className="btn"
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', padding: '24px 16px',
            border: '2px dashed var(--border2)', borderRadius: 8,
            background: 'var(--bg)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 20 }}>📂</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Choose a .json export file</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>or drag and drop</span>
        </button>
      )}

      {/* Preview */}
      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            padding: 14, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              File: {selectedFile?.name}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
              <span><strong>{preview.counts.projects}</strong> projects</span>
              <span><strong>{preview.counts.buckets}</strong> categories</span>
              <span><strong>{preview.counts.states}</strong> states</span>
              <span><strong>{preview.counts.weekly_focuses}</strong> focuses</span>
              <span><strong>{preview.counts.chat_sessions}</strong> chats</span>
            </div>
            {preview.projects.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                Projects: {preview.projects.map((p: any) => `${p.name} (${p.completion_pct}%)`).join(', ')}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              Exported: {preview.exported_at}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Import Mode
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['merge', 'overwrite'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: mode === m ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: mode === m ? 'var(--accent-dim)' : 'var(--bg)',
                    textAlign: 'left', fontFamily: 'var(--font)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                    {m === 'merge' ? 'Merge' : 'Overwrite'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {m === 'merge'
                      ? 'Add new projects, skip existing ones.'
                      : 'Replace all data with the import file.'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {mode === 'overwrite' && (
            <div style={{
              padding: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 6, fontSize: 11, color: '#ef4444',
            }}>
              Warning: Overwrite will delete all existing data before importing.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setPreview(null); setSelectedFile(null) }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing} style={{ flex: 1 }}>
              {importing ? 'Importing...' : `Import (${mode})`}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          padding: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: 8, fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 4 }}>Import complete</div>
          <div>
            {result.imported.projects} projects, {result.imported.buckets} categories, {result.imported.states} states imported.
            {result.imported.skipped > 0 && ` ${result.imported.skipped} skipped (already exist).`}
          </div>
        </div>
      )}
    </div>
  )
}
