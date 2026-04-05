import type { PostMessageBroker } from '@/components/iframe/PostMessageBroker'
import { requestCapture, dataUrlToImageData, CAPTURE_TIMEOUT } from './capture'
import { SafetyStateMachine, type Action } from './hysteresis'
import { applyBlur, removeBlur, applyHardBlock } from './effects'

const PERIODIC_INTERVAL = 5000
const OPENAI_INTERVAL = 30000

type OnAction = (action: Action, appId: string) => void

export function startMonitoring(
  getActiveApp: () => { id: string; iframeEl: HTMLIFrameElement } | null,
  broker: PostMessageBroker,
  apiUrl: string,
  onAction: OnAction
): () => void {
  const stateMachine = new SafetyStateMachine()
  let worker: Worker | null = null
  let periodicTimer: ReturnType<typeof setInterval> | null = null
  let openaiTimer: ReturnType<typeof setInterval> | null = null
  let pendingRequestId: string | null = null
  let abortController: AbortController | null = null
  let destroyed = false

  // Init worker
  worker = new Worker(new URL('./classifier.worker.ts', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'init' })

  worker.onmessage = (event) => {
    const { type, flagged, classes, skipped } = event.data
    if (type !== 'result' || skipped) return

    const action = stateMachine.update({ source: 'nsfwjs', classes })
    const app = getActiveApp()
    if (!app) return

    if (action !== 'none') {
      onAction(action, app.id)
      if (action === 'blur') applyBlur(app.iframeEl)
      else if (action === 'unblur') removeBlur(app.iframeEl)
    }

    // Trigger OpenAI if NSFWJS early warning
    if (flagged) sendToOpenAI()
  }

  // Listen for capture responses
  broker.on('capture.response', (payload: any) => {
    if (!payload?.image || payload.requestId !== pendingRequestId) return
    pendingRequestId = null
    dataUrlToImageData(payload.image).then((imageData) => {
      worker?.postMessage({ type: 'classify', imageData })
    }).catch(() => {})
  })

  function triggerCapture() {
    const app = getActiveApp()
    if (!app || destroyed) return
    const reqId = crypto.randomUUID()
    pendingRequestId = reqId
    requestCapture(broker, app.iframeEl, reqId)
    setTimeout(() => {
      if (pendingRequestId === reqId) pendingRequestId = null
    }, CAPTURE_TIMEOUT)
  }

  async function sendToOpenAI() {
    const app = getActiveApp()
    if (!app || destroyed) return

    const reqId = crypto.randomUUID()
    pendingRequestId = reqId
    requestCapture(broker, app.iframeEl, reqId)

    const captureHandler = async (payload: any) => {
      if (payload?.requestId !== reqId || !payload?.image) return

      abortController?.abort()
      abortController = new AbortController()

      try {
        const res = await fetch(`${apiUrl}/api/moderate-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: payload.image }),
          signal: abortController.signal,
        })
        const result = await res.json()
        const action = stateMachine.update({
          source: 'openai',
          categories: result.categories,
          categoryScores: result.categoryScores,
        })
        if (action === 'hard_block') {
          applyHardBlock(app.iframeEl)
          onAction('hard_block', app.id)
        } else if (action === 'blur') {
          applyBlur(app.iframeEl)
          onAction('blur', app.id)
        }
      } catch {
        // Network failure — fail open, skip this cycle
      }
    }
    broker.on('capture.response', captureHandler)
  }

  // Periodic capture every 5s
  periodicTimer = setInterval(triggerCapture, PERIODIC_INTERVAL)

  // Periodic OpenAI moderation every 30s
  openaiTimer = setInterval(() => sendToOpenAI(), OPENAI_INTERVAL)

  // Event-driven triggers
  const eventTypes = ['tool.result', 'task.completed', 'app.state']
  for (const type of eventTypes) {
    broker.on(type, () => triggerCapture())
  }

  return () => {
    destroyed = true
    if (periodicTimer) clearInterval(periodicTimer)
    if (openaiTimer) clearInterval(openaiTimer)
    abortController?.abort()
    worker?.terminate()
  }
}
