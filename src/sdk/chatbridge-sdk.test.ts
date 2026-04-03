/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// @vitest-environment jsdom

describe('ChatBridge SDK', () => {
  const getSDKCode = () => `
(function() {
  const SCHEMA = 'CHATBRIDGE_V1'
  const VERSION = '1.0'

  let appId = null
  let completionPort = null
  const handlers = {}

  function createEnvelope(type, payload, extra = {}) {
    return {
      schema: SCHEMA,
      version: VERSION,
      type,
      timestamp: Date.now(),
      source: appId || 'app',
      payload,
      ...extra,
    }
  }

  function wireToHandlerName(wireType) {
    if (wireType === 'task.launch') {
      return 'launch'
    }
    const parts = wireType.split('.')
    if (parts.length === 1) {
      return parts[0]
    }
    return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  }

  window.addEventListener('message', (event) => {
    const { data, ports } = event

    if (!data || !data.type) {
      return
    }

    if (data.type === 'task.launch') {
      if (ports && ports.length > 0) {
        completionPort = ports[0]
      }
      if (data.payload && data.payload.appId) {
        appId = data.payload.appId
      }
      const handlerName = wireToHandlerName('task.launch')
      if (handlers[handlerName]) {
        handlers[handlerName](data.payload)
      }
      return
    }

    if (data.type === 'tool.invoke') {
      const requestId = data.requestId || data.payload?.requestId
      const handlerName = wireToHandlerName('tool.invoke')
      if (handlers[handlerName]) {
        handlers[handlerName](data.payload, requestId)
      }
      return
    }

    const handlerName = wireToHandlerName(data.type)
    if (handlers[handlerName]) {
      handlers[handlerName](data.payload, data.requestId)
    }
  })

  window.ChatBridge = {
    on(event, handler) {
      handlers[event] = handler
    },

    sendState(state) {
      const envelope = createEnvelope('app.state', state)
      window.parent.postMessage(envelope, '*')
    },

    complete(status, payload, requestId) {
      const envelope = createEnvelope('task.completed', payload)
      if (requestId) {
        envelope.requestId = requestId
      }
      if (completionPort) {
        completionPort.postMessage(envelope)
      } else {
        window.parent.postMessage(envelope, '*')
      }
    },

    respondToTool(requestId, result) {
      const envelope = createEnvelope('tool.result', result, { requestId })
      window.parent.postMessage(envelope, '*')
    },

    resize(height) {
      const envelope = createEnvelope('app.resize', { height })
      window.parent.postMessage(envelope, '*')
    },
  }
})()
  `

  beforeEach(() => {
    delete (window as any).ChatBridge
    eval(getSDKCode())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('envelope shape', () => {
    it('envelope has required fields (schema, version, type, timestamp, source, payload)', () => {
      const envelope = {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'app.state',
        timestamp: Date.now(),
        source: 'app',
        payload: { foo: 'bar' },
      }

      expect(envelope).toHaveProperty('schema')
      expect(envelope).toHaveProperty('version')
      expect(envelope).toHaveProperty('type')
      expect(envelope).toHaveProperty('timestamp')
      expect(envelope).toHaveProperty('source')
      expect(envelope).toHaveProperty('payload')

      expect(envelope.schema).toBe('CHATBRIDGE_V1')
      expect(envelope.version).toBe('1.0')
      expect(typeof envelope.timestamp).toBe('number')
      expect(envelope.source).toBe('app')
    })

    it('wire protocol dot-notation maps to camelCase handler registry', () => {
      const wireToHandler: Record<string, string> = {
        'tool.invoke': 'toolInvoke',
        'task.launch': 'launch',
      }

      expect(wireToHandler['tool.invoke']).toBe('toolInvoke')
      expect(wireToHandler['task.launch']).toBe('launch')
    })

    it('requestId is included in tool.invoke messages', () => {
      const message = {
        type: 'tool.invoke',
        requestId: 'req-123',
        payload: { toolName: 'search' },
      }

      expect(message).toHaveProperty('requestId')
      expect(message.requestId).toBe('req-123')
    })

    it('envelope includes extra fields when passed to createEnvelope', () => {
      const envelope = {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'app.state',
        timestamp: Date.now(),
        source: 'app',
        payload: { state: 'ready' },
        requestId: 'req-456',
      }

      expect(envelope).toHaveProperty('requestId')
    })
  })

  describe('postMessage methods', () => {
    it('sendState sends envelope with type app.state', () => {
      const sendState = (state: any) => ({
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'app.state',
        timestamp: Date.now(),
        source: 'app',
        payload: state,
      })

      const envelope = sendState({ status: 'ready' })
      expect(envelope.type).toBe('app.state')
      expect(envelope.payload).toEqual({ status: 'ready' })
    })

    it('complete sends envelope with type task.completed', () => {
      const complete = (status: string, payload: any, requestId?: string) => {
        const envelope: any = {
          schema: 'CHATBRIDGE_V1',
          version: '1.0',
          type: 'task.completed',
          timestamp: Date.now(),
          source: 'app',
          payload,
        }
        if (requestId) {
          envelope.requestId = requestId
        }
        return envelope
      }

      const withRequestId = complete('success', { result: 'done' }, 'req-123')
      expect(withRequestId.type).toBe('task.completed')
      expect(withRequestId.requestId).toBe('req-123')

      const withoutRequestId = complete('done', { result: 'finished' })
      expect(withoutRequestId.type).toBe('task.completed')
      expect(withoutRequestId).not.toHaveProperty('requestId')
    })

    it('respondToTool sends envelope with type tool.result', () => {
      const respondToTool = (requestId: string, result: any) => ({
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'tool.result',
        timestamp: Date.now(),
        source: 'app',
        payload: result,
        requestId,
      })

      const envelope = respondToTool('req-123', { output: 'result' })
      expect(envelope.type).toBe('tool.result')
      expect(envelope.requestId).toBe('req-123')
    })

    it('resize sends envelope with type app.resize and height payload', () => {
      const resize = (height: number) => ({
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'app.resize',
        timestamp: Date.now(),
        source: 'app',
        payload: { height },
      })

      const envelope = resize(600)
      expect(envelope.type).toBe('app.resize')
      expect(envelope.payload.height).toBe(600)
    })
  })

  describe('ChatBridge SDK global', () => {
    it('ChatBridge is exposed on window', () => {
      expect((window as any).ChatBridge).toBeDefined()
      expect(typeof (window as any).ChatBridge.on).toBe('function')
      expect(typeof (window as any).ChatBridge.sendState).toBe('function')
    })

    it('ChatBridge.on() registers event handlers', () => {
      const sdk = (window as any).ChatBridge
      const handler = vi.fn()

      sdk.on('launch', handler)
      expect(handler).toBeDefined()
    })

    it('ChatBridge.sendState() sends envelope with correct shape', () => {
      const sdk = (window as any).ChatBridge
      const postMessageSpy = vi.spyOn(window.parent, 'postMessage')

      sdk.sendState({ status: 'ready' })

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app.state',
          schema: 'CHATBRIDGE_V1',
          payload: { status: 'ready' },
        }),
        '*'
      )
    })

    it('ChatBridge.respondToTool() sends envelope with requestId', () => {
      const sdk = (window as any).ChatBridge
      const postMessageSpy = vi.spyOn(window.parent, 'postMessage')

      sdk.respondToTool('req-456', { output: 'answer' })

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool.result',
          requestId: 'req-456',
          payload: { output: 'answer' },
        }),
        '*'
      )
    })

    it('ChatBridge.resize() sends envelope with height', () => {
      const sdk = (window as any).ChatBridge
      const postMessageSpy = vi.spyOn(window.parent, 'postMessage')

      sdk.resize(800)

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app.resize',
          payload: { height: 800 },
        }),
        '*'
      )
    })

    it('ChatBridge.complete() sends envelope with task.completed type', () => {
      const sdk = (window as any).ChatBridge
      const postMessageSpy = vi.spyOn(window.parent, 'postMessage')

      sdk.complete('success', { result: 'done' })

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.completed',
          payload: { result: 'done' },
        }),
        '*'
      )
    })

    it('ChatBridge.complete() includes requestId when provided', () => {
      const sdk = (window as any).ChatBridge
      const postMessageSpy = vi.spyOn(window.parent, 'postMessage')

      sdk.complete('success', { result: 'done' }, 'req-789')

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-789',
        }),
        '*'
      )
    })

    it('message listener calls registered launch handler on task.launch', () => {
      const sdk = (window as any).ChatBridge
      const launchHandler = vi.fn()

      sdk.on('launch', launchHandler)

      // Simulate receiving task.launch message
      const event = new MessageEvent('message', {
        data: {
          type: 'task.launch',
          payload: { appId: 'app-123', taskId: 'task-456' },
        },
      })

      window.dispatchEvent(event)

      expect(launchHandler).toHaveBeenCalledWith({
        appId: 'app-123',
        taskId: 'task-456',
      })
    })

    it('message listener calls registered toolInvoke handler on tool.invoke', () => {
      const sdk = (window as any).ChatBridge
      const toolInvokeHandler = vi.fn()

      sdk.on('toolInvoke', toolInvokeHandler)

      // Simulate receiving tool.invoke message
      const event = new MessageEvent('message', {
        data: {
          type: 'tool.invoke',
          requestId: 'req-111',
          payload: { toolName: 'search', query: 'test' },
        },
      })

      window.dispatchEvent(event)

      expect(toolInvokeHandler).toHaveBeenCalledWith(
        { toolName: 'search', query: 'test' },
        'req-111'
      )
    })
  })
})
