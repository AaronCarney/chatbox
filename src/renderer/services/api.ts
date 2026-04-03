const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: any[]
}

export interface StreamChunk {
  [key: string]: any
}

/**
 * Stream chat responses from the API using Server-Sent Events format
 */
export async function* streamChat(
  messages: ChatMessage[],
  tools?: any[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const request: ChatRequest = { messages }
  if (tools) {
    request.tools = tools
  }

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status} ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)

          if (data === '[DONE]') {
            return
          }

          try {
            const parsed = JSON.parse(data)
            yield parsed
          } catch (err) {
            console.error('Failed to parse SSE chunk:', data, err)
          }
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.slice(6).trim()
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data)
          yield parsed
        } catch (err) {
          console.error('Failed to parse final SSE chunk:', data, err)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Fetch available apps from the API
 */
export async function fetchApps(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/api/apps`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Apps API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get authorization headers for API requests
 * @param token The auth token from Clerk
 * @returns Headers object with Authorization bearer token
 */
export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  }
}
