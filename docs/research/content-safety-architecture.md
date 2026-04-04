# Content Safety Architecture — Defense in Depth

ChatBridge uses two complementary moderation layers that cover different threat surfaces. Neither layer alone is sufficient.

## Two-Layer Design

### Layer 1: CV Pipeline (Universal)
Captures the app iframe via Electron `capturePage()`, resizes to 224x224, runs through a shared MobileNet-v2 backbone with category-specific classification heads (nudity, violence, weapons, hate symbols, self-harm, drugs). Works on every app with zero custom code.

### Layer 2: API-Level Moderation (Per-Content-Type)
Checks small embedded media at original resolution via content-specific APIs. Example: Spotify album art URLs sent to OpenAI `omni-moderation-latest` at full 640x640, lyrics fetched from LRCLIB and run through text moderation.

## Coverage Matrix

| Threat | CV catches it? | API catches it? |
|---|---|---|
| Explicit game filling the screen | Yes | No (no API for arbitrary games) |
| 40px album art thumbnail | No | Yes (checks original image URL) |
| Explicit lyrics | No | Yes (LRCLIB + text moderation) |
| DOS game with violent content | Yes | No |
| User uploads hate symbol in a future app | Yes | Depends on app |

## Why Both Layers

The CV pipeline is the **universal safety net** — any visual content occupying significant screen space gets classified regardless of which app produced it. No per-app integration needed.

API-level moderation is the **precision layer** — it handles content too small for screenshot-based classification (thumbnails, text) by checking source media at original resolution.

The 224x224 model input is not the display size. The app panel renders at full resolution for the user. The resize to 224x224 happens internally before ML inference only. Album art thumbnails (40-64px in the iframe) become ~18px in the resized capture — too small for reliable classification. This is exactly why API-level checks on the original image URL are necessary for small embedded media.

## Implementation Status

- **API-level (Spotify):** Implemented. Album art via OpenAI image moderation, lyrics via LRCLIB + text moderation, in-memory TTL cache. Applied to search and recommendations routes.
- **CV pipeline:** Research complete. Architecture defined. Implementation pending.

## Research References

- `docs/research/album-art-safety.md` — Album art API comparison
- `docs/research/lyrics-safety.md` — Lyrics API + classifier comparison
- `docs/research/content_moderation.md` — Local ONNX pipeline architecture
- `docs/research/Capture APIs.md` — Electron/Extension/Web capture comparison
- `docs/research/On-device ML models content moderation.md` — Model selection, TF.js vs ORT Web
- `docs/research/finte tuning datasets content safety.md` — Datasets, transfer learning, hard negatives
- `docs/research/CV pipeline.md` — Adaptive performance, action tiers, COPPA/BIPA
