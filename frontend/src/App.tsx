import React, { useEffect } from 'react'
import { useProjects, useBuckets } from './hooks/useProjects'
import { useAppStore } from './store/appStore'
import { Header } from './components/Header'
import { Dashboard } from './components/Dashboard'
import { KanbanBoard } from './components/KanbanBoard'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import { FocusView } from './components/FocusView'
import { SettingsView } from './components/SettingsView'
import { ProjectDrawer } from './components/ProjectDrawer'
import { AIPanel } from './components/AIPanel'

export default function App() {
  const { view, drawerProjectId, closeDrawer, setView } = useAppStore()

  // Sync hash → view on browser back/forward
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(2) as any
      const valid = ['dashboard', 'kanban', 'focus', 'analytics', 'settings']
      if (valid.includes(hash) && hash !== useAppStore.getState().view) {
        useAppStore.setState({ view: hash })
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const { data: projects = [], isLoading, isError } = useProjects()
  const { data: buckets = [] } = useBuckets()

  const drawerProject = drawerProjectId ? projects.find(p => p.id === drawerProjectId) : null

  if (isError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: 'var(--muted)' }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <p style={{ fontSize: 14 }}>Could not connect to backend.</p>
        <p style={{ fontSize: 12 }}>Make sure the backend is running (<code style={{ fontFamily: 'var(--mono)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>make be</code>).</p>
        <button className="btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13, gap: 10 }}>
        <span style={{ animation: 'pulse 1.5s infinite' }}>◦</span> loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <main style={{ flex: 1 }}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'kanban'    && <KanbanBoard />}
        {view === 'focus'     && <FocusView />}
        {view === 'analytics' && <AnalyticsDashboard />}
        {view === 'settings'  && <SettingsView />}
      </main>

      {/* Project Drawer */}
      {drawerProjectId && (
        <>
          <div
            onClick={closeDrawer}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 100, opacity: drawerProject ? 1 : 0,
              transition: 'opacity 0.2s', pointerEvents: drawerProject ? 'auto' : 'none',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(780px, 100vw)',
            background: 'var(--surface)', borderLeft: '1px solid var(--border2)',
            zIndex: 101, display: 'flex', flexDirection: 'column',
            transform: drawerProject ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {drawerProject
              ? <ProjectDrawer project={drawerProject} />
              : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading...</div>
            }
          </div>
        </>
      )}

      {/* AI Panel */}
      <AIPanel />

      {/* Toast */}
      <div id="vf-toast" className="toast" />
    </div>
  )
}
