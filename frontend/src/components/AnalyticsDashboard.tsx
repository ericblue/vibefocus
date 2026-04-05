import React, { useState } from 'react'
import { useProjects } from '../hooks/useProjects'
import {
  useHeatmap, useVelocity, useFocus, useHealth,
  useTechStack, usePatterns, useStreaks, useLifecycle,
  useSyncGitLog,
} from '../hooks/useAnalytics'
import {
  CommitHeatmap, VelocityChart, FocusDistribution,
  StallAlerts, TechStackPortfolio, ContributionPatterns,
  ProjectLifecycle, StreakCounter,
} from './analytics'
import type { VelocityWeek } from '../types'

export function AnalyticsDashboard() {
  const { data: projects = [] } = useProjects()
  const [focusPeriod, setFocusPeriod] = useState('month')

  const [heatmapProject, setHeatmapProject] = useState<string | undefined>()
  const [heatmapDays, setHeatmapDays] = useState<number | undefined>()
  const { data: heatmap = [] } = useHeatmap(heatmapProject, heatmapDays)
  const { data: velocity = [] } = useVelocity()
  const { data: focus = [] } = useFocus(focusPeriod)
  const { data: health = [] } = useHealth()
  const { data: techStack = [] } = useTechStack()
  const { data: patterns } = usePatterns()
  const { data: streaks } = useStreaks()
  const { data: lifecycle = [] } = useLifecycle()

  const syncMutation = useSyncGitLog()
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState('')
  const [syncResults, setSyncResults] = useState<Array<{ name: string; synced: number; total: number; error?: boolean }>>([])
  const [showResults, setShowResults] = useState(false)

  async function syncAll() {
    setSyncing(true)
    setSyncResults([])
    setShowResults(false)
    const withPath = projects.filter(p => p.local_path)
    const results: typeof syncResults = []
    for (let i = 0; i < withPath.length; i++) {
      const p = withPath[i]
      setSyncProgress(`${i + 1}/${withPath.length}: ${p.name}`)
      try {
        const res = await syncMutation.mutateAsync({ projectId: p.id, fetchAll: true })
        results.push({ name: p.name, synced: res.synced, total: res.total_commits })
      } catch {
        results.push({ name: p.name, synced: 0, total: 0, error: true })
      }
    }
    setSyncResults(results)
    setShowResults(true)
    setSyncing(false)
    setSyncProgress('')
  }

  const hasData = heatmap.length > 0 || health.length > 0
  const projectsWithPath = projects.filter(p => p.local_path)

  return (
    <div style={{ padding: 24, paddingBottom: 100, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Analytics</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={syncAll}
          disabled={syncing || projectsWithPath.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {syncing ? (
            <>
              <span style={{ animation: 'pulse 1.5s infinite' }}>◦</span>
              {syncProgress}
            </>
          ) : (
            `Sync Git Logs (${projectsWithPath.length} projects)`
          )}
        </button>
        {!hasData && !showResults && projectsWithPath.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Click sync to import commit history from your projects
          </span>
        )}
        {showResults && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowResults(false)} style={{ fontSize: 11 }}>
            Dismiss
          </button>
        )}
      </div>

      {/* Sync results */}
      {showResults && syncResults.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>
            Sync Results
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {syncResults.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: r.error ? '#ef4444' : r.synced > 0 ? '#22c55e' : 'var(--muted)',
                }} />
                <span style={{ fontWeight: 500, minWidth: 160 }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
                  {r.error ? 'Error' : r.synced > 0 ? `+${r.synced} new commits (${r.total} total)` : `Up to date (${r.total} commits)`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streaks */}
      {streaks && (streaks.current_streak > 0 || streaks.longest_streak > 0) && (
        <div style={{ marginBottom: 24 }}>
          <StreakCounter data={streaks} />
        </div>
      )}

      {/* Heatmap */}
      <Section>
        <CommitHeatmap
          data={heatmap}
          projects={projects}
          onFilterChange={(projectId, days) => {
            setHeatmapProject(projectId)
            setHeatmapDays(days)
          }}
        />
      </Section>

      {/* Stall alerts */}
      {health.length > 0 && (
        <Section>
          <StallAlerts data={health} />
        </Section>
      )}

      {/* Velocity + Focus side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16, marginBottom: 20 }}>
        <Section>
          <VelocityChart data={velocity as VelocityWeek[]} />
        </Section>
        <Section>
          <FocusDistribution data={focus} onPeriodChange={setFocusPeriod} />
        </Section>
      </div>

      {/* Tech stack + Patterns side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16, marginBottom: 20 }}>
        <Section>
          <TechStackPortfolio data={techStack} />
        </Section>
        <Section>
          {patterns && <ContributionPatterns data={patterns} />}
        </Section>
      </div>

      {/* Lifecycle */}
      {lifecycle.length > 0 && (
        <Section>
          <ProjectLifecycle data={lifecycle} />
        </Section>
      )}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 16,
    }}>
      {children}
    </div>
  )
}
