import { useAuth } from '@clerk/clerk-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchApps } from '../services/api.js'
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

export function ChatBridgeApp() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { messages, isStreaming, streamingText, sendMessage, addToolResult, continueAfterToolCalls } = useChat()
  const { apps, iframeRefs, launchApp, getActiveApp } = useIframeApps()
  const { state: toolState, currentToolCall, handleToolCall, resolveToolCall } = useToolExecution()

  const [availableApps, setAvailableApps] = useState<AvailableApp[]>([])
  const [input, setInput] = useState('')
  const [iframeHeights, setIframeHeights] = useState<Map<string, number>>(new Map())
  const [safetyOverlay, setSafetyOverlay] = useState<{ visible: boolean; hardBlock: boolean }>({ visible: false, hardBlock: false })

  const isSendingRef = useRef(false)
  const brokerRef = useRef<PostMessageBroker | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    fetchApps(getToken).then(setAvailableApps).catch(console.error)

    const broker = new PostMessageBroker([window.location.origin])
    brokerRef.current = broker

    // tool.result is handled in the wildcard handler below (needs requestId from envelope)

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

    // State persistence + tool.result with requestId routing
    const MAX_SAVE_SIZE = 512 * 1024 // 512KB per app
    broker.on('*', (envelope: unknown) => {
      const msg = envelope as { type?: string; source?: string; payload?: unknown; requestId?: string } | null

      // Route tool.result — use requestId for correct concurrent resolution
      if (msg?.type === 'tool.result') {
        resolveToolCall(msg.payload, msg.requestId)
        return
      }

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
          resolveToolCall({ error: lastError }, toolId)
        }
      }
    }

    console.warn('[ChatBridge] App timeout:', targetApp.id)
    resolveToolCall({ error: lastError }, toolId)
    return { error: lastError }
  }, [handleToolCall, resolveToolCall, iframeRefs])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || isSendingRef.current) return
    isSendingRef.current = true
    setInput('')

    let result: any = null
    try {
    if (!isLoaded || !isSignedIn) {
      console.error('[ChatBridge] Auth not ready — isLoaded:', isLoaded, 'isSignedIn:', isSignedIn)
      return
    }
    const activeApp = getActiveApp()

    result = await sendMessage(trimmed, {
      activeAppId: activeApp?.id ?? null,
      getToken,
    })
    if (!result || result.type !== 'tool_calls') return

    let justLaunchedAppId: string | null = null

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
          justLaunchedAppId = appId
          // Set taller default height for DOS arcade (50% viewport)
          if (appId === 'dos') {
            setIframeHeights(prev => new Map(prev).set(appId, Math.round(window.innerHeight * 0.5)))
          }
          // Wait for app.ready from the correct iframe before sending task.launch
          let launched = false
          const readyTimeout = setTimeout(() => {
            launchWhenReady(appId)
          }, 3000)
          const readyHandler = (event: MessageEvent) => {
            if (event.data?.schema !== 'CHATBRIDGE_V1' || event.data?.type !== 'app.ready') return
            // Verify the ready signal came from this app's iframe
            const expectedIframe = iframeRefs.current.get(appId)
            if (expectedIframe && event.source === expectedIframe.contentWindow) {
              clearTimeout(readyTimeout)
              launchWhenReady(appId)
            }
          }
          window.addEventListener('message', readyHandler)

          function launchWhenReady(id: string) {
            if (launched) return
            launched = true
            window.removeEventListener('message', readyHandler)
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
          const spotifyTarget = (justLaunchedAppId ? { id: justLaunchedAppId } : null)
            || activeApp
          if (spotifyTarget) {
            if (justLaunchedAppId && !iframeRefs.current.get(spotifyTarget.id)) {
              await new Promise(r => setTimeout(r, 1500))
            }
            const result = await dispatchToolToApp(id, name, parseArgs(), spotifyTarget)
            addToolResult(id, JSON.stringify(result))
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }

        default: {
          // Prefer just-launched app (stale getActiveApp may still point to previous app)
          const targetApp = (justLaunchedAppId ? { id: justLaunchedAppId } : null)
            || getActiveApp()
          if (targetApp) {
            // Wait briefly for iframe to be ready if just launched
            if (justLaunchedAppId && !iframeRefs.current.get(targetApp.id)) {
              await new Promise(r => setTimeout(r, 1500))
            }
            const result = await dispatchToolToApp(id, name, parseArgs(), targetApp)
            addToolResult(id, JSON.stringify(result))
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }
      }
    }

    // Send tool results back to LLM — loop handles chained tool calls
    const MAX_CHAIN_DEPTH = 5
    let chainResult = await continueAfterToolCalls({
      activeAppId: activeApp?.id ?? justLaunchedAppId ?? null,
      getToken,
    })

    for (let depth = 0; depth < MAX_CHAIN_DEPTH && chainResult?.type === 'tool_calls'; depth++) {
      const chainedActiveApp = getActiveApp()
        || (justLaunchedAppId ? { id: justLaunchedAppId } : null)
      for (const tc of chainResult.toolCalls) {
        const chainId: string = tc.id ?? ''
        const chainName: string = tc.name ?? ''
        const chainArgs = (() => { try { return JSON.parse(tc.arguments ?? '{}') } catch { return {} } })()
        if (chainedActiveApp) {
          if (justLaunchedAppId && !iframeRefs.current.get(chainedActiveApp.id)) {
            await new Promise(r => setTimeout(r, 1500))
          }
          const dispatchResult = await dispatchToolToApp(chainId, chainName, chainArgs, chainedActiveApp)
          addToolResult(chainId, JSON.stringify(dispatchResult))
        } else {
          addToolResult(chainId, JSON.stringify({ error: 'No active app for: ' + chainName }))
        }
      }
      chainResult = await continueAfterToolCalls({ activeAppId: chainedActiveApp?.id ?? null, getToken })
    }
    } catch (err) {
      console.error('[ChatBridge] handleSend error:', err)
      if (result?.type === 'tool_calls') {
        for (const tc of result.toolCalls) {
          addToolResult(tc.id ?? '', JSON.stringify({ error: 'Tool execution failed' }))
        }
      }
    } finally {
      isSendingRef.current = false
    }
  }, [input, isStreaming, isLoaded, isSignedIn, getToken, sendMessage, availableApps, launchApp, addToolResult, getActiveApp, iframeRefs, handleToolCall, dispatchToolToApp, continueAfterToolCalls])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const isToolExecuting = toolState === 'tool_call_detected' || toolState === 'tool_executing'

  const hasActiveApp = Array.from(apps.values()).some((app) => app.status === 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', overflow: 'hidden', backgroundColor: '#16161e' }}>
      {/* Chat panel — always 35% left side */}
      <div style={{
        flex: '0 0 35%',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
        backgroundColor: '#16161e',
      }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0,
        }}>
          {/* Spacer pushes messages to bottom when few */}
          <div style={{ flexGrow: 1 }} />
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

      {/* App panel — always visible, 65% right side */}
      <div style={{
        flex: '1 1 65%',
        borderLeft: '2px solid #2d2d3d',
        backgroundColor: '#1a1a2e',
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '100%',
        minWidth: 0,
        ...(hasActiveApp ? {} : { display: 'flex', alignItems: 'center', justifyContent: 'center' }),
      }}>
        {hasActiveApp ? (
          <>
            {Array.from(apps.values())
              .filter((app) => app.status !== 'serialized')
              .map((app) => (
                <IframeManager
                  key={app.id}
                  appId={app.id}
                  iframeUrl={app.iframeUrl}
                  isActive={app.status === 'active'}
                  height={iframeHeights.get(app.id)}
                  sandbox={app.id === 'spotify'
                    ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
                    : 'allow-scripts'}
                  onRef={(el) => {
                    if (el) iframeRefs.current.set(app.id, el)
                    else iframeRefs.current.delete(app.id)
                  }}
                />
              ))}
            <SafetyOverlay visible={safetyOverlay.visible} hardBlock={safetyOverlay.hardBlock} />
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#555', padding: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>🎓</div>
            <div style={{ fontSize: '15px', color: '#7a7a8a' }}>Ask the chatbot to open an app</div>
            <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
              Try: "Show me animals in the forest" or "Let's play chess"
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
