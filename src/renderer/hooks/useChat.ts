import { useState, useRef, useCallback } from 'react'
import { streamChat } from '../services/api.js'

interface Message {
  role: string
  content: string
  tool_calls?: any[]
  tool_call_id?: string
}

interface ToolCallResult {
  type: 'tool_calls'
  toolCalls: any[]
}

interface StreamOpts {
  tools?: any[]
  activeAppId?: string | null
  getToken?: () => Promise<string | null>
}

/** Shared logic: stream from server, collect text + tool calls */
function processStream(
  stream: AsyncGenerator<any>,
  onToken: (text: string) => void
): Promise<{ accumulated: string; toolCalls: any[] }> {
  return (async () => {
    let accumulated = ''
    const toolCalls: any[] = []

    for await (const chunk of stream) {
      if (chunk?.type === 'token' && chunk.content) {
        accumulated += chunk.content
        onToken(accumulated)
      } else if (chunk?.type === 'tool_call_start' && chunk.toolCall) {
        toolCalls.push(chunk.toolCall)
      } else if (chunk?.type === 'error') {
        throw new Error(chunk.message || 'Server error')
      }
    }
    return { accumulated, toolCalls }
  })()
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const messagesRef = useRef<Message[]>([])

  const appendMessage = useCallback((msg: Message): Message[] => {
    const updated = [...messagesRef.current, msg]
    messagesRef.current = updated
    setMessages(updated)
    return updated
  }, [])

  const sendMessage = useCallback(
    async (content: string, opts?: StreamOpts): Promise<ToolCallResult | void> => {
      setError(null)
      const currentMessages = appendMessage({ role: 'user', content })
      setIsStreaming(true)
      setStreamingText('')

      try {
        const { accumulated, toolCalls } = await processStream(
          streamChat(currentMessages, opts),
          (text) => setStreamingText(text)
        )

        if (toolCalls.length > 0) {
          // Transform to OpenAI format: { id, type: "function", function: { name, arguments } }
          const formatted = toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments || '{}' },
          }))
          appendMessage({ role: 'assistant', content: accumulated || '', tool_calls: formatted })
          return { type: 'tool_calls', toolCalls }
        }

        if (accumulated) {
          appendMessage({ role: 'assistant', content: accumulated })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        appendMessage({ role: 'assistant', content: `Sorry, something went wrong: ${msg}` })
      } finally {
        setIsStreaming(false)
        setStreamingText('')
      }
    },
    [appendMessage]
  )

  const addToolResult = useCallback((toolCallId: string, content: string) => {
    appendMessage({ role: 'tool', content, tool_call_id: toolCallId })
  }, [appendMessage])

  const continueAfterToolCalls = useCallback(
    async (opts?: StreamOpts): Promise<ToolCallResult | void> => {
      setError(null)
      setIsStreaming(true)
      setStreamingText('')

      try {
        const { accumulated, toolCalls } = await processStream(
          streamChat(messagesRef.current, opts),
          (text) => setStreamingText(text)
        )

        if (toolCalls.length > 0) {
          const formatted = toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments || '{}' },
          }))
          appendMessage({ role: 'assistant', content: accumulated || '', tool_calls: formatted })
          return { type: 'tool_calls', toolCalls }
        }

        if (accumulated) {
          appendMessage({ role: 'assistant', content: accumulated })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        appendMessage({ role: 'assistant', content: `Sorry, something went wrong: ${msg}` })
      } finally {
        setIsStreaming(false)
        setStreamingText('')
      }
    },
    [appendMessage]
  )

  return { messages, isStreaming, streamingText, error, sendMessage, addToolResult, continueAfterToolCalls }
}
