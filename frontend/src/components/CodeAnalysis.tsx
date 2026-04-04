import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project } from '../types'
import { api } from '../api/client'

interface Props {
  project: Project
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export function CodeAnalysis({ project }: Props) {
  const qc = useQueryClient()
  const [localPath, setLocalPath] = useState(project.local_path ?? '')
  const [githubUrl, setGithubUrl] = useState(project.github_url ?? '')

  const saveMeta = useMutation({
    mutationFn: () => api.projects.update(project.id, {
      local_path: localPath || null,
      github_url: githubUrl || null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const analyze = useMutation({
    mutationFn: () => api.projects.analyze(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const refreshStats = useMutation({
    mutationFn: () => api.projects.refreshStats(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const hasCode = !!project.local_path
  const hasGitHub = !!project.github_url
  const hasAnalysis = !!project.code_summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Source links */}
      <div>
        <div className="field-label">Local path</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="field-input"
            value={localPath}
            onChange={e => setLocalPath(e.target.value)}
            placeholder="/Users/you/code/my-project"
            style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12 }}
          />
        </div>
      </div>

      <div>
        <div className="field-label">GitHub URL</div>
        <input
          className="field-input"
          value={githubUrl}
          onChange={e => setGithubUrl(e.target.value)}
          placeholder="https://github.com/you/my-project"
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => saveMeta.mutate()}
          disabled={saveMeta.isPending}
        >
          {saveMeta.isPending ? 'Saving...' : 'Save links'}
        </button>
        {(hasCode || hasGitHub) && (
          <button
            className="btn btn-sm"
            onClick={() => refreshStats.mutate()}
            disabled={refreshStats.isPending}
          >
            {refreshStats.isPending ? 'Refreshing...' : '↻ Refresh stats'}
          </button>
        )}
      </div>

      {/* Git stats */}
      {(project.git_last_commit || project.github_stars != null) && (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 14px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
        }}>
          {project.git_last_commit && (
            <StatRow label="Last commit" value={project.git_last_commit} mono />
          )}
          {project.git_branch && (
            <StatRow label="Branch" value={project.git_branch} mono />
          )}
          {project.git_uncommitted && (
            <StatRow label="Uncommitted" value="yes ⚠" />
          )}
          {project.github_stars != null && (
            <StatRow label="Stars" value={String(project.github_stars)} />
          )}
          {project.github_open_issues != null && (
            <StatRow label="Open issues" value={String(project.github_open_issues)} />
          )}
          {project.stats_updated_at && (
            <div style={{ gridColumn: '1/-1', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Stats refreshed {fmtDate(project.stats_updated_at)}
            </div>
          )}
        </div>
      )}

      {/* Code analysis */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="field-label" style={{ marginBottom: 0 }}>Code analysis</div>
          {hasCode && (
            <button
              className="btn btn-sm"
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
              style={{ fontSize: 11 }}
            >
              {analyze.isPending
                ? '⏳ Analyzing... (may take ~30s)'
                : hasAnalysis
                  ? '↻ Re-analyze'
                  : '⬡ Analyze codebase'}
            </button>
          )}
        </div>

        {!hasCode && (
          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '12px 0' }}>
            Set a local path above to enable Agent SDK code analysis.
          </div>
        )}

        {hasAnalysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {project.code_tech_stack && project.code_tech_stack.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 6 }}>Stack</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {project.code_tech_stack.map(t => (
                    <span key={t} style={{
                      background: 'rgba(37,99,235,0.15)', color: '#60a5fa',
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    }}>{t}</span>
                  ))}
                </div>
              </div>
            )}

            {project.code_summary && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 6 }}>Summary</div>
                <div style={{
                  fontSize: 12, color: 'var(--text)', lineHeight: 1.7,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '10px 12px', whiteSpace: 'pre-wrap',
                }}>
                  {project.code_summary}
                </div>
              </div>
            )}

            {project.code_todos && project.code_todos.length > 0 && (
              <TodosSection todos={project.code_todos} />
            )}

            {project.last_analyzed_at && (
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                Analyzed {fmtDate(project.last_analyzed_at)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TodosSection({ todos }: { todos: Array<{ file: string; line: number; text: string }> }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px',
          fontWeight: 700, marginBottom: expanded ? 6 : 0,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'var(--font)',
        }}
      >
        <span style={{ fontSize: 8 }}>{expanded ? '▾' : '▸'}</span>
        Open TODOs ({todos.length})
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {todos.map((t, i) => (
            <div key={i} style={{
              fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '7px 10px', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ color: '#fb923c', fontFamily: 'var(--mono)', flexShrink: 0 }}>TODO</span>
              <span style={{ color: 'var(--text)', flex: 1 }}>{t.text}</span>
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {t.file}{t.line ? `:${t.line}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: 12, color: 'var(--text)', marginTop: 2,
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  )
}
