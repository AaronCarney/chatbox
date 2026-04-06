const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: any[]
  activeAppId?: string | null
}

export interface StreamChunk {
  [key: string]: any
}

export interface StreamOptions {
  tools?: any[]
  activeAppId?: string | null
  getToken?: () => Promise<string | null>
}

/**
 * Stream chat responses from the API using Server-Sent Events format.
 * Retries once on 401 with a fresh token.
 */
export async function* streamChat(
  messages: ChatMessage[],
  opts?: StreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const request: ChatRequest = { messages }
  if (opts?.tools) request.tools = opts.tools
  if (opts?.activeAppId) request.activeAppId = opts.activeAppId

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    return fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })
  }

  // First attempt: get token and fetch
  let token = opts?.getToken ? await opts.getToken() : null
  let response = await doFetch(token)

  // Retry once on 401 with a fresh token
  if (response.status === 401 && opts?.getToken) {
    console.warn('[ChatBridge] 401 — retrying with fresh token')
    token = await opts.getToken()
    response = await doFetch(token)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[ChatBridge API]', {
      url: `${API_BASE}/api/chat`,
      status: response.status,
      body: body.slice(0, 500),
    })
    throw new Error(`Chat API error: ${response.status}${body ? ' — ' + body.slice(0, 200) : ''}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Response body is not readable')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            yield JSON.parse(data)
          } catch (err) {
            console.error('Failed to parse SSE chunk:', data, err)
          }
        }
      }
    }

    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.slice(6).trim()
      if (data !== '[DONE]') {
        try { yield JSON.parse(data) } catch {}
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Fetch available apps from the API
 */
export async function fetchApps(getToken?: () => Promise<string | null>): Promise<any[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (getToken) {
    const token = await getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}/api/apps`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Apps API error: ${response.status}${body ? ' — ' + body.slice(0, 200) : ''}`)
  }

  return response.json()
}
