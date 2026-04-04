import React from 'react'
import { useHeatmap, useVelocity, usePatterns, useStreaks, useSyncGitLog } from '../hooks/useAnalytics'
import { CommitHeatmap, ProjectVelocityChart, ContributionPatterns, StreakCounter } from './analytics'
import type { Project, ProjectVelocityWeek } from '../types'

interface Props {
  project: Project
}

export function ProjectAnalyticsTab({ project }: Props) {
  const { data: heatmap = [] } = useHeatmap(project.id)
  const { data: velocity = [] } = useVelocity(project.id)
  const { data: patterns } = usePatterns(project.id)
  const { data: streaks } = useStreaks(project.id)
  const syncMutation = useSyncGitLog()

  const hasData = heatmap.length > 0

  if (!project.local_path) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
        <p style={{ fontSize: 12, lineHeight: 1.8 }}>
          Set a local path on this project to enable git analytics.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sync button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="btn btn-sm"
          onClick={() => syncMutation.mutate({ projectId: project.id })}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync Git Log'}
        </button>
        {syncMutation.isSuccess && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {syncMutation.data?.synced} new, {syncMutation.data?.total_commits} total
          </span>
        )}
      </div>

      {!hasData && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 12 }}>
          No commit data yet. Click "Sync Git Log" to import history.
        </div>
      )}

      {/* Streaks */}
      {streaks && (streaks.current_streak > 0 || streaks.longest_streak > 0) && (
        <StreakCounter data={streaks} />
      )}

      {/* Heatmap */}
      {hasData && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <CommitHeatmap data={heatmap} title="Commit Activity" />
        </div>
      )}

      {/* Velocity */}
      {(velocity as ProjectVelocityWeek[]).length > 0 && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <ProjectVelocityChart data={velocity as ProjectVelocityWeek[]} />
        </div>
      )}

      {/* Patterns */}
      {patterns && patterns.by_hour?.length > 0 && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <ContributionPatterns data={patterns} />
        </div>
      )}
    </div>
  )
}
