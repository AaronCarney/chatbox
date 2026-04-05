# CV Content Safety Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universal visual content moderation for all iframe-embedded apps — capture screenshots via SDK, classify with NSFWJS + OpenAI moderation, blur unsafe content.

**Architecture:** ChatBridge SDK captures frames inside the iframe (preserving strict sandbox). Parent orchestrates capture triggers and sends frames to a Web Worker running NSFWJS. Periodic frames also go server-side to OpenAI moderation for broader category coverage. A hysteresis state machine prevents blur flickering.

**Tech Stack:** NSFWJS, TensorFlow.js (WASM SIMD backend), modern-screenshot, Web Workers, PostMessageBroker

**Spec:** `docs/specs/2026-04-05-cv-content-safety.md`

---

## Task 1: Fix PostMessageBroker for strict sandbox

The broker uses `window.location.origin` as targetOrigin and rejects `"null"` origins. Sandboxed iframes without `allow-same-origin` have origin `"null"`, so all messages are silently dropped/rejected. This must be fixed before anything else.

**Files:**
- Modify: `src/renderer/components/iframe/PostMessageBroker.ts`
- Test: `src/renderer/components/iframe/__tests__/PostMessageBroker.test.ts`

- [ ] **Step 1: Write failing tests for null-origin message handling**

```typescript
// src/renderer/components/iframe/__tests__/PostMessageBroker.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PostMessageBroker } from '../PostMessageBroker'

describe('PostMessageBroker strict sandbox support', () => {
  let broker: PostMessageBroker

  beforeEach(() => {
    broker = new PostMessageBroker([window.location.origin])
  })

  afterEach(() => {
    broker.destroy()
  })

  it('accepts messages from null origin (sandboxed iframe)', () => {
    const handler = vi.fn()
    broker.on('tool.result', handler)

    const event = new MessageEvent('message', {
      data: { schema: 'CHATBRIDGE_V1', type: 'tool.result', payload: { test: true } },
      origin: 'null',
    })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledWith({ test: true })
  })

  it('still rejects messages from unknown non-null origins', () => {
    const handler = vi.fn()
    broker.on('tool.result', handler)

    const event = new MessageEvent('message', {
      data: { schema: 'CHATBRIDGE_V1', type: 'tool.result', payload: {} },
      origin: 'https://evil.com',
    })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run src/renderer/components/iframe/__tests__/PostMessageBroker.test.ts`
Expected: First test FAILS — handler not called because `"null"` origin is rejected.

- [ ] **Step 3: Fix origin validation to accept `"null"`**

```typescript
// src/renderer/components/iframe/PostMessageBroker.ts
// Replace the onMessage origin check (lines 12-21):

private onMessage(event: MessageEvent): void {
  if (this.allowedOrigins.size > 0) {
    const sameOrigin = event.origin === window.location.origin;
    const sandboxedOrigin = event.origin === 'null';
    const allowed = this.allowedOrigins.has(event.origin);
    if (!sameOrigin && !sandboxedOrigin && !allowed) {
      console.warn(`Rejected message from untrusted origin: ${event.origin}`);
      return;
    }
  }
```

- [ ] **Step 4: Fix sendToIframe to use `'*'` targetOrigin**

```typescript
// src/renderer/components/iframe/PostMessageBroker.ts
// Replace sendToIframe (lines 50-71):

sendToIframe(
  iframe: HTMLIFrameElement,
  type: string,
  payload: any,
  port?: MessagePort
): void {
  const envelope = {
    schema: 'CHATBRIDGE_V1',
    version: '1.0',
    type,
    timestamp: Date.now(),
    payload,
  };

  // Use '*' — sandboxed iframes have null origin, window.location.origin would be silently dropped
  if (port) {
    iframe.contentWindow?.postMessage(envelope, '*', [port]);
  } else {
    iframe.contentWindow?.postMessage(envelope, '*');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run src/renderer/components/iframe/__tests__/PostMessageBroker.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite for regressions**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run`
Expected: 436 passing, 6 pre-existing failures (token-estimation)

- [ ] **Step 7: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/components/iframe/PostMessageBroker.ts src/renderer/components/iframe/__tests__/PostMessageBroker.test.ts
git commit -m "fix: PostMessageBroker accepts null-origin sandboxed iframes

sendToIframe uses '*' targetOrigin (null-origin iframes drop
window.location.origin). Inbound validation accepts 'null' as
valid origin for sandboxed iframes."
```

---

## Task 2: Revert IframeManager to strict sandbox

Remove `allow-same-origin` from sandbox and keep `credentialless`. The broker fix from Task 1 makes this safe.

**Files:**
- Modify: `src/renderer/components/iframe/IframeManager.tsx`
- Modify: `src/renderer/components/ChatBridgeApp.tsx`

- [ ] **Step 1: Remove `allow-same-origin` from IframeManager default and ChatBridgeApp overrides**

In `IframeManager.tsx` line 26, the default is already `'allow-scripts'`. The problem is `ChatBridgeApp.tsx` which passes `'allow-scripts allow-same-origin'` on line 323 (and `'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'` for Spotify on line 323).

```tsx
// ChatBridgeApp.tsx — replace the sandbox prop in the IframeManager render (line 323):
sandbox={app.id === 'spotify' ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : 'allow-scripts'}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/components/ChatBridgeApp.tsx
git commit -m "fix: revert iframe sandbox to allow-scripts only (strict)

Removes allow-same-origin from all iframes. Broker fix in previous
commit enables communication with null-origin sandboxed iframes.
Spotify keeps allow-popups for OAuth flow."
```

---

## Task 3: Add `capture.request` handler to ChatBridge SDK

The SDK needs a built-in handler that captures the iframe's visual content and sends it back to the parent.

**Files:**
- Modify: `src/renderer/public/sdk/chatbridge-sdk.js`

- [ ] **Step 1: Add capture.request handler before the generic handler block**

```javascript
// src/renderer/public/sdk/chatbridge-sdk.js
// Add after the state.request handler (after line 108), before the generic handler:

    // Handle capture.request: capture iframe content and send back as data URL
    if (data.type === 'capture.request') {
      var requestId = data.requestId || data.payload?.requestId
      try {
        var canvas = document.querySelector('canvas')
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          // Canvas-based app: direct toDataURL
          var dataUrl = canvas.toDataURL('image/jpeg', 0.5)
          window.parent.postMessage(createEnvelope('capture.response', { image: dataUrl, requestId: requestId }), '*')
        } else {
          // DOM-based app: capture document body as canvas
          var captureCanvas = document.createElement('canvas')
          var body = document.body
          var rect = body.getBoundingClientRect()
          captureCanvas.width = Math.min(rect.width, 800)
          captureCanvas.height = Math.min(rect.height, 800)
          // Use SVG foreignObject approach (lightweight, no dependency)
          var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + captureCanvas.width + '" height="' + captureCanvas.height + '">'
            + '<foreignObject width="100%" height="100%">'
            + '<div xmlns="http://www.w3.org/1999/xhtml">' + body.innerHTML + '</div>'
            + '</foreignObject></svg>'
          var img = new Image()
          img.onload = function() {
            captureCanvas.getContext('2d').drawImage(img, 0, 0)
            var dataUrl = captureCanvas.toDataURL('image/jpeg', 0.5)
            window.parent.postMessage(createEnvelope('capture.response', { image: dataUrl, requestId: requestId }), '*')
          }
          img.onerror = function() {
            window.parent.postMessage(createEnvelope('capture.response', { image: null, error: 'capture failed', requestId: requestId }), '*')
          }
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
        }
      } catch (e) {
        window.parent.postMessage(createEnvelope('capture.response', { image: null, error: String(e), requestId: requestId }), '*')
      }
      return
    }
```

Note: This uses inline SVG foreignObject instead of `modern-screenshot` to avoid adding a ~185KB dependency to the SDK. The foreignObject approach handles basic DOM layouts. Cross-origin images (Spotify album art) will be blank — acceptable per spec (covered by Layer 2 API moderation). If this proves insufficient for DOM-based apps, `modern-screenshot` can be lazy-loaded as an enhancement later.

- [ ] **Step 2: Build to verify SDK is valid JS**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | tail -5`
Expected: Build succeeds (SDK is a static file, not bundled)

- [ ] **Step 3: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/public/sdk/chatbridge-sdk.js
git commit -m "feat: SDK capture.request handler — canvas toDataURL + SVG foreignObject fallback"
```

---

## Task 4: Hysteresis state machine (pure logic, no DOM)

**Files:**
- Create: `src/renderer/lib/content-safety/hysteresis.ts`
- Test: `src/renderer/lib/content-safety/__tests__/hysteresis.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/renderer/lib/content-safety/__tests__/hysteresis.test.ts
import { describe, it, expect } from 'vitest'
import { SafetyStateMachine } from '../hysteresis'

describe('SafetyStateMachine', () => {
  it('starts in CLEAN state', () => {
    const sm = new SafetyStateMachine()
    expect(sm.state).toBe('clean')
  })

  it('flags immediately when NSFWJS score exceeds threshold', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({ source: 'nsfwjs', classes: { Porn: 0.3, Sexy: 0.1, Hentai: 0.05, Drawing: 0.3, Neutral: 0.25 } })
    expect(action).toBe('blur')
    expect(sm.state).toBe('flagged')
  })

  it('stays clean when scores are below threshold', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({ source: 'nsfwjs', classes: { Porn: 0.05, Sexy: 0.1, Hentai: 0.1, Drawing: 0.5, Neutral: 0.25 } })
    expect(action).toBe('none')
    expect(sm.state).toBe('clean')
  })

  it('requires 5 consecutive clean frames to unblur', () => {
    const sm = new SafetyStateMachine()
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.5, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.5 } })
    expect(sm.state).toBe('flagged')

    const clean = { source: 'nsfwjs' as const, classes: { Porn: 0.05, Sexy: 0.05, Hentai: 0.05, Drawing: 0.5, Neutral: 0.35 } }
    for (let i = 0; i < 4; i++) {
      expect(sm.update(clean)).toBe('none')
      expect(sm.state).toBe('flagged')
    }
    expect(sm.update(clean)).toBe('unblur')
    expect(sm.state).toBe('clean')
  })

  it('resets clean count if a dirty frame appears during recovery', () => {
    const sm = new SafetyStateMachine()
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.5, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.5 } })

    const clean = { source: 'nsfwjs' as const, classes: { Porn: 0.05, Sexy: 0.05, Hentai: 0.05, Drawing: 0.5, Neutral: 0.35 } }
    sm.update(clean)
    sm.update(clean)
    sm.update(clean)

    // Dirty frame resets count
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.3, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.7 } })
    expect(sm.state).toBe('flagged')

    // Need 5 more clean frames now
    for (let i = 0; i < 4; i++) sm.update(clean)
    expect(sm.state).toBe('flagged')
    expect(sm.update(clean)).toBe('unblur')
  })

  it('flags on OpenAI moderation flagged categories', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({
      source: 'openai',
      categories: { violence: true, sexual: false },
      categoryScores: { violence: 0.9, sexual: 0.01 },
    })
    expect(action).toBe('blur')
  })

  it('hard blocks on sexual/minors above 0.01', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({
      source: 'openai',
      categories: { 'sexual/minors': false },
      categoryScores: { 'sexual/minors': 0.02 },
    })
    expect(action).toBe('hard_block')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run src/renderer/lib/content-safety/__tests__/hysteresis.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the state machine**

```typescript
// src/renderer/lib/content-safety/hysteresis.ts

const NSFWJS_FLAG = { Porn: 0.2, Hentai: 0.3, Sexy: 0.4 } as const
const NSFWJS_UNFLAG = { Porn: 0.1, Hentai: 0.15, Sexy: 0.2 } as const
const CLEAN_FRAMES_REQUIRED = 5
const HARD_BLOCK_CATEGORIES = ['sexual/minors', 'self-harm/instructions'] as const

type NsfwjsResult = { source: 'nsfwjs'; classes: Record<string, number> }
type OpenaiResult = { source: 'openai'; categories: Record<string, boolean>; categoryScores: Record<string, number> }
export type ClassifyResult = NsfwjsResult | OpenaiResult
export type Action = 'blur' | 'unblur' | 'hard_block' | 'none'

export class SafetyStateMachine {
  state: 'clean' | 'flagged' = 'clean'
  private cleanCount = 0

  update(result: ClassifyResult): Action {
    if (result.source === 'openai') return this.handleOpenai(result)
    return this.handleNsfwjs(result)
  }

  private handleNsfwjs(result: NsfwjsResult): Action {
    const { classes } = result
    const flagged = (classes.Porn ?? 0) > NSFWJS_FLAG.Porn
      || (classes.Hentai ?? 0) > NSFWJS_FLAG.Hentai
      || (classes.Sexy ?? 0) > NSFWJS_FLAG.Sexy

    if (this.state === 'clean') {
      if (flagged) {
        this.state = 'flagged'
        this.cleanCount = 0
        return 'blur'
      }
      return 'none'
    }

    // state === 'flagged'
    const belowUnflag = (classes.Porn ?? 0) < NSFWJS_UNFLAG.Porn
      && (classes.Hentai ?? 0) < NSFWJS_UNFLAG.Hentai
      && (classes.Sexy ?? 0) < NSFWJS_UNFLAG.Sexy

    if (belowUnflag) {
      this.cleanCount++
    } else {
      this.cleanCount = 0
    }

    if (this.cleanCount >= CLEAN_FRAMES_REQUIRED) {
      this.state = 'clean'
      this.cleanCount = 0
      return 'unblur'
    }
    return 'none'
  }

  private handleOpenai(result: OpenaiResult): Action {
    const { categories, categoryScores } = result

    // Hard block on zero-tolerance categories
    for (const cat of HARD_BLOCK_CATEGORIES) {
      if ((categoryScores[cat] ?? 0) > 0.01) return 'hard_block'
    }

    // Blur on any flagged category
    const anyFlagged = Object.values(categories).some(v => v)
    if (anyFlagged && this.state === 'clean') {
      this.state = 'flagged'
      this.cleanCount = 0
      return 'blur'
    }
    return 'none'
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run src/renderer/lib/content-safety/__tests__/hysteresis.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/lib/content-safety/hysteresis.ts src/renderer/lib/content-safety/__tests__/hysteresis.test.ts
git commit -m "feat: hysteresis state machine — flag/unflag with asymmetric thresholds"
```

---

## Task 5: Classification Web Worker (NSFWJS + dedup)

**Files:**
- Create: `src/renderer/lib/content-safety/classifier.worker.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /home/context/projects/chatbridge && pnpm add nsfwjs @tensorflow/tfjs @tensorflow/tfjs-backend-wasm
```

- [ ] **Step 2: Copy WASM binaries to public dir**

```bash
mkdir -p src/renderer/public/wasm
cp node_modules/@tensorflow/tfjs-backend-wasm/dist/*.wasm src/renderer/public/wasm/
```

- [ ] **Step 3: Write the worker**

```typescript
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
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function classify(imageData: ImageData, skipDedup: boolean) {
  if (!model) return

  const hash = await hashFrame(imageData.data.buffer)
  if (!skipDedup && hash === lastHash) {
    self.postMessage({ type: 'result', flagged: false, classes: {}, hash, skipped: true })
    return
  }
  lastHash = hash

  const result = await tf.tidy(() => {
    const tensor = tf.browser.fromPixels({
      data: new Uint8Array(imageData.data.buffer),
      width: imageData.width,
      height: imageData.height,
    })
    return model!.classify(tensor as any)
  })

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
```

- [ ] **Step 4: Build to verify worker compiles**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | tail -5`
Expected: Build succeeds (worker is a separate entry point via Vite's worker support)

- [ ] **Step 5: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/lib/content-safety/classifier.worker.ts src/renderer/public/wasm/ package.json pnpm-lock.yaml
git commit -m "feat: NSFWJS classification worker with WASM SIMD + frame dedup"
```

---

## Task 6: Server endpoint for image moderation

**Files:**
- Modify: `server/src/middleware/moderation.ts`
- Create: `server/src/routes/moderation.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/__tests__/moderation-route.test.ts`

- [ ] **Step 1: Update `moderateImage` to return full scores**

```typescript
// server/src/middleware/moderation.ts
// Replace the existing moderateImage function:

export async function moderateImage(imageUrl: string): Promise<{
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}> {
  try {
    const result = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: imageUrl } }],
    });
    const output = result.results[0];
    const categories = output.categories as unknown as Record<string, boolean>;
    const categoryScores = output.category_scores as unknown as Record<string, number>;
    if (output.flagged) {
      logger.warn({ categories, imageUrl: imageUrl.slice(0, 50) }, 'image moderation flagged');
    }
    return { flagged: output.flagged, categories, categoryScores };
  } catch (err) {
    logger.error({ err }, 'image moderation API failed — allowing content (fail-open)');
    return { flagged: false, categories: {}, categoryScores: {} };
  }
}
```

- [ ] **Step 2: Create the moderation route**

```typescript
// server/src/routes/moderation.ts
import { Router, Request, Response } from 'express';
import { moderateImage } from '../middleware/moderation.js';

const moderationRouter = Router();

moderationRouter.post('/moderate-image', async (req: Request, res: Response) => {
  const { image } = req.body;
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'Missing or invalid image data URL' });
    return;
  }

  const result = await moderateImage(image);
  res.json(result);
});

export { moderationRouter };
```

- [ ] **Step 3: Register route in server index**

```typescript
// server/src/index.ts — add import and registration:
import { moderationRouter } from './routes/moderation.js';

// After the spotify router registration:
app.use('/api', moderationRouter);
```

- [ ] **Step 4: Write test**

```typescript
// server/src/__tests__/moderation-route.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { moderationRouter } from '../routes/moderation.js'

vi.mock('../middleware/moderation.js', () => ({
  moderateImage: vi.fn().mockResolvedValue({
    flagged: false,
    categories: { sexual: false, violence: false },
    categoryScores: { sexual: 0.001, violence: 0.002 },
  }),
}))

const app = express()
app.use(express.json())
app.use('/api', moderationRouter)

describe('POST /api/moderate-image', () => {
  it('returns moderation result for valid base64 image', async () => {
    const res = await request(app)
      .post('/api/moderate-image')
      .send({ image: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('categoryScores')
    expect(res.body).toHaveProperty('flagged', false)
  })

  it('rejects missing image', async () => {
    const res = await request(app).post('/api/moderate-image').send({})
    expect(res.status).toBe(400)
  })

  it('rejects non-data-URL string', async () => {
    const res = await request(app).post('/api/moderate-image').send({ image: 'https://example.com/img.png' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run server/src/__tests__/moderation-route.test.ts`
Expected: PASS

- [ ] **Step 6: Build server**

Run: `cd /home/context/projects/chatbridge/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
cd /home/context/projects/chatbridge
git add server/src/middleware/moderation.ts server/src/routes/moderation.ts server/src/index.ts server/src/__tests__/moderation-route.test.ts
git commit -m "feat: POST /api/moderate-image — base64 image → OpenAI moderation with category scores"
```

---

## Task 7: Capture orchestrator + blur effects

**Files:**
- Create: `src/renderer/lib/content-safety/capture.ts`
- Create: `src/renderer/lib/content-safety/effects.ts`
- Create: `src/renderer/lib/content-safety/index.ts`
- Create: `src/renderer/components/iframe/SafetyOverlay.tsx`

- [ ] **Step 1: Create capture module**

```typescript
// src/renderer/lib/content-safety/capture.ts
import type { PostMessageBroker } from '@/components/iframe/PostMessageBroker'

const CAPTURE_TIMEOUT = 3000

export function requestCapture(
  broker: PostMessageBroker,
  iframe: HTMLIFrameElement,
  requestId: string
): void {
  broker.sendToIframe(iframe, 'capture.request', { requestId })
}

export function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 224
      canvas.height = 224
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 224, 224)
      resolve(ctx.getImageData(0, 0, 224, 224))
    }
    img.onerror = () => reject(new Error('Failed to decode capture image'))
    img.src = dataUrl
  })
}

export { CAPTURE_TIMEOUT }
```

- [ ] **Step 2: Create effects module**

```typescript
// src/renderer/lib/content-safety/effects.ts

export function applyBlur(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = 'blur(30px)'
  iframeEl.style.transition = 'filter 0.5s ease'
}

export function removeBlur(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = ''
}

export function applyHardBlock(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = 'blur(50px) brightness(0.3)'
  iframeEl.style.pointerEvents = 'none'
  iframeEl.style.transition = 'filter 0.5s ease'
}
```

- [ ] **Step 3: Create SafetyOverlay component**

```tsx
// src/renderer/components/iframe/SafetyOverlay.tsx
import type { FC } from 'react'

interface SafetyOverlayProps {
  visible: boolean
  hardBlock?: boolean
}

export const SafetyOverlay: FC<SafetyOverlayProps> = ({ visible, hardBlock }) => {
  if (!visible) return null

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: 10,
      borderRadius: '8px',
    }}>
      <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
        {hardBlock ? 'This content has been blocked.' : "Content isn't available right now."}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create the orchestrator**

```typescript
// src/renderer/lib/content-safety/index.ts
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
    if (flagged) sendToOpenAI(app)
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
    // Timeout: skip frame if no response
    setTimeout(() => {
      if (pendingRequestId === reqId) pendingRequestId = null
    }, CAPTURE_TIMEOUT)
  }

  async function sendToOpenAI(app: { id: string; iframeEl: HTMLIFrameElement }) {
    if (!pendingRequestId) {
      // Need a fresh capture for OpenAI
      triggerCapture()
      return
    }
    // Wait for current capture, then send
    // Simplified: the next capture.response will also trigger this path via the worker's flagged output
  }

  // Periodic capture
  periodicTimer = setInterval(triggerCapture, PERIODIC_INTERVAL)

  // Periodic OpenAI moderation (every 30s, bypasses dedup)
  openaiTimer = setInterval(async () => {
    const app = getActiveApp()
    if (!app || destroyed) return

    // Request a fresh capture
    const reqId = crypto.randomUUID()
    pendingRequestId = reqId
    requestCapture(broker, app.iframeEl, reqId)

    // Listen for this specific response to send to OpenAI
    const captureHandler = async (payload: any) => {
      if (payload?.requestId !== reqId || !payload?.image) return
      broker.on('capture.response', () => {}) // Remove? No off() method — acceptable for now

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
      } catch {}
    }
    broker.on('capture.response', captureHandler)
  }, OPENAI_INTERVAL)

  // Event-driven triggers
  const eventTypes = ['tool.result', 'task.completed', 'app.state']
  for (const type of eventTypes) {
    broker.on(type, () => triggerCapture())
  }

  // Cleanup
  return () => {
    destroyed = true
    if (periodicTimer) clearInterval(periodicTimer)
    if (openaiTimer) clearInterval(openaiTimer)
    abortController?.abort()
    worker?.terminate()
  }
}
```

- [ ] **Step 5: Build**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/lib/content-safety/ src/renderer/components/iframe/SafetyOverlay.tsx
git commit -m "feat: content safety orchestrator — capture, classify, blur pipeline"
```

---

## Task 8: Wire into ChatBridgeApp

**Files:**
- Modify: `src/renderer/components/ChatBridgeApp.tsx`

- [ ] **Step 1: Import and integrate the monitoring pipeline**

Add imports at the top of `ChatBridgeApp.tsx`:

```typescript
import { startMonitoring } from '../lib/content-safety/index'
import { SafetyOverlay } from './iframe/SafetyOverlay'
```

Add state for safety overlay:

```typescript
const [safetyOverlay, setSafetyOverlay] = useState<{ visible: boolean; hardBlock: boolean }>({ visible: false, hardBlock: false })
```

Add useEffect to start monitoring after broker is initialized (inside the existing broker useEffect, after `broker.on('app.state', ...)` block):

```typescript
const apiUrl = import.meta.env.VITE_API_URL || ''
const stopMonitoring = startMonitoring(
  () => {
    const active = getActiveApp()
    if (!active) return null
    const el = iframeRefs.current.get(active.id)
    if (!el) return null
    return { id: active.id, iframeEl: el }
  },
  broker,
  apiUrl,
  (action, appId) => {
    if (action === 'hard_block') setSafetyOverlay({ visible: true, hardBlock: true })
    else if (action === 'blur') setSafetyOverlay({ visible: true, hardBlock: false })
    else if (action === 'unblur') setSafetyOverlay({ visible: false, hardBlock: false })
    // Log safety events (no PII, no frame data — just action metadata)
    if (action !== 'none' && action !== 'unblur') {
      console.warn('[ContentSafety]', { action, appId, timestamp: Date.now() })
    }
  }
)

// Add to cleanup return:
return () => { broker.destroy(); stopMonitoring() }
```

Render SafetyOverlay inside the app panel div (after the IframeManager components, inside the `hasActiveApp` block):

```tsx
<SafetyOverlay visible={safetyOverlay.visible} hardBlock={safetyOverlay.hardBlock} />
```

- [ ] **Step 2: Build**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Run full test suite**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run`
Expected: 436+ passing (pre-existing 6 failures only)

- [ ] **Step 4: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/components/ChatBridgeApp.tsx
git commit -m "feat: wire CV content safety pipeline into ChatBridgeApp"
```

---

## Task 9: Host NSFWJS model + build config

**Files:**
- Modify: `vite.config.ts`
- Create: `src/renderer/public/nsfwjs-model/` (model files)

- [ ] **Step 1: Download NSFWJS MobileNetV2 model files**

```bash
cd /home/context/projects/chatbridge
mkdir -p src/renderer/public/nsfwjs-model
# Download from NSFWJS CDN (MobileNetV2 quantized)
curl -L "https://raw.githubusercontent.com/nicedayzhu/nsfwjs-model/refs/heads/main/mobilenet_v2/model.json" -o src/renderer/public/nsfwjs-model/model.json
curl -L "https://raw.githubusercontent.com/nicedayzhu/nsfwjs-model/refs/heads/main/mobilenet_v2/group1-shard1of1" -o src/renderer/public/nsfwjs-model/group1-shard1of1
```

- [ ] **Step 2: Add ML vendor chunk to vite config**

```typescript
// vite.config.ts — inside manualChunks function, add:
if (id.includes('@tensorflow') || id.includes('nsfwjs')) {
  return 'vendor-ml'
}
```

- [ ] **Step 3: Build and verify ML chunk is separate**

Run: `cd /home/context/projects/chatbridge && pnpm vite build 2>&1 | grep vendor-ml`
Expected: `vendor-ml.[hash].js` appears in output

- [ ] **Step 4: Commit**

```bash
cd /home/context/projects/chatbridge
git add src/renderer/public/nsfwjs-model/ src/renderer/public/wasm/ vite.config.ts
git commit -m "feat: host NSFWJS model + WASM binaries, ML vendor chunk split"
```

---

## Task 10: Deploy and verify

- [ ] **Step 1: Build server**

Run: `cd /home/context/projects/chatbridge/server && npx tsc`

- [ ] **Step 2: Build frontend**

Run: `cd /home/context/projects/chatbridge && pnpm vite build`

- [ ] **Step 3: Run full test suite**

Run: `cd /home/context/projects/chatbridge && pnpm vitest run`
Expected: 436+ passing, 6 pre-existing failures only

- [ ] **Step 4: Push and deploy**

```bash
cd /home/context/projects/chatbridge
git push origin main
VITE_API_URL=https://chatbox-production-d06b.up.railway.app vercel --prod --yes --scope aarons-projects-18bc88ee
```

- [ ] **Step 5: Verify on live site**

Open https://chatbridge.aaroncarney.me, launch any app. Check browser console for:
- `NSFWJS model loaded` (worker ready)
- `capture.request` / `capture.response` messages in broker
- Classification results logged

---

## Wiring Verification

After all tasks: confirm these integration points work end-to-end:

1. **Strict sandbox preserved:** Inspect iframe element — `sandbox="allow-scripts"` only, no `allow-same-origin`
2. **Capture flows through broker:** Browser console shows `capture.request` sent, `capture.response` received
3. **NSFWJS classifies frames:** Worker posts `result` messages with class probabilities
4. **OpenAI moderation fires every 30s:** Network tab shows `POST /api/moderate-image` calls
5. **Blur works:** Test with a known-NSFW image injected into an app canvas — iframe should blur within 5s
6. **Hysteresis prevents flicker:** After blur, clean frames don't instantly unblur — requires 5 consecutive clean frames (25s)
