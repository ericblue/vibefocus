import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { useProjects, showToast } from '../hooks/useProjects'
import { streamChat, api } from '../api/client'
import type { ChatMessage, Project } from '../types'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  prompt?: string   // the user message that triggered this assistant response
  steps?: string[]  // thinking/tool steps shown during streaming
}

let msgId = 0
function nextId() { return String(++msgId) }

export function AIPanel() {
  const { aiPanelOpen, aiScopeProjectId, closeAIPanel, clearAIScope, setAIScope } = useAppStore()
  const { data: projects = [] } = useProjects()
  const qc = useQueryClient()

  const scopeType = aiScopeProjectId ? 'project' : 'portfolio'

  const welcomeMessage: DisplayMessage = {
    id: 'welcome', role: 'assistant',
    content: `I have your full portfolio in context — every project, its current state, code analysis, and git activity.\n\nStart anywhere: drill into a specific project, ask portfolio-wide questions, or describe what's on your mind. I'll move between project-level and portfolio-level naturally.\n\nWhen I give you something worth keeping, hover over a response and hit "Save Insight" to pin it to a project.`,
  }

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['chatSession', scopeType, aiScopeProjectId],
    queryFn: () => api.chatSessions.get(scopeType, aiScopeProjectId),
    enabled: aiPanelOpen,
    staleTime: Infinity,
  })

  const [messages, setMessages] = useState<DisplayMessage[]>([welcomeMessage])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const messagesEl = useRef<HTMLDivElement>(null)
  const inputEl = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<boolean>(false)

  const focusProject = projects.find(p => p.id === aiScopeProjectId)

  // Load session history when session data arrives or scope changes
  useEffect(() => {
    if (sessionLoading) return
    if (session?.messages?.length) {
      const display: DisplayMessage[] = session.messages.map((m, i) => ({
        id: String(i),
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      setMessages(display)
      msgId = display.length
    } else {
      setMessages([welcomeMessage])
      msgId = 0
    }
  }, [session, sessionLoading, aiScopeProjectId])

  useEffect(() => {
    if (aiPanelOpen) setTimeout(() => inputEl.current?.focus(), 350)
  }, [aiPanelOpen])

  useEffect(() => {
    if (messagesEl.current) {
      messagesEl.current.scrollTop = messagesEl.current.scrollHeight
    }
  }, [messages])

  // Quick prompts — larger pool, shuffled, with refresh
  const [promptSeed, setPromptSeed] = useState(0)

  const allProjectPrompts = focusProject ? [
    // Focus & planning
    `Help me plan my week for ${focusProject.name}. What are the highest-impact things I can do?`,
    `What's blocking ${focusProject.name} from launching? Be specific about code and non-code blockers.`,
    `What's the single most important next action for ${focusProject.name}?`,
    `What non-dev work does ${focusProject.name} most need right now?`,
    // Code-aware
    `Can you look at the codebase and tell me what's missing before ${focusProject.name} is production-ready?`,
    `What are the biggest technical risks in ${focusProject.name} right now?`,
    `Find the main API endpoints and summarize what they do.`,
    `Are there any code quality issues or missing error handling you can spot?`,
    // Strategic
    `Why do you think ${focusProject.name} might be stalling?`,
    `What assumptions am I making about ${focusProject.name} that I should test first?`,
    `If I could only ship one feature this week for ${focusProject.name}, what should it be and why?`,
    `How does ${focusProject.name} fit into my broader portfolio? Is it getting the right amount of attention?`,
    // Completion & progress
    `Based on the code, do you agree with my completion estimate for ${focusProject.name}?`,
    `What would it take to get ${focusProject.name} from its current state to MVP?`,
    `Draft 3 concrete next steps for ${focusProject.name} based on the code state.`,
  ] : [
    // Weekly focus
    'Help me plan my week. Which projects should get my attention and why?',
    'Help me pick 3 projects to actually move this week. Be opinionated.',
    'Look at my focused projects — am I spreading myself too thin or is this manageable?',
    'What should I stop working on? Which project is least likely to go anywhere?',
    // Pattern recognition
    'What patterns do you see in where my projects are stalling?',
    'Am I over-indexed anywhere? What does the shape of my portfolio say about my real priorities?',
    'Which projects have been quietly drifting that I should either kill or commit to?',
    'Are any of my projects close enough to launch that I should sprint on them?',
    // Strategic
    'Which project has the clearest path to revenue in the next 60 days?',
    'If I could only keep 2 projects, which ones and why?',
    'What non-dev work am I probably avoiding across my portfolio?',
    'Look at my completion percentages — are any of them wrong based on what you see in the code?',
    // Cross-project
    'Are any of my projects similar enough that I should consolidate them?',
    'What does my commit activity say about where my real energy is going?',
    'Rank my projects by momentum. Which ones are alive vs. on life support?',
  ]

  // Shuffle and pick 5 based on seed
  const quickPrompts = (() => {
    const shuffled = [...allProjectPrompts]
    let seed = promptSeed
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, 5)
  })()

  async function send(text: string) {
    if (!text.trim() || thinking) return
    setInput('')

    const userMsg: DisplayMessage = { id: nextId(), role: 'user', content: text }
    const assistantId = nextId()
    const assistantMsg: DisplayMessage = { id: assistantId, role: 'assistant', content: '', streaming: true, prompt: text }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setThinking(true)
    abortRef.current = false

    // Build history from display messages (exclude streaming placeholder and welcome)
    const history: ChatMessage[] = messages
      .filter(m => !m.streaming && m.id !== 'welcome')
      .map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text })

    await streamChat(
      { messages: history, focus_project_id: aiScopeProjectId ?? null },
      (chunk) => {
        if (abortRef.current) return
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m
        ))
      },
      () => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false, steps: undefined } : m
        ))
        setThinking(false)
        // Invalidate session cache so next open loads persisted data
        qc.invalidateQueries({ queryKey: ['chatSession', scopeType, aiScopeProjectId] })
      },
      (err) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: 'Error: ' + err.message, streaming: false } : m
        ))
        setThinking(false)
      },
      (status) => {
        if (abortRef.current) return
        setMessages(prev => prev.map(m => {
          if (m.id !== assistantId) return m
          if (!status) return { ...m, steps: undefined } // clear on empty
          const steps = [...(m.steps || []), status]
          return { ...m, steps }
        }))
      },
    )
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  if (!aiPanelOpen) return null

  return (
    <>
      {/* Backdrop just enough to catch clicks outside */}
      <div
        onClick={closeAIPanel}
        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 520, background: 'var(--surface)',
        borderTop: '1px solid rgba(37,99,235,0.3)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
        boxShadow: '0 -20px 60px rgba(0,0,0,0.25)',
      }}
        onClick={e => e.stopPropagation()}
      >
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(37,99,235,0.06)', flexShrink: 0,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flex: 1 }}>
            Portfolio Intelligence
          </span>

          <select
            value={aiScopeProjectId ?? ''}
            onChange={e => e.target.value ? setAIScope(e.target.value) : clearAIScope()}
            style={{
              background: 'var(--surface2)', color: 'var(--accent)',
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer',
              fontFamily: 'var(--font)', maxWidth: 180,
            }}
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await api.chatSessions.clear(scopeType, aiScopeProjectId)
              qc.invalidateQueries({ queryKey: ['chatSession', scopeType, aiScopeProjectId] })
              setMessages([welcomeMessage])
              msgId = 0
            }}
            style={{ fontSize: 10 }}
          >New Chat</button>
          <button className="btn-icon" onClick={closeAIPanel} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        {/* Quick prompts */}
        <div style={{ display: 'flex', gap: 7, padding: '8px 20px', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
          {quickPrompts.map((qp, i) => (
            <button key={`${promptSeed}-${i}`} onClick={() => send(qp)} disabled={thinking} style={{
              padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(37,99,235,0.4)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'
              }}
              title={qp}
            >{qp.length > 48 ? qp.slice(0, 48) + '…' : qp}</button>
          ))}
          <button
            onClick={() => setPromptSeed(s => s + 1)}
            title="Show different suggestions"
            style={{
              padding: '3px 8px', borderRadius: 20, fontSize: 11,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.12s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
          >{'↻'}</button>
        </div>

        {/* Messages */}
        <div ref={messagesEl} style={{ flex: 1, overflowY: 'auto', padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              projects={projects}
              scopeProjectId={aiScopeProjectId}
              onSaveInsight={(projectId, text) => {
                api.insights.create(projectId, text, msg.prompt ?? undefined)
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ['projects'] })
                    showToast(`Insight saved ✓`)
                  })
              }}
            />
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, alignItems: 'flex-end' }}>
          <textarea
            ref={inputEl}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
            }}
            onKeyDown={handleKey}
            placeholder="Ask about your portfolio..."
            rows={1}
            style={{
              flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
              fontFamily: 'var(--font)', fontSize: 13, outline: 'none',
              resize: 'none', maxHeight: 100, minHeight: 40,
              transition: 'border-color 0.12s', lineHeight: 1.5,
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(37,99,235,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
          />
          <button
            onClick={() => send(input)}
            disabled={thinking || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 8, flexShrink: 0,
              background: thinking ? 'var(--surface3)' : 'var(--accent)',
              border: 'none', color: '#fff', cursor: thinking ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, opacity: thinking || !input.trim() ? 0.45 : 1,
              transition: 'all 0.12s',
            }}
          >↑</button>
        </div>
      </div>
    </>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg, projects, scopeProjectId, onSaveInsight }: {
  msg: DisplayMessage
  projects: Project[]
  scopeProjectId: string | null
  onSaveInsight: (projectId: string, text: string) => void
}) {
  const [savedToId, setSavedToId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState(scopeProjectId ?? '')
  const [hovered, setHovered] = useState(false)

  function handleSave() {
    const pid = scopeProjectId ?? selectedProjectId
    if (!pid) { showToast('Pick a project first'); return }
    onSaveInsight(pid, msg.content)
    setSavedToId(pid)
  }

  const showControls = msg.role === 'assistant' && !msg.streaming && msg.content && (hovered || savedToId)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '82%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thinking steps */}
      {msg.streaming && msg.steps && msg.steps.length > 0 && (
        <ThinkingSteps steps={msg.steps} />
      )}

      {/* Message bubble — hide when streaming with steps but no content yet */}
      {!(msg.streaming && !msg.content && msg.steps?.length) && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.65,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          ...(msg.role === 'user'
            ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 3 }
            : { background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)', borderBottomLeftRadius: 3 }),
        }}>
          {msg.content}
          {msg.streaming && !msg.content && (
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '2px 0' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 5, height: 5, background: 'var(--muted)', borderRadius: '50%', display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
              ))}
            </span>
          )}
        </div>
      )}

      {showControls && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', opacity: savedToId ? 1 : 0.85, transition: 'opacity 0.12s' }}>
          {!scopeProjectId && !savedToId && (
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              style={{
                background: 'var(--surface)', border: '1px solid rgba(37,99,235,0.3)',
                color: 'var(--accent)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font)',
                padding: '2px 6px', cursor: 'pointer', maxWidth: 150,
              }}
            >
              <option value="">Save insight to...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {!savedToId ? (
            <button onClick={handleSave} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: 'rgba(37,99,235,0.15)', color: 'var(--accent)',
              border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.12s',
            }}>✦ Save Insight</button>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.15)', color: '#34d399',
              border: '1px solid rgba(16,185,129,0.3)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>✓ Saved</span>
          )}
        </div>
      )}
    </div>
  )
}


// ── Thinking steps indicator ──────────────────────────────────────────────────

function ThinkingSteps({ steps }: { steps: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const lastStep = steps[steps.length - 1]

  return (
    <div style={{
      fontSize: 11, color: 'var(--muted)', borderRadius: 8,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      overflow: 'hidden', marginBottom: 4,
    }}>
      {/* Current step header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
          display: 'inline-block', animation: 'pulse 1.5s infinite',
        }} />
        <span style={{ flex: 1 }}>{lastStep}</span>
        <span style={{ fontSize: 9, color: 'var(--muted)' }}>
          {expanded ? '▾' : '▸'} {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded step list */}
      {expanded && steps.length > 1 && (
        <div style={{
          padding: '4px 10px 8px', borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {steps.slice(0, -1).map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}>
              <span style={{ fontSize: 8, color: 'var(--muted)' }}>✓</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
