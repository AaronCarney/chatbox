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
    async (content: string, tools?: any[]): Promise<ToolCallResult | void> => {
      const currentMessages = appendMessage({ role: 'user', content })

      setIsStreaming(true)
      setStreamingText('')

      let accumulated = ''
      const toolCallsMap: Record<number, any> = {}

      try {
        for await (const chunk of streamChat(currentMessages, tools)) {
          const delta = chunk?.choices?.[0]?.delta
          const finishReason = chunk?.choices?.[0]?.finish_reason

          if (delta?.content) {
            accumulated += delta.content
            setStreamingText(accumulated)
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsMap[idx]) {
                toolCallsMap[idx] = {
                  ...tc,
                  function: { ...tc.function },
                }
              } else if (tc.function?.arguments) {
                toolCallsMap[idx].function.arguments =
                  (toolCallsMap[idx].function.arguments ?? '') + tc.function.arguments
              }
            }
          }

          if (finishReason === 'tool_calls') {
            const toolCalls = Object.keys(toolCallsMap)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => toolCallsMap[Number(k)])
            return { type: 'tool_calls', toolCalls }
          }
        }

        // Text completion: stream ended or finish_reason 'stop'
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

  return { messages, isStreaming, streamingText, sendMessage, addToolResult }
}
