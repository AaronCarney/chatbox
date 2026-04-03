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

interface AvailableApp {
  id: string
  name: string
  url: string
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
  const { messages, isStreaming, streamingText, sendMessage, addToolResult } = useChat()
  const { apps, iframeRefs, launchApp, getActiveApp } = useIframeApps()
  const { state: toolState, currentToolCall, handleToolCall, resolveToolCall } = useToolExecution()

  const [availableApps, setAvailableApps] = useState<AvailableApp[]>([])
  const [completedActivities, setCompletedActivities] = useState<CompletedActivity[]>([])
  const [input, setInput] = useState('')

  const brokerRef = useRef<PostMessageBroker | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchApps().then(setAvailableApps).catch(console.error)

    const broker = new PostMessageBroker([])
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

    return () => broker.destroy()
  }, [resolveToolCall])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')

    const token = await getToken().catch(() => null)
    const activeApp = getActiveApp()

    const result = await sendMessage(trimmed, {
      tools: [],
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
          const args = parseArgs() as { appId?: string; url?: string }
          const appId = args.appId ?? id
          const app = availableApps.find((a) => a.id === appId)
          launchApp(appId, args.url ?? (app?.url as string) ?? '')
          addToolResult(id, JSON.stringify({ launched: appId }))
          break
        }

        case 'get_available_apps': {
          addToolResult(id, JSON.stringify(availableApps))
          break
        }

        default: {
          const activeApp = getActiveApp()
          if (activeApp && brokerRef.current) {
            const iframe = iframeRefs.current.get(activeApp.id)
            if (iframe) {
              const toolCallPromise = handleToolCall({ id, name })
              brokerRef.current.sendToIframe(iframe, 'tool.invoke', {
                name,
                arguments: parseArgs(),
                requestId: id,
              })
              const toolResult = await toolCallPromise
              addToolResult(id, JSON.stringify(toolResult))
            } else {
              addToolResult(id, JSON.stringify({ error: 'No active iframe ref' }))
            }
          } else {
            addToolResult(id, JSON.stringify({ error: 'No active app' }))
          }
          break
        }
      }
    }
  }, [input, isStreaming, getToken, sendMessage, availableApps, launchApp, addToolResult, getActiveApp, iframeRefs, handleToolCall])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const isToolExecuting = toolState === 'tool_call_detected' || toolState === 'tool_executing'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Iframes — hidden/visible per status */}
      {Array.from(apps.values())
        .filter((app) => app.status !== 'serialized')
        .map((app) => (
          <IframeManager
            key={app.id}
            appId={app.id}
            iframeUrl={app.iframeUrl}
            isActive={app.status === 'active'}
            onRef={(el) => {
              if (el) {
                iframeRefs.current.set(app.id, el)
              } else {
                iframeRefs.current.delete(app.id)
              }
            }}
          />
        ))}

      {/* Scrollable message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.map((msg, i) => {
          if (msg.role === 'tool') return null
          const isUser = msg.role === 'user'
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '70%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: isUser ? '#2563eb' : '#f3f4f6',
                  color: isUser ? '#fff' : '#111',
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
                backgroundColor: '#f3f4f6',
                color: '#111',
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

      {/* Input bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#fff',
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
            border: '1px solid #d1d5db',
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
  )
}
