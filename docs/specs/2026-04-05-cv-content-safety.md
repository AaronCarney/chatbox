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

### Two-Tier Capture Strategy

All apps are same-origin (`/apps/*`) with `sandbox="allow-scripts allow-same-origin"`, so the parent can access `iframe.contentDocument`.

**Tier 1 — Canvas-based apps (Go, DOS):**
Direct `drawImage()` from `iframe.contentDocument.querySelector('canvas')` onto a local canvas. Sub-millisecond, zero dependencies. GPU-accelerated blit.

**Tier 2 — DOM-based apps (Spotify, Chess):**
`modern-screenshot` library (`domToPng` / `domToCanvas`) on `iframe.contentDocument.body`. ~1-2s for 20-50 elements. 185KB unpacked.

**Auto-detection:** If iframe contains a `<canvas>` with nonzero dimensions → Tier 1. Otherwise → Tier 2.

**Why not html2canvas:** 3x slower, 18x larger (3.4MB), confirmed bug rendering `<canvas>` elements as empty (GitHub #1311).

### Capture Triggers

**Event-driven + 5-second fallback:**
- Immediate capture on PostMessageBroker events: `tool.result`, `task.completed`, `app.state`, `launch`
- 5-second periodic timer for silent content changes (canvas-based games that update without sending messages)
- No capture when no app is active (chat-only state)

**Single-slot buffer:** If a new event fires while a previous frame is being classified, the old frame is dropped and replaced. Never queues more than one pending frame.

### Capture Resize

Captured frame resized to 224×224 before classification (MobileNet/NSFWJS native input size). This is the ML model input, not the display size — the app panel renders at full resolution for the user.

### Cross-Origin Image Limitation

Spotify album art (`i.scdn.co`) does NOT send CORS headers. DOM captures of Spotify will show track text/layout but blank album art thumbnails. This is acceptable — album art is already checked at original resolution via the API-level moderation (Layer 2).

### Security Note

`allow-scripts + allow-same-origin` lets embedded content theoretically escape the sandbox (MDN warning). Acceptable because all apps are first-party, admin-curated from `/apps/*`. CSP `frame-src` should be used as additional defense.

## Classification Layer

### Architecture

Capture runs on main thread (needs DOM access). Classification runs in a **Web Worker** (off main thread, UI stays responsive).

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
- **Input:** Frame as base64 data URL (`data:image/png;base64,...`) sent to server endpoint, relayed to OpenAI
- **Output:** 13 categories with per-category `flagged` boolean and `category_scores` (0.0-1.0)
- **Categories:** harassment, hate, illicit, self-harm, sexual, violence (each with sub-categories)

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
      capture.ts          — Two-tier frame capture (canvas direct + modern-screenshot)
      classifier.worker.ts — Web Worker: NSFWJS + frame hash dedup
      actions.ts           — Blur/overlay/unblur with hysteresis state machine
      index.ts             — Orchestrator: triggers, intervals, worker comms
  components/
    iframe/
      SafetyOverlay.tsx    — Blur overlay + "Content isn't available" message
```

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
