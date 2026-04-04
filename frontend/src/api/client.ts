import type {
  Project, ProjectCreate, ProjectUpdate,
  Bucket, BucketCreate, BucketUpdate,
  State, StateCreate, StateUpdate,
  NextStep, SubGoal, ProjectLink, Insight, ProjectDoc, ProjectNote,
  ChatRequest, ChatMessage, ChatSession,
  WeeklyFocus, WeeklyFocusCreate,
  HeatmapDay, VelocityWeek, ProjectVelocityWeek,
  FocusItem, HealthItem, TechStackItem,
  ContributionPatterns, StreakData, LifecycleItem,
} from '../types'

const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`API ${res.status}: ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Projects ──────────────────────────────────────────────────────────────────

export const api = {
  projects: {
    list: () => req<Project[]>('/projects'),
    get: (id: string) => req<Project>(`/projects/${id}`),
    create: (body: ProjectCreate) => req<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ProjectUpdate) => req<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
    analyze: (id: string) => req<Project>(`/projects/${id}/analyze`, { method: 'POST' }),
    refreshStats: (id: string) => req<Project>(`/projects/${id}/refresh-stats`, { method: 'POST' }),
  },

  steps: {
    create: (projectId: string, text: string) =>
      req<NextStep>(`/projects/${projectId}/steps`, { method: 'POST', body: JSON.stringify({ text }) }),
    update: (projectId: string, stepId: string, data: Partial<NextStep>) =>
      req<NextStep>(`/projects/${projectId}/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (projectId: string, stepId: string) =>
      req<void>(`/projects/${projectId}/steps/${stepId}`, { method: 'DELETE' }),
  },

  goals: {
    create: (projectId: string, text: string, category: string) =>
      req<SubGoal>(`/projects/${projectId}/goals`, { method: 'POST', body: JSON.stringify({ text, category }) }),
    update: (projectId: string, goalId: string, data: Partial<SubGoal>) =>
      req<SubGoal>(`/projects/${projectId}/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (projectId: string, goalId: string) =>
      req<void>(`/projects/${projectId}/goals/${goalId}`, { method: 'DELETE' }),
  },

  links: {
    create: (projectId: string, label: string, url: string) =>
      req<ProjectLink>(`/projects/${projectId}/links`, { method: 'POST', body: JSON.stringify({ label, url }) }),
    delete: (projectId: string, linkId: string) =>
      req<void>(`/projects/${projectId}/links/${linkId}`, { method: 'DELETE' }),
  },

  projectNotes: {
    create: (projectId: string, text: string, category: string = 'general') =>
      req<ProjectNote>(`/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify({ text, category }) }),
    update: (projectId: string, noteId: string, data: { text?: string; category?: string }) =>
      req<ProjectNote>(`/projects/${projectId}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (projectId: string, noteId: string) =>
      req<void>(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' }),
  },

  docs: {
    create: (projectId: string, body: { name: string; source?: string; file_path?: string; content?: string }) =>
      req<ProjectDoc>(`/projects/${projectId}/docs`, { method: 'POST', body: JSON.stringify(body) }),
    update: (projectId: string, docId: string, data: { name?: string; content?: string; file_path?: string }) =>
      req<ProjectDoc>(`/projects/${projectId}/docs/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (projectId: string, docId: string) =>
      req<void>(`/projects/${projectId}/docs/${docId}`, { method: 'DELETE' }),
    getContent: (projectId: string, docId: string) =>
      req<{ content: string }>(`/projects/${projectId}/docs/${docId}/content`),
  },

  insights: {
    create: (projectId: string, text: string, prompt?: string) =>
      req<Insight>(`/projects/${projectId}/insights`, {
        method: 'POST',
        body: JSON.stringify({ text, prompt: prompt ?? null }),
      }),
    delete: (projectId: string, insightId: string) =>
      req<void>(`/projects/${projectId}/insights/${insightId}`, { method: 'DELETE' }),
  },

  buckets: {
    list: () => req<Bucket[]>('/buckets'),
    create: (body: BucketCreate) => req<Bucket>('/buckets', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: BucketUpdate) => req<Bucket>(`/buckets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => req<void>(`/buckets/${id}`, { method: 'DELETE' }),
  },

  states: {
    list: () => req<State[]>('/states'),
    create: (body: StateCreate) => req<State>('/states', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: StateUpdate) => req<State>(`/states/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => req<void>(`/states/${id}`, { method: 'DELETE' }),
  },

  focus: {
    list: () => req<WeeklyFocus[]>('/projects/focus'),
    create: (body: WeeklyFocusCreate) =>
      req<WeeklyFocus>('/projects/focus', { method: 'POST', body: JSON.stringify(body) }),
    update: (focusId: string, data: { commitment?: string; tasks?: any[]; notes?: string; notes_pinned?: boolean; position?: number }) =>
      req<WeeklyFocus>(`/projects/focus/${focusId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (focusId: string) =>
      req<void>(`/projects/focus/${focusId}`, { method: 'DELETE' }),
  },

  analytics: {
    heatmap: (projectId?: string, days?: number) => {
      const path = projectId ? `/analytics/heatmap/${projectId}` : '/analytics/heatmap'
      const params = days ? `?days=${days}` : ''
      return req<HeatmapDay[]>(`${path}${params}`)
    },
    velocity: (projectId?: string, days?: number) => {
      const path = projectId ? `/analytics/velocity/${projectId}` : '/analytics/velocity'
      const params = days ? `?days=${days}` : ''
      return projectId
        ? req<ProjectVelocityWeek[]>(`${path}${params}`)
        : req<VelocityWeek[]>(`${path}${params}`)
    },
    focus: (period?: string, days?: number) => {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return req<FocusItem[]>(`/analytics/focus${qs ? '?' + qs : ''}`)
    },
    health: () => req<HealthItem[]>('/analytics/health'),
    healthHistory: (projectId: string, days?: number) => {
      const params = days ? `?days=${days}` : ''
      return req<any[]>(`/analytics/health/${projectId}${params}`)
    },
    techStack: () => req<TechStackItem[]>('/analytics/tech-stack'),
    patterns: (projectId?: string, days?: number) => {
      const params = new URLSearchParams()
      if (projectId) params.set('project_id', projectId)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return req<ContributionPatterns>(`/analytics/patterns${qs ? '?' + qs : ''}`)
    },
    streaks: (projectId?: string) => {
      const params = projectId ? `?project_id=${projectId}` : ''
      return req<StreakData>(`/analytics/streaks${params}`)
    },
    lifecycle: (days?: number) => {
      const params = days ? `?days=${days}` : ''
      return req<LifecycleItem[]>(`/analytics/lifecycle${params}`)
    },
    syncGitLog: (projectId: string, fetchAll?: boolean) =>
      req<{ synced: number; total_commits: number; health_status: string }>(
        `/projects/${projectId}/sync-git-log${fetchAll ? '?fetch_all=true' : ''}`,
        { method: 'POST' }
      ),
  },

  chatSessions: {
    get: (scopeType: string, projectId?: string | null) => {
      const params = new URLSearchParams({ scope_type: scopeType })
      if (projectId) params.set('project_id', projectId)
      return req<ChatSession | null>(`/chat/session?${params}`)
    },
    clear: (scopeType: string, projectId?: string | null) => {
      const params = new URLSearchParams({ scope_type: scopeType })
      if (projectId) params.set('project_id', projectId)
      return req<void>(`/chat/session?${params}`, { method: 'DELETE' })
    },
  },
}


// ── Streaming chat ─────────────────────────────────────────────────────────────

/**
 * Stream a chat response from the backend.
 * Calls onChunk with each text chunk, calls onDone when complete.
 */
export async function streamChat(
  request: ChatRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  onStatus?: (status: string) => void,
): Promise<void> {
  try {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok || !res.body) {
      throw new Error(`Chat API ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = 'message'

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            onDone()
            return
          }
          if (currentEvent === 'status' && onStatus) {
            onStatus(data)
          } else {
            onChunk(data)
          }
          currentEvent = 'message'
        }
      }
    }
    onDone()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
