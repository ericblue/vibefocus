// ── Bucket ───────────────────────────────────────────────────────────────────

export interface Bucket {
  id: string
  name: string
  color: string
  position: number
}

export interface BucketCreate {
  name: string
  color: string
  position?: number
}

export interface BucketUpdate {
  name?: string
  color?: string
  position?: number
}


// ── State ────────────────────────────────────────────────────────────────────

export interface State {
  id: string
  name: string
  color: string
  position: number
}

export interface StateCreate {
  name: string
  color: string
  position?: number
}

export interface StateUpdate {
  name?: string
  color?: string
  position?: number
}


// ── Project sub-items ─────────────────────────────────────────────────────────

export interface NextStep {
  id: string
  text: string
  done: boolean
  position: number
}

export type GoalCategory = 'Users' | 'Marketing' | 'Revenue' | 'Dev' | 'Experiments' | 'Other'

export interface SubGoal {
  id: string
  text: string
  category: GoalCategory
  done: boolean
}

export interface ProjectLink {
  id: string
  label: string
  url: string
}

export interface Insight {
  id: string
  project_id: string
  text: string
  prompt: string | null
  saved_at: string   // ISO datetime
}


// ── Project ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  notes: string
  bucket_id: string
  state_id: string | null

  // Source links
  github_url: string | null
  local_path: string | null

  // Git / GitHub stats
  git_last_commit: string | null
  git_branch: string | null
  git_uncommitted: boolean
  github_stars: number | null
  github_open_issues: number | null
  github_last_push: string | null
  stats_updated_at: string | null

  // Code analysis (Agent SDK)
  code_summary: string | null
  code_tech_stack: string[] | null
  code_todos: Array<{ file: string; line: number; text: string }> | null
  last_analyzed_at: string | null

  // Completion tracking
  completion_pct: number
  ai_completion_pct: number | null
  ai_completion_reason: string | null
  target_date: string | null
  priority: 'low' | 'medium' | 'high'
  kanban_position: number

  // Relations
  next_steps: NextStep[]
  sub_goals: SubGoal[]
  links: ProjectLink[]
  insights: Insight[]
  docs: ProjectDoc[]
  project_notes: ProjectNote[]

  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  description?: string
  notes?: string
  bucket_id: string
  state_id?: string | null
  github_url?: string | null
  local_path?: string | null
}

export interface ProjectUpdate {
  name?: string
  description?: string
  notes?: string
  bucket_id?: string
  state_id?: string | null
  github_url?: string | null
  local_path?: string | null
  completion_pct?: number
  target_date?: string | null
  priority?: 'low' | 'medium' | 'high'
  kanban_position?: number
}


// ── Project Note ─────────────────────────────────────────────────────────────

export type NoteCategory = 'general' | 'decision' | 'blocker' | 'idea' | 'meeting'

export interface ProjectNote {
  id: string
  project_id: string
  text: string
  category: NoteCategory
  created_at: string
}


// ── Project Doc ──────────────────────────────────────────────────────────────

export interface ProjectDoc {
  id: string
  name: string
  doc_type: 'detected' | 'manual'
  source: 'pasted' | 'file' | null
  file_path: string | null
  content: string | null
  summary: string | null
  detected_at: string | null
  created_at: string
}


// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  focus_project_id?: string | null
}

export interface ChatSession {
  id: string
  scope_type: 'portfolio' | 'project'
  scope_id: string | null
  messages: ChatMessage[]
  summary: string | null
  created_at: string
  updated_at: string
}


// ── Weekly Focus ─────────────────────────────────────────────────────────────

export interface FocusTask {
  text: string
  done: boolean
}

export interface WeeklyFocus {
  id: string
  project_id: string
  commitment: string
  tasks: FocusTask[]
  notes: string
  notes_pinned: boolean
  position: number
  created_at: string
}

export interface WeeklyFocusCreate {
  project_id: string
  commitment?: string
}


// ── Analytics ─────────────────────────────────────────────────────────────────

export interface HeatmapDay {
  day: string
  commits: number
}

export interface VelocityWeek {
  week: string
  project_id: string
  project_name: string
  commits: number
  lines_changed: number
}

export interface ProjectVelocityWeek {
  week: string
  commits: number
  lines_changed: number
}

export interface FocusItem {
  project_id: string
  project_name: string
  bucket_id: string | null
  commits: number
  lines_changed: number
  percentage: number
}

export interface HealthItem {
  project_id: string
  project_name: string
  status: 'active' | 'cooling' | 'dormant'
  commits_7d: number
  commits_30d: number
  total_commits: number
  transition: { from: string; to: string; at: string } | null
}

export interface TechStackItem {
  tech: string
  project_count: number
  projects: string[]
}

export interface ContributionPatterns {
  by_hour: { hour: number; commits: number }[]
  by_dow: { day: string; day_num: number; commits: number }[]
  avg_commit_size: { week: string; avg_size: number }[]
}

export interface StreakData {
  current_streak: number
  longest_streak: number
  total_active_days: number
  days_tracked: number
}

export interface LifecycleItem {
  project_id: string
  project_name: string
  first_commit: string
  last_commit: string
  total_commits: number
  monthly_activity: { month: string; commits: number }[]
}


// ── UI helpers ────────────────────────────────────────────────────────────────

export type ViewMode = 'dashboard' | 'kanban' | 'focus' | 'analytics' | 'settings'
export type DrawerTab = 'overview' | 'notes' | 'steps' | 'goals' | 'code' | 'docs' | 'insights' | 'analytics'

export interface UIState {
  view: ViewMode
  drawerProjectId: string | null
  drawerTab: DrawerTab
  aiPanelOpen: boolean
  aiScopeProjectId: string | null
}
