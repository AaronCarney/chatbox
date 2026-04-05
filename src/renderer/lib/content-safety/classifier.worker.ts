// src/renderer/lib/content-safety/classifier.worker.ts
import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import * as nsfwjs from 'nsfwjs'

let model: nsfwjs.NSFWJS | null = null
let lastHash: string | null = null

async function init() {
  setWasmPaths('/wasm/')
  await tf.setBackend('wasm')
  await tf.ready()
  model = await nsfwjs.load('/nsfwjs-model/', { size: 224, type: 'graph' })

  // Pre-warm with dummy image
  const dummy = tf.zeros([1, 224, 224, 3]) as tf.Tensor3D
  await model.classify(dummy as any)
  dummy.dispose()

  self.postMessage({ type: 'ready' })
}

async function hashFrame(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function classify(imageData: ImageData, skipDedup: boolean) {
  if (!model) return

  const hash = await hashFrame(imageData.data.buffer)
  if (!skipDedup && hash === lastHash) {
    self.postMessage({ type: 'result', flagged: false, classes: {}, hash, skipped: true })
    return
  }
  lastHash = hash

  // model.classify() is async — cannot use tf.tidy(). Manage tensors manually.
  const tensor = tf.browser.fromPixels({
    data: new Uint8Array(imageData.data.buffer),
    width: imageData.width,
    height: imageData.height,
  })

  let result: nsfwjs.predictionType[]
  try {
    result = await model.classify(tensor as any)
  } finally {
    tensor.dispose()
  }

  const classes: Record<string, number> = {}
  for (const pred of result) {
    classes[pred.className] = pred.probability
  }

  const flagged = (classes.Porn ?? 0) > 0.15 // Early warning threshold for OpenAI trigger
  self.postMessage({ type: 'result', flagged, classes, hash, skipped: false })
}

self.onmessage = async (event) => {
  const { type, imageData, skipDedup } = event.data
  if (type === 'init') await init()
  if (type === 'classify') await classify(imageData, skipDedup ?? false)
}
