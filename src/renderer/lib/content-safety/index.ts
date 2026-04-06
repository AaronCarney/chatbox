import type { PostMessageBroker } from '@/components/iframe/PostMessageBroker'
import { requestCapture, dataUrlToImageData, CAPTURE_TIMEOUT } from './capture'
import { SafetyStateMachine, type Action } from './hysteresis'
import { applyBlur, removeBlur, applyHardBlock } from './effects'

const PERIODIC_INTERVAL = 5000
const OPENAI_INTERVAL = 30000

type OnAction = (action: Action, appId: string) => void

function applyAction(action: Action, iframeEl: HTMLIFrameElement) {
  if (action === 'blur') applyBlur(iframeEl)
  else if (action === 'unblur') removeBlur(iframeEl)
  else if (action === 'hard_block') applyHardBlock(iframeEl)
}

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
  let destroyed = false

  // Separate request tracking for NSFWJS vs OpenAI paths
  let nsfwjsRequestId: string | null = null
  let openaiRequestId: string | null = null
  let openaiInFlight = false
  let abortController: AbortController | null = null
  // Store last captured image for OpenAI early-warning (avoids second capture)
  let lastCapturedImage: string | null = null

  worker = new Worker(new URL('./classifier.worker.ts', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'init' })

  worker.onmessage = (event) => {
    const { type, flagged, classes, skipped } = event.data
    if (type !== 'result' || skipped) return

    const action = stateMachine.update({ source: 'nsfwjs', classes })
    const app = getActiveApp()
    if (!app) return

    if (action !== 'none') {
      applyAction(action, app.iframeEl)
      onAction(action, app.id)
    }

    // Trigger OpenAI early-warning — guarded against flooding
    if (flagged && !openaiInFlight && lastCapturedImage) {
      sendToOpenAI(lastCapturedImage)
    }
  }

  // Single capture.response handler — routes to NSFWJS or OpenAI based on requestId
  const captureResponseHandler = (payload: any) => {
    if (!payload?.image) return

    if (payload.requestId === nsfwjsRequestId) {
      nsfwjsRequestId = null
      lastCapturedImage = payload.image
      dataUrlToImageData(payload.image).then((imageData) => {
        worker?.postMessage({ type: 'classify', imageData })
      }).catch(() => {})
    } else if (payload.requestId === openaiRequestId) {
      openaiRequestId = null
      sendToOpenAI(payload.image)
    }
  }
  broker.on('capture.response', captureResponseHandler)

  function triggerCapture() {
    const app = getActiveApp()
    if (!app || destroyed) return
    const reqId = crypto.randomUUID()
    nsfwjsRequestId = reqId
    requestCapture(broker, app.iframeEl, reqId)
    setTimeout(() => {
      if (nsfwjsRequestId === reqId) nsfwjsRequestId = null
    }, CAPTURE_TIMEOUT)
  }

  async function sendToOpenAI(imageDataUrl: string) {
    if (openaiInFlight || destroyed) return
    openaiInFlight = true

    abortController?.abort()
    abortController = new AbortController()

    try {
      const res = await fetch(`${apiUrl}/api/moderate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
        signal: abortController.signal,
      })
      const result = await res.json()
      const action = stateMachine.update({
        source: 'openai',
        categories: result.categories,
        categoryScores: result.categoryScores,
      })
      const app = getActiveApp()
      if (app && action !== 'none') {
        applyAction(action, app.iframeEl)
        onAction(action, app.id)
      }
    } catch {
      // Network failure — fail open, skip this cycle
    } finally {
      openaiInFlight = false
    }
  }

  // Periodic OpenAI moderation — requests a fresh capture then sends to API
  function triggerOpenAICapture() {
    if (openaiInFlight || destroyed) return
    const app = getActiveApp()
    if (!app) return
    const reqId = crypto.randomUUID()
    openaiRequestId = reqId
    requestCapture(broker, app.iframeEl, reqId)
    setTimeout(() => {
      if (openaiRequestId === reqId) openaiRequestId = null
    }, CAPTURE_TIMEOUT)
  }

  periodicTimer = setInterval(triggerCapture, PERIODIC_INTERVAL)
  openaiTimer = setInterval(triggerOpenAICapture, OPENAI_INTERVAL)

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
    broker.off('capture.response', captureResponseHandler)
  }
}
