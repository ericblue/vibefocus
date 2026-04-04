import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useHeatmap(projectId?: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'heatmap', projectId, days],
    queryFn: () => api.analytics.heatmap(projectId, days),
  })
}

export function useVelocity(projectId?: string, days?: number) {
  return useQuery({
    queryKey: ['analytics', 'velocity', projectId, days],
    queryFn: () => api.analytics.velocity(projectId, days),
  })
}

export function useFocus(period?: string) {
  return useQuery({
    queryKey: ['analytics', 'focus', period],
    queryFn: () => api.analytics.focus(period),
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['analytics', 'health'],
    queryFn: () => api.analytics.health(),
  })
}

export function useTechStack() {
  return useQuery({
    queryKey: ['analytics', 'tech-stack'],
    queryFn: () => api.analytics.techStack(),
  })
}

export function usePatterns(projectId?: string) {
  return useQuery({
    queryKey: ['analytics', 'patterns', projectId],
    queryFn: () => api.analytics.patterns(projectId),
  })
}

export function useStreaks(projectId?: string) {
  return useQuery({
    queryKey: ['analytics', 'streaks', projectId],
    queryFn: () => api.analytics.streaks(projectId),
  })
}

export function useLifecycle() {
  return useQuery({
    queryKey: ['analytics', 'lifecycle'],
    queryFn: () => api.analytics.lifecycle(),
  })
}

export function useSyncGitLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, fetchAll }: { projectId: string; fetchAll?: boolean }) =>
      api.analytics.syncGitLog(projectId, fetchAll),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
