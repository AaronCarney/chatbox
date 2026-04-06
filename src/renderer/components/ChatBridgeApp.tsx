import { useAuth } from '@clerk/clerk-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchApps } from '../services/api.js'
import AppCard from './iframe/AppCard.js'
import { IframeManager } from './iframe/IframeManager.js'
import { PostMessageBroker } from './iframe/PostMessageBroker.js'
import { ToolCallIndicator } from './chat/ToolCallIndicator.js'
import { useChat } from '../hooks/useChat.js'
import { useIframeApps } from '../hooks/useIframeApps.js'
import { useToolExecution } from '../hooks/useToolExecution.js'
import { startMonitoring } from '../lib/content-safety/index.js'
import { SafetyOverlay } from './iframe/SafetyOverlay.js'

interface AvailableApp {
  id: string
  name: string
  iframe_url: string
  description_for_model?: string
  [key: string]: unknown
}

interface CompletedActivity {
  appName: string
  type: 'result' | 'error' | 'partial'
  payload: {
    title?: string
    score?: number
    maxScore?: number
    items?: { label: string; value: string }[]
    encouragement?: string
  }
}

export function ChatBridgeApp() {
  const { getToken } = useAuth()
  const { messages, isStreaming, streamingText, sendMessage, addToolResult, continueAfterToolCalls } = useChat()
  const { apps, iframeRefs, launchApp, getActiveApp } = useIframeApps()
  const { state: toolState, currentToolCall, handleToolCall, resolveToolCall } = useToolExecution()

  const [availableApps, setAvailableApps] = useState<AvailableApp[]>([])
  const [completedActivities, setCompletedActivities] = useState<CompletedActivity[]>([])
  const [input, setInput] = useState('')
  const [iframeHeights, setIframeHeights] = useState<Map<string, number>>(new Map())
  const [safetyOverlay, setSafetyOverlay] = useState<{ visible: boolean; hardBlock: boolean }>({ visible: false, hardBlock: false })

  const brokerRef = useRef<PostMessageBroker | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    fetchApps().then(setAvailableApps).catch(console.error)

    const broker = new PostMessageBroker([window.location.origin])
    brokerRef.current = broker

    broker.on('tool.result', (data: unknown) => {
      const d = data as { payload?: unknown } | null
      resolveToolCall(d?.payload ?? data)
    })

    broker.on('task.completed', (data: unknown) => {
      const d = data as { appName?: string; type?: string; payload?: object } | null
      setCompletedActivities((prev) => [
        ...prev,
        {
          appName: d?.appName ?? 'App',
          type: (d?.type as CompletedActivity['type']) ?? 'result',
          payload: d?.payload ?? {},
        },
      ])
    })

    broker.on('app.resize', (data: unknown) => {
      const d = data as { height?: number } | null
      if (d?.height) {
        const clamped = Math.min(600, Math.max(200, d.height))
        const active = getActiveApp()
        if (active) {
          setIframeHeights(prev => new Map(prev).set(active.id, clamped))
        }
      }
    })

    broker.on('app.state', (data: unknown) => {
      console.info('[ChatBridge] App state update received:', data)
    })

    // State persistence: validate source against known app IDs, enforce size limit
    const MAX_SAVE_SIZE = 512 * 1024 // 512KB per app
    broker.on('*', (envelope: unknown) => {
      const msg = envelope as { type?: string; source?: string; payload?: unknown } | null
      if (msg?.type === 'app.save' && msg.source) {
        // Validate source is a known launched app (prevents cross-app spoofing)
        if (!apps.has(msg.source)) {
          console.warn('[ChatBridge] Rejected app.save from unknown source:', msg.source)
          return
        }
        try {
          const serialized = JSON.stringify(msg.payload)
          if (serialized.length > MAX_SAVE_SIZE) {
            console.warn('[ChatBridge] Save payload too large, skipping:', msg.source, serialized.length)
            return
          }
          const key = `chatbridge:save:${sessionIdRef.current}:${msg.source}`
          localStorage.setItem(key, serialized)
        } catch (e) {
          console.warn('[ChatBridge] Failed to save app state:', e)
        }
      }
    })

    const apiUrl = import.meta.env.VITE_API_URL || ''
    const stopMonitoring = startMonitoring(
      () => {
        const active = getActiveApp()
        if (!active) return null
        const el = iframeRefs.current.get(active.id)
        if (!el) return null
        return { id: active.id, iframeEl: el }
      },
      broker,
      apiUrl,
      (action, appId) => {
        if (action === 'hard_block') setSafetyOverlay({ visible: true, hardBlock: true })
        else if (action === 'blur') setSafetyOverlay({ visible: true, hardBlock: false })
        else if (action === 'unblur') setSafetyOverlay({ visible: false, hardBlock: false })
        if (action !== 'none' && action !== 'unblur') {
          console.warn('[ContentSafety]', { action, appId, timestamp: Date.now() })
        }
      }
    )

    return () => { broker.destroy(); stopMonitoring() }
  }, [resolveToolCall])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const dispatchToolToApp = useCallback(async (
    toolId: string,
    toolName: string,
    args: Record<string, any>,
    targetApp: { id: string },
  ): Promise<any> => {
    const iframe = iframeRefs.current.get(targetApp.id)
    if (!iframe || !brokerRef.current) {
      return { error: 'No active iframe ref' }
    }

    const MAX_RETRIES = 3
    const TIMEOUT_MS = 30000
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const toolCallPromise = handleToolCall({ id: toolId, name: toolName })
        brokerRef.current.sendToIframe(iframe, 'tool.invoke', {
          name: toolName,
          arguments: args,
          requestId: toolId,
        })

        const result = await Promise.race([
          toolCallPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('App timed out')), TIMEOUT_MS)
          ),
        ])

        return result
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`[ChatBridge] Tool call attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError)
        if (attempt < MAX_RETRIES - 1) {
          resolveToolCall({ error: lastError })
        }
      }
    }

    console.warn('[ChatBridge] App timeout:', targetApp.id)
    resolveToolCall({ error: lastError })
    return { error: lastError }
  }, [handleToolCall, resolveToolCall, iframeRefs])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')

    try {
    const token = await getToken().catch(() => null)
    const activeApp = getActiveApp()

    const result = await sendMessage(trimmed, {
      activeAppId: activeApp?.id ?? null,
      authToken: token,
    })
    if (!result || result.type !== 'tool_calls') return

    for (const tc of result.toolCalls) {
      const name: string = tc.name ?? ''
      const id: string = tc.id ?? ''
      const rawArgs: string = tc.arguments ?? '{}'

      const parseArgs = () => {
        try { return JSON.parse(rawArgs) } catch { return {} }
      }

      switch (name) {
        case 'launch_app': {
          const args = parseArgs() as { appId?: string; url?: string; app_id?: string }
          const appId = args.appId ?? args.app_id ?? id
          const app = availableApps.find((a) => a.id === appId)
          launchApp(appId, app?.iframe_url ?? '')
          // Set taller default height for DOS arcade (50% viewport)
          if (appId === 'dos') {
            setIframeHeights(prev => new Map(prev).set(appId, Math.round(window.innerHeight * 0.5)))
          }
          // Wait for app.ready signal before sending task.launch (replaces fixed 500ms timeout)
          const readyTimeout = setTimeout(() => {
            // Fallback: if app doesn't send ready in 3s, launch anyway
            launchWhenReady(appId)
          }, 3000)
          const readyHandler = () => {
            clearTimeout(readyTimeout)
            launchWhenReady(appId)
          }
          broker.on('app.ready', readyHandler)

          function launchWhenReady(id: string) {
            broker.off('app.ready', readyHandler)
            const iframe = iframeRefs.current.get(id)
            if (iframe && brokerRef.current) {
              let savedState: unknown = undefined
              try {
                const raw = localStorage.getItem(`chatbridge:save:${sessionIdRef.current}:${id}`)
                if (raw) {
                  const parsed = JSON.parse(raw)
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    savedState = parsed
                  }
                }
              } catch { /* ignore corrupted state */ }
              brokerRef.current.launchApp(iframe, id, { sessionId: sessionIdRef.current, savedState })
            }
          }
          addToolResult(id, JSON.stringify({ launched: appId }))
          break
        }

        case 'get_available_apps': {
          addToolResult(id, JSON.stringify(availableApps))
          break
        }

        case 'get_app_state': {
          const args = parseArgs() as { app_id?: string }
          const targetApp = args.app_id
            ? apps.get(args.app_id)
            : getActiveApp()
          if (targetApp && brokerRef.current) {
            const iframe = iframeRefs.current.get(targetApp.id)
            if (iframe) {
              try {
                const state = await brokerRef.current.requestState(targetApp.id, iframe)
                addToolResult(id, JSON.stringify(state))
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                addToolResult(id, JSON.stringify({ error: msg }))
              }
            } else {
              addToolResult(id, JSON.stringify({ error: 'No active iframe ref' }))
            }
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }

        case 'search_tracks':
        case 'get_recommendations': {
          if (activeApp) {
            const result = await dispatchToolToApp(id, name, parseArgs(), activeApp)
            addToolResult(id, JSON.stringify(result))

            // Render as native AppCard (two-tier: card instead of iframe-only)
            const tracks = (result as any)?.tracks
            if (Array.isArray(tracks)) {
              setCompletedActivities((prev) => [
                ...prev,
                {
                  appName: 'Spotify',
                  type: 'result' as const,
                  payload: {
                    title: name === 'search_tracks' ? 'Search Results' : 'Recommendations',
                    items: tracks.slice(0, 5).map((t: any) => ({
                      label: t.name || t.id,
                      value: t.artist || (t.artists?.[0]?.name ?? ''),
                    })),
                  },
                },
              ])
            }
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }

        default: {
          if (activeApp) {
            const result = await dispatchToolToApp(id, name, parseArgs(), activeApp)
            addToolResult(id, JSON.stringify(result))
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }
      }
    }

    // Send tool results back to LLM for follow-up response
    const followUp = await continueAfterToolCalls({
      activeAppId: activeApp?.id ?? null,
      authToken: token,
    })

    // Handle chained tool calls (rare but possible)
    if (followUp?.type === 'tool_calls') {
      for (const tc of followUp.toolCalls) {
        const id: string = tc.id ?? ''
        const name: string = tc.name ?? ''
        addToolResult(id, JSON.stringify({ error: 'Chained tool calls not yet supported: ' + name }))
      }
      await continueAfterToolCalls({ activeAppId: activeApp?.id ?? null, authToken: token })
    }
    } catch (err) {
      console.error('[ChatBridge] handleSend error:', err)
    }
  }, [input, isStreaming, getToken, sendMessage, availableApps, launchApp, addToolResult, getActiveApp, iframeRefs, handleToolCall, dispatchToolToApp, continueAfterToolCalls])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const isToolExecuting = toolState === 'tool_call_detected' || toolState === 'tool_executing'

  const hasActiveApp = Array.from(apps.values()).some((app) => app.status === 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: '#16161e' }}>
      {/* App panel — fixed height when active, hidden when no app */}
      {hasActiveApp && (
        <div style={{
          flex: '0 0 65vh',
          borderBottom: '2px solid #2d2d3d',
          backgroundColor: '#1a1a2e',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {Array.from(apps.values())
            .filter((app) => app.status !== 'serialized')
            .map((app) => (
              <IframeManager
                key={app.id}
                appId={app.id}
                iframeUrl={app.iframeUrl}
                isActive={app.status === 'active'}
                height={iframeHeights.get(app.id)}
                sandbox={app.id === 'spotify' ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : 'allow-scripts'}
                onRef={(el) => {
                  if (el) {
                    iframeRefs.current.set(app.id, el)
                  } else {
                    iframeRefs.current.delete(app.id)
                  }
                }}
              />
            ))}
          <SafetyOverlay visible={safetyOverlay.visible} hardBlock={safetyOverlay.hardBlock} />
        </div>
      )}

      {/* Hidden iframes for inactive apps (keep alive for state) */}
      {!hasActiveApp && Array.from(apps.values())
        .filter((app) => app.status !== 'serialized' && app.status !== 'active')
        .map((app) => (
          <IframeManager
            key={app.id}
            appId={app.id}
            iframeUrl={app.iframeUrl}
            isActive={false}
            sandbox={'allow-scripts'}
            onRef={(el) => {
              if (el) iframeRefs.current.set(app.id, el)
              else iframeRefs.current.delete(app.id)
            }}
          />
        ))}

      {/* Chat panel — independent scroll */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        backgroundColor: '#16161e',
      }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {messages.map((msg, i) => {
            if (msg.role === 'tool') return null
            if (msg.role === 'assistant' && !msg.content && msg.tool_calls) return null
            if (msg.role === 'assistant' && !msg.content) return null
            const isUser = msg.role === 'user'
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    backgroundColor: isUser ? '#2563eb' : '#2a2a3a',
                    color: isUser ? '#fff' : '#e0e0e6',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            )
          })}

          {isStreaming && streamingText ? (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  maxWidth: '70%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: '#2a2a3a',
                  color: '#e0e0e6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '14px',
                }}
              >
                {streamingText}
              </div>
            </div>
          ) : null}

          {isToolExecuting && currentToolCall ? (
            <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '4px' }}>
              <ToolCallIndicator toolName={currentToolCall.name} state="executing" />
            </div>
          ) : null}

          {completedActivities.map((activity, i) => (
            <AppCard
              key={i}
              appName={activity.appName}
              type={activity.type}
              payload={activity.payload}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar — pinned at bottom of chat panel */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 16px',
            borderTop: '1px solid #2d2d3d',
            backgroundColor: '#1e1e2e',
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #3d3d4d',
              backgroundColor: '#252535',
              color: '#e0e0e6',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isStreaming || !input.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#fff',
              fontSize: '14px',
              cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: isStreaming || !input.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
