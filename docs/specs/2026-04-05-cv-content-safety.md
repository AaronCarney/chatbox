# CV Content Safety Pipeline — Design Spec

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Universal content safety via frame capture + ML classification for all iframe-embedded apps

## Problem

ChatBridge embeds third-party educational apps (chess, go, DOS arcade, Spotify) in sandboxed iframes. The existing Spotify-specific content safety (album art + lyrics moderation) doesn't generalize — adding a new app requires custom moderation code. We need a single pipeline that monitors visual content across ALL apps without per-app integration.

## Two-Layer Safety Architecture

The CV pipeline is Layer 1 (universal). API-level moderation (e.g., Spotify lyrics/album art) is Layer 2 (per-content-type precision). Both are needed — see `docs/research/content-safety-architecture.md` for the coverage matrix.

| Threat | CV catches it? | API catches it? |
|---|---|---|
| Explicit game filling the screen | Yes | No |
| 40px album art thumbnail | No | Yes (original URL) |
| Explicit lyrics | No | Yes (LRCLIB + text) |
| DOS game with violent content | Yes | No |
| User uploads hate symbol in future app | Yes | Depends on app |

## Capture Layer

### SDK-Based Capture (Strict Sandbox Preserved)

Iframes keep `sandbox="allow-scripts"` with NO `allow-same-origin`. The `credentialless` attribute stays. The parent never accesses `iframe.contentDocument`. Instead, capture works through the existing PostMessageBroker communication channel:

1. Parent sends `capture.request` message to the active iframe via PostMessageBroker
2. The ChatBridge SDK (already loaded in every app) handles the request internally:
   - **Canvas-based apps (Go, DOS):** SDK finds the `<canvas>` element, calls `canvas.toDataURL('image/jpeg', 0.5)` — fast, low bandwidth
   - **DOM-based apps (Spotify, Chess):** SDK uses `modern-screenshot` (`domToPng`) on `document.body` — captures full DOM including images
3. SDK sends the image data back via `capture.response` postMessage
4. Parent receives the data URL, resizes to 224×224 on a local canvas, sends to classification Worker

**Why this approach:**
- **Strict sandbox preserved** — no `allow-same-origin`, no `credentialless` removal, no `contentDocument` access. The iframe cannot escape.
- **Universal** — same `capture.request`/`capture.response` protocol for all apps. Handled by the SDK, not per-app code.
- **Tamper concern:** A compromised app could send a fake clean image. Mitigated by: (a) all apps are first-party admin-curated, (b) API-level moderation (Layer 2) cross-checks source content independently, (c) SDK capture code is in the platform-provided `chatbridge-sdk.js`, not app code.

**SDK change required:** Add `capture.request` handler to `chatbridge-sdk.js`. The SDK already handles `tool.invoke`, `app.launch`, and state requests — this adds one more handler following the same pattern.

**`modern-screenshot` dependency:** Bundled into `chatbridge-sdk.js` for DOM-based capture. Only loaded when `capture.request` is received and no `<canvas>` element is found. ~185KB.

### Capture Triggers

**Event-driven + 5-second fallback:**
- Immediate capture on PostMessageBroker events: `tool.result`, `task.completed`, `app.state`
- Immediate capture when `launch_app` tool call resolves (app becomes active)
- 5-second periodic timer for silent content changes (canvas-based games that update without sending messages)
- No capture when no app is active (chat-only state)

**Single-slot buffer:** If a new event fires while a previous frame is being classified, the old frame is dropped and replaced. Never queues more than one pending frame.

**Timeout:** If the iframe doesn't respond to `capture.request` within 3 seconds, skip that frame. A non-responsive app is logged but not blocked (could be loading, frozen, or slow).

### Capture Resize

Parent resizes received image to 224×224 on a local canvas before classification (MobileNet/NSFWJS native input size). This is the ML model input, not the display size — the app panel renders at full resolution for the user.

### Cross-Origin Image Limitation

Spotify album art (`i.scdn.co`) may not render in `modern-screenshot` captures if CORS headers are missing. Track text/layout will still be captured. Album art is already checked at original resolution via the API-level moderation (Layer 2).

## Classification Layer

### Architecture

Capture orchestration runs on main thread (sends `capture.request`, receives response, resizes). Classification runs in a **Web Worker** (off main thread, UI stays responsive).

### Classifier 1: NSFWJS (Local, Instant)

- **Model:** NSFWJS MobileNetV2 quantized (~2.6MB weights + ~0.5-1.1MB TF.js WASM runtime)
- **Backend:** TF.js WASM SIMD, single-threaded (multi-threaded requires COEP headers which break iframe embedding)
- **Inference:** ~50-100ms per frame on WASM SIMD
- **Memory:** ~15-30MB total (model + runtime + tensors)
- **Runs on:** Every captured frame
- **Output:** 5 classes (Drawing, Hentai, Neutral, Porn, Sexy) with 0.0-1.0 softmax probabilities

**Worker setup requirements:**
- Call `tf.wasm.setWasmPaths()` before backend init (required in Web Workers)
- Pre-warm with dummy image at startup (first inference 2-5x slower)
- Dispose tensors via `tf.tidy()` to prevent memory leaks

### Classifier 2: OpenAI Moderation (Remote, Broad Coverage)

- **Model:** `omni-moderation-latest` (free endpoint)
- **Runs on:** Every 30 seconds OR immediately when NSFWJS flags above 0.15 (below action threshold, early warning)
- **Input:** Frame as base64 data URL (`data:image/png;base64,...`) sent to new `POST /api/moderate-image` server endpoint, relayed to OpenAI
- **Output:** 13 categories with per-category `flagged` boolean and `category_scores` (0.0-1.0)
- **Categories:** harassment, hate, illicit, self-harm, sexual, violence (each with sub-categories)
- **In-flight cancellation:** AbortController cancels pending OpenAI request if a new frame arrives before response

**Required server change:** Add `POST /api/moderate-image` route accepting `{ image: "data:image/png;base64,..." }`. Calls existing `moderateImage()` from `moderation.ts` but must return raw `category_scores` (float values), not just the boolean `flagged`/`categories` the current implementation returns. The `moderateImage()` function needs a small change to expose scores.

### Frame Deduplication

SHA-256 hash of 224×224 ImageData (~10ms via Web Crypto API). Skip NSFWJS classification if hash matches previous frame. Avoids re-classifying static content (idle chess board, paused DOS game). The 30-second OpenAI moderation interval bypasses dedup (covers different categories — a frame safe for NSFWJS may still contain violence/hate).

## Action Layer

### NSFWJS Thresholds

Flag if ANY of (only NSFW classes checked — Drawing and Neutral are SFW, ignored):

| Class | Flag Threshold | Unflag Threshold | Rationale |
|---|---|---|---|
| Porn | > 0.2 | < 0.1 | Any meaningful signal triggers in K-12 |
| Hentai | > 0.3 | < 0.15 | Slightly higher — Drawing/Hentai confusion documented |
| Sexy | > 0.4 | < 0.2 | Broadest class (swimwear, fashion), higher to reduce FPs |

### OpenAI Moderation Thresholds

Use `category_scores` with custom thresholds, not just the `flagged` boolean (OpenAI's defaults are for general audiences, not K-12):

| Category | Action | Threshold |
|---|---|---|
| `sexual/minors` | **Hard block + log alert** | > 0.01 (zero tolerance) |
| `self-harm/instructions` | **Hard block + log alert** | > 0.01 (zero tolerance) |
| `sexual` | Blur | `flagged: true` |
| `violence/graphic` | Blur | `flagged: true` |
| `self-harm` | Blur | `flagged: true` |
| All other categories | Blur | `flagged: true` |

### Blur Implementation

- `filter: blur(30px)` on the iframe element (works cross-browser, post-compositing effect, no DOM access needed)
- Dark overlay div with neutral message: "Content isn't available right now"
- `transition: filter 0.5s ease` for smooth application/removal
- 30px minimum — 20px still shows skin tones and body shapes per Gaussian blur analysis

### Hysteresis (Anti-Flicker)

Asymmetric state transitions (Schmitt trigger pattern) to prevent flickering on borderline content:

```
State: CLEAN
  if any_nsfw_score > flag_threshold:
    → FLAGGED (immediate, zero delay)
    apply blur
    clean_count = 0

State: FLAGGED
  if all scores < unflag_threshold:
    clean_count++
  else:
    clean_count = 0
  if clean_count >= 5:
    → CLEAN
    remove blur
```

- Flag → immediate blur
- Unflag → requires **5 consecutive clean frames** AND scores below unflag thresholds
- At 5-second capture intervals, minimum blur duration is ~25 seconds after content changes

### Logging

Flag events logged to Langfuse (already integrated): `{appId, category, confidence, timestamp}`. No frame pixel data persisted. No student identifiers. Session pseudonyms only (existing COPPA-compliant pattern).

## Dependencies

| Package | Size | Purpose |
|---|---|---|
| `nsfwjs` | ~2.6MB weights | NSFW classification |
| `@tensorflow/tfjs` | ~150-300KB | ML runtime |
| `@tensorflow/tfjs-backend-wasm` | ~300-800KB | WASM SIMD backend |
| `modern-screenshot` | ~185KB | DOM-based app capture |

Total new dependency footprint: ~3.5-4MB

## File Structure

```
src/renderer/
  lib/
    content-safety/
      capture.ts            — Sends capture.request via broker, receives response, resizes to 224x224
      classifier.worker.ts  — Web Worker: NSFWJS + frame hash dedup
      hysteresis.ts         — Pure state machine (flag/unflag logic, no DOM)
      effects.ts            — DOM side effects (blur, overlay, CSS transitions)
      index.ts              — Orchestrator: triggers, intervals, worker comms
  components/
    iframe/
      SafetyOverlay.tsx     — Blur overlay + "Content isn't available" message
                              Rendered alongside IframeManager in ChatBridgeApp, not inside it
  public/
    sdk/
      chatbridge-sdk.js     — Add capture.request handler (canvas.toDataURL or modern-screenshot)
server/
  src/
    routes/
      moderation.ts         — POST /api/moderate-image (base64 → OpenAI relay, returns category_scores)
```

### Module Interfaces

```typescript
// capture.ts
export function captureFrame(iframe: HTMLIFrameElement): Promise<ImageData | null>

// classifier.worker.ts (via postMessage)
// Input:  { type: 'classify', imageData: ImageData, skipDedup?: boolean }
// Output: { type: 'result', flagged: boolean, classes: Record<string, number>, hash: string }

// hysteresis.ts
export function updateState(result: ClassifyResult): { action: 'blur' | 'unblur' | 'none' }

// effects.ts
export function applyBlur(iframeEl: HTMLIFrameElement): void
export function removeBlur(iframeEl: HTMLIFrameElement): void

// index.ts
export function startMonitoring(iframeRefs: Map<string, HTMLIFrameElement>, broker: PostMessageBroker): () => void
```

### Build Configuration

- TF.js WASM binary files (`.wasm`) must be served as static assets — copy to `public/wasm/` or configure Vite `publicDir`
- `setWasmPaths('/wasm/')` in the Worker to resolve binaries
- NSFWJS + TF.js must be lazy-loaded via dynamic `import()` — not in the initial bundle
- Vite `rollupOptions.manualChunks` needs an entry for ML vendor libs

### Test Strategy

- `hysteresis.ts` — Pure unit tests in vitest (no DOM needed)
- `capture.ts`, `SafetyOverlay.tsx` — Require `// @vitest-environment jsdom` pragma
- `classifier.worker.ts` — Cannot run in vitest; smoke test via Playwright or manual verification
- Server `POST /api/moderate-image` — Supertest integration test (mock OpenAI)

## Alignment with Design Spec (`docs/specs/2026-04-02-chatbridge-design.md`)

### Sandbox Policy — No Amendment Needed

The SDK-based capture approach preserves the original design spec's strict sandbox: `sandbox="allow-scripts"`, no `allow-same-origin`, `credentialless` attribute retained. The parent never accesses `iframe.contentDocument`. Capture happens inside the iframe via the ChatBridge SDK and communicates results through postMessage — the same channel already used for tool invocation and state management. No sandbox policy changes required.

**Note:** The codebase currently uses `allow-same-origin` in `IframeManager.tsx`, which deviates from the original spec. This should be reverted to `allow-scripts` only as part of this implementation to align with the design spec's intent. The CV pipeline does not depend on `allow-same-origin`.

### Data Classification

Per the design spec's three-tier classification:
- **Frame pixel data:** Tier 1 (ephemeral context). In-memory only in the Web Worker. Discarded immediately after classification. Never persisted to disk, Redis, or network (except as base64 to server for OpenAI relay, which is stateless).
- **Classification results (`{appId, category, confidence, timestamp}`):** Tier 2 (session context). Logged to Langfuse for observability. Langfuse is a third-party service — this must be documented in the school data processing agreement. Contains no student identifiers (session pseudonyms only). Alternative: log to Redis with TTL instead of Langfuse for stricter ephemeral compliance.
- **Frame content sent to OpenAI moderation:** Passes through the server as base64, relayed stateless to OpenAI. OpenAI's moderation endpoint is documented as not storing inputs. No student PII in the frame (app UI content, not camera/webcam).

### COPPA/FERPA

The design spec's privacy architecture applies unchanged:
- Frames capture app UI, not student faces or camera input
- No student identifiers attached to moderation requests
- OpenAI moderation endpoint uses Zero Data Retention
- Classification metadata uses session pseudonyms, not user IDs

### Scope

This feature extends the design spec's §8 Safety Pipeline. It is not in the original Tier 1/2/3 priority list but directly supports the design philosophy: "child safety is 90% of this project." The implementation adds a new middleware layer to the safety pipeline chain described in §8 Risk 1.

## What This Does NOT Cover

- Teacher override UI (post-sprint)
- Per-classroom threshold configuration (post-sprint)
- Additional MobileNet-v2 classification heads for violence/weapons/hate/drugs (post-sprint, see research docs)
- Adaptive capture intervals based on device capability (post-sprint)
- Circuit breaker per-app (post-sprint)
- Incident reporting / admin dashboard (post-sprint)

## Research References

- `docs/research/content-safety-architecture.md` — Two-layer defense-in-depth rationale
- `docs/research/iframe-canvas-capture.md` — Capture API feasibility verification
- `docs/research/content-safety-pipeline-claims.md` — NSFWJS/TF.js/OpenAI claim verification
- `docs/research/nsfwjs-thresholds-blur-moderation.md` — Threshold and blur research
- `docs/research/content_moderation.md` — Local ONNX pipeline architecture (post-sprint)
- `docs/research/Capture APIs.md` — Electron/Extension/Web capture comparison
- `docs/research/On-device ML models content moderation.md` — Model selection, runtime comparison
- `docs/research/finte tuning datasets content safety.md` — Datasets, transfer learning pipeline
- `docs/research/CV pipeline.md` — Adaptive performance, action tiers, COPPA/BIPA
