import { create } from 'zustand'
import type { ViewMode, DrawerTab } from '../types'

type Theme = 'dark' | 'light'

interface AppStore {
  // Theme
  theme: Theme
  toggleTheme: () => void

  // View
  view: ViewMode
  setView: (v: ViewMode) => void

  // Drawer
  drawerProjectId: string | null
  drawerTab: DrawerTab
  openDrawer: (projectId: string, tab?: DrawerTab) => void
  closeDrawer: () => void
  setDrawerTab: (tab: DrawerTab) => void

  // AI Panel
  aiPanelOpen: boolean
  aiScopeProjectId: string | null
  openAIPanel: (scopeProjectId?: string) => void
  closeAIPanel: () => void
  clearAIScope: () => void
  setAIScope: (projectId: string | null) => void
}

const savedTheme = (localStorage.getItem('vf-theme') as Theme) || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

const VALID_VIEWS: ViewMode[] = ['dashboard', 'kanban', 'focus', 'analytics', 'settings']
const hashView = window.location.hash.slice(2) as ViewMode // strip #/
const initialView: ViewMode = VALID_VIEWS.includes(hashView) ? hashView : 'dashboard'

export const useAppStore = create<AppStore>((set) => ({
  theme: savedTheme,
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('vf-theme', next)
    return { theme: next }
  }),

  view: initialView,
  setView: (view) => {
    window.location.hash = `/${view}`
    set({ view })
  },

  drawerProjectId: null,
  drawerTab: 'overview',
  openDrawer: (projectId, tab = 'overview') =>
    set({ drawerProjectId: projectId, drawerTab: tab }),
  closeDrawer: () => set({ drawerProjectId: null }),
  setDrawerTab: (drawerTab) => set({ drawerTab }),

  aiPanelOpen: false,
  aiScopeProjectId: null,
  openAIPanel: (scopeProjectId) =>
    set({ aiPanelOpen: true, aiScopeProjectId: scopeProjectId ?? null }),
  closeAIPanel: () => set({ aiPanelOpen: false }),
  clearAIScope: () => set({ aiScopeProjectId: null }),
  setAIScope: (projectId) => set({ aiScopeProjectId: projectId }),
}))
