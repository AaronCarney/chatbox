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

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')

  // Ref tracks current messages to avoid stale closures in async callbacks
  const messagesRef = useRef<Message[]>([])

  const appendMessage = useCallback((msg: Message): Message[] => {
    const updated = [...messagesRef.current, msg]
    messagesRef.current = updated
    setMessages(updated)
    return updated
  }, [])

  const sendMessage = useCallback(
    async (
      content: string,
      opts?: { tools?: any[]; activeAppId?: string | null; authToken?: string | null }
    ): Promise<ToolCallResult | void> => {
      const currentMessages = appendMessage({ role: 'user', content })

      setIsStreaming(true)
      setStreamingText('')

      let accumulated = ''
      const toolCalls: any[] = []

      try {
        for await (const chunk of streamChat(currentMessages, opts)) {
          if (chunk?.type === 'token' && chunk.content) {
            accumulated += chunk.content
            setStreamingText(accumulated)
          } else if (chunk?.type === 'tool_call_start' && chunk.toolCall) {
            toolCalls.push(chunk.toolCall)
          }
        }

        if (toolCalls.length > 0) {
          return { type: 'tool_calls', toolCalls }
        }

        if (accumulated) {
          appendMessage({ role: 'assistant', content: accumulated })
        }
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
    async (opts?: { activeAppId?: string | null; authToken?: string | null }) => {
      setIsStreaming(true)
      setStreamingText('')
      let accumulated = ''
      const toolCalls: any[] = []

      try {
        for await (const chunk of streamChat(messagesRef.current, opts)) {
          if (chunk?.type === 'token' && chunk.content) {
            accumulated += chunk.content
            setStreamingText(accumulated)
          } else if (chunk?.type === 'tool_call_start' && chunk.toolCall) {
            toolCalls.push(chunk.toolCall)
          }
        }

        if (toolCalls.length > 0) {
          return { type: 'tool_calls' as const, toolCalls }
        }

        if (accumulated) {
          appendMessage({ role: 'assistant', content: accumulated })
        }
      } finally {
        setIsStreaming(false)
        setStreamingText('')
      }
    },
    [appendMessage]
  )

  return { messages, isStreaming, streamingText, sendMessage, addToolResult, continueAfterToolCalls }
}
