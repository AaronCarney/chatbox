/**
 * ChatBridge SDK
 * postMessage API for iframe-based applications
 * IIFE that exposes window.ChatBridge
 */
(function() {
  const SCHEMA = 'CHATBRIDGE_V1'
  const VERSION = '1.0'

  // Internal state
  let appId = null
  let completionPort = null
  const handlers = {}

  /**
   * Create an envelope for postMessage
   * @param {string} type - Message type (e.g., 'app.state', 'tool.invoke')
   * @param {object} payload - Message payload
   * @param {object} extra - Additional fields to include in the envelope
   * @returns {object} Envelope object
   */
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

  /**
   * Convert wire protocol dot-notation to camelCase handler name
   * e.g., 'tool.invoke' -> 'toolInvoke', 'task.launch' -> 'launch'
   * Special case: 'task.launch' -> 'launch' (drop the 'task.' prefix)
   * @param {string} wireType - Wire protocol type (e.g., 'task.launch')
   * @returns {string} Handler name in camelCase
   */
  function wireToHandlerName(wireType) {
    // Special mapping for task.launch -> launch
    if (wireType === 'task.launch') {
      return 'launch'
    }

    const parts = wireType.split('.')
    if (parts.length === 1) {
      return parts[0]
    }

    // Convert to camelCase: tool.invoke -> toolInvoke
    return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  }

  /**
   * Handle incoming messages from parent
   */
  window.addEventListener('message', (event) => {
    const { data, ports } = event

    if (!data || !data.type) {
      return
    }

    // Handle task.launch: extract port[0] as completionPort and appId from payload
    if (data.type === 'task.launch') {
      if (ports && ports.length > 0) {
        completionPort = ports[0]
      }
      if (data.payload && data.payload.appId) {
        appId = data.payload.appId
      }

      // Call registered 'launch' handler
      const handlerName = wireToHandlerName('task.launch')
      if (handlers[handlerName]) {
        handlers[handlerName](data.payload)
      }
      return
    }

    // Handle tool.invoke: extract requestId from message, call 'toolInvoke' handler
    if (data.type === 'tool.invoke') {
      const requestId = data.requestId || data.payload?.requestId
      const handlerName = wireToHandlerName('tool.invoke')
      if (handlers[handlerName]) {
        handlers[handlerName](data.payload, requestId)
      }
      return
    }

    // Handle other message types by mapping to camelCase handler
    const handlerName = wireToHandlerName(data.type)
    if (handlers[handlerName]) {
      handlers[handlerName](data.payload, data.requestId)
    }
  })

  /**
   * Public API
   */
  window.ChatBridge = {
    /**
     * Register a handler for an event
     * @param {string} event - Event name in camelCase (e.g., 'launch', 'toolInvoke')
     * @param {function} handler - Handler function
     */
    on(event, handler) {
      handlers[event] = handler
    },

    /**
     * Send app state to parent
     * @param {object} state - State object
     */
    sendState(state) {
      const envelope = createEnvelope('app.state', state)
      window.parent.postMessage(envelope, '*')
    },

    /**
     * Signal task completion
     * @param {string} status - Completion status (e.g., 'success', 'error', 'completed')
     * @param {object} payload - Result payload
     * @param {string} [requestId] - Optional request ID for game-over signals (omit for simple completion)
     */
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

    /**
     * Respond to a tool invocation
     * @param {string} requestId - Request ID from the tool.invoke message
     * @param {object} result - Tool result
     */
    respondToTool(requestId, result) {
      const envelope = createEnvelope('tool.result', result, { requestId })
      window.parent.postMessage(envelope, '*')
    },

    /**
     * Signal iframe resize
     * @param {number} height - New height in pixels
     */
    resize(height) {
      const envelope = createEnvelope('app.resize', { height })
      window.parent.postMessage(envelope, '*')
    },
  }
})()
