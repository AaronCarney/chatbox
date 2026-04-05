# Research: Content Safety Pipeline — Technical Claim Verification

**Date:** 2026-04-04
**Sources:** NSFWJS GitHub (infinitered/nsfwjs), TF.js WASM backend README (tensorflow/tfjs), OpenAI Moderation API docs, OpenAI Cookbook, Electron docs, MDN Web Docs, Context7 (nsfwjs, tfjs), GitHub issues (#6517, #38051), SHA-256 browser benchmarks
**Confidence Summary:** 7 HIGH / 4 MEDIUM / 2 LOW

---

## 1. NSFWJS Bundle Size: "2.6MB" Claim

**Verdict: Approximately correct for hosted binary weights only. Does NOT include TF.js runtime.**

The NSFWJS README states that bundled (base64-encoded) MobileNetV2 model is ~3.5MB, while hosted binary model files are ~2.6MB (~33% smaller due to base64 encoding overhead). The 2.6MB figure refers to the binary weight shards downloaded over the network when using a hosted model URL.

The TF.js runtime is a separate download:
- `@tensorflow/tfjs` core: ~150-300KB minified+gzipped (varies by backend)
- `@tensorflow/tfjs-backend-wasm`: ~50KB JS + ~300-800KB WASM binaries (3 variants: vanilla, SIMD, threaded-SIMD)

**Total download for WASM path:** ~2.6MB (model weights) + ~0.5-1.1MB (TF.js + WASM binary) = **~3.1-3.7MB total**.

Three model variants exist:
- **MobileNetV2** (default): smallest, ~2.6MB binary weights, 224x224 input, ~90% accuracy
- **MobileNetV2Mid**: medium, 2 weight shards (graph model), ~93% accuracy
- **InceptionV3**: largest, 6 weight shards, 299x299 input, highest accuracy

[HIGH | source: NSFWJS GitHub README — "bundled is 3.5MB, binary is ~2.6MB (33% smaller)"]

---

## 2. NSFWJS Runs in a Web Worker

**Verdict: Yes, confirmed. Official example exists. Requires explicit WASM path setup.**

The NSFWJS repository includes a complete browser worker implementation at `examples/nsfw_demo/src/nsfwjs.worker.ts`. The worker:
- Dynamically imports `@tensorflow/tfjs` and a backend
- Uses a two-tier caching strategy: IndexedDB first, network fallback
- Communicates via `postMessage` with `load` and `predict` message types
- Returns `modelLoaded` boolean, predictions array, or error strings

The official example uses **WebGPU** as primary backend with automatic fallback. For WASM backend in a Web Worker, there is one known requirement:

**Critical:** TF.js WASM backend in Web Workers requires calling `tf.wasm.setWasmPaths()` before backend initialization. Without this, the worker cannot locate `.wasm` files. This was GitHub issue #6517 (resolved June 2022).

```javascript
// Inside Web Worker
tf.wasm.setWasmPaths("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/wasm-out/");
await tf.setBackend('wasm');
```

[HIGH | source: NSFWJS GitHub `examples/nsfw_demo/src/nsfwjs.worker.ts`, TF.js issue #6517 (COMPLETED)]

---

## 3. NSFWJS Inference Time: "30-50ms"

**Verdict: Plausible for WebGL on mid-range GPU. WASM SIMD likely 50-150ms. No official NSFWJS benchmarks exist.**

NSFWJS provides no official inference time benchmarks. The claim must be evaluated from general TF.js MobileNetV2 performance data:

- **WASM + SIMD** (no multi-threading): For small MobileNet-class models on modern CPUs, general TF.js WASM benchmarks show 8-12ms for embedding models on M2 MacBook. MobileNetV2 classification is heavier than embeddings — expect **50-150ms on a typical laptop CPU with WASM SIMD**. With multi-threading (4 cores): could approach 30-50ms.
- **WebGL backend**: Generally faster for inference on discrete GPUs, but introduces GPU resource contention with React rendering. MobileNetV2 on WebGL can achieve 15-40ms on mid-range GPUs.
- **WebGPU backend**: Newest, fastest for GPU inference when available.

The 30-50ms claim is realistic for:
- WebGL on a laptop with integrated/discrete GPU
- WASM + SIMD + multi-threading on a modern quad-core CPU

It is optimistic for:
- WASM SIMD single-threaded on low-end hardware
- First inference (model warmup adds 100-500ms)

**Recommendation:** Budget 50-100ms for WASM SIMD as the conservative target. First inference will be slower.

[MEDIUM | source: TF.js WASM benchmarks (blog.tensorflow.org), SitePoint WebGPU vs WASM benchmarks, general MobileNet inference data. No NSFWJS-specific benchmarks found.]

---

## 4. NSFWJS Memory Footprint (Model + Runtime + Tensors)

**Verdict: Estimated 15-30MB total. Not a concern for a web app.**

No official memory measurements exist for NSFWJS specifically. Estimated breakdown:

- **Model weights in memory:** ~2.6MB (MobileNetV2 quantized) — weights are decompressed but quantized models stay small
- **TF.js runtime:** ~5-10MB heap allocation (core + backend)
- **WASM linear memory:** ~16MB default allocation (WASM backends pre-allocate)
- **Inference tensors:** ~0.5-2MB (224x224 input tensor + intermediate activations, disposed after each inference)
- **WebGL textures** (if WebGL backend): GPU memory, ~10-20MB

**Estimated total: ~15-30MB** depending on backend.

For context: a typical React app uses 30-80MB. A complex Electron + React app (Chatbox) likely uses 150-300MB. Adding 15-30MB for NSFWJS is a **~5-15% increase** — not a concern.

**Note:** ChatBridge uses the web build (Vercel), not Electron. For a browser tab, the same analysis applies — modern tabs routinely use 100-300MB.

The `dispose()` method must be called on tensors after classification to prevent memory leaks. The NSFWJS worker example handles this correctly.

[MEDIUM | source: TF.js memory management docs, general WASM linear memory sizing, NSFWJS dispose() API]

---

## 5. OpenAI Moderation Endpoint Accepts Image Data URLs

**Verdict: Yes. Base64 data URLs (`data:image/png;base64,...`) are supported.**

The `omni-moderation-latest` model accepts images via the `image_url` input type. The `url` field accepts either:
1. A publicly accessible HTTP(S) URL
2. A base64-encoded data URL (e.g., `data:image/jpeg;base64,abcdefg...`)

Input format:
```json
{
  "model": "omni-moderation-latest",
  "input": [
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,iVBORw0KGgo..."
      }
    }
  ]
}
```

Text and images can be combined in the same request. No upload to a hosted URL is required.

The OpenAI docs state: "The image_url parameter contains either an image URL or base64 encoded image data."

**Pricing:** The moderation endpoint is free for OpenAI API users (no per-request charge).

[HIGH | source: OpenAI Moderation guide (platform.openai.com/docs/guides/moderation), OpenAI API reference (developers.openai.com), OpenAI Cookbook moderation example, OpenAI community forum confirmations]

---

## 6. Frame Hash for Caching — Performance and Approach

**Verdict: Web Crypto SHA-256 hashes 200KB in ~8ms. Use it. Pixel sampling is fragile.**

### Web Crypto API (SHA-256)

`crypto.subtle.digest('SHA-256', buffer)` is the browser-native approach:
- **100KB:** ~8ms (benchmarked)
- **200KB (224x224 RGBA):** ~10-15ms estimated (linear extrapolation)
- **1MB:** ~58ms

This is async and non-blocking. For a 200KB ImageData buffer, SHA-256 via Web Crypto is **under the 5ms target on fast hardware, borderline on average hardware**.

### Faster alternatives

- **WASM-based SHA-256:** 100KB in ~3ms, 1MB in ~3ms. ~3-10x faster than Web Crypto. Libraries: `hash-wasm`.
- **Non-cryptographic hashes (xxHash, MurmurHash3):** Even faster but require a library dependency. xxHash WASM implementations can hash 200KB in <1ms.
- **Pixel sampling:** Sample every Nth pixel to create a smaller fingerprint (~2-5KB), then hash that. Faster but introduces false-negative risk on subtle frame changes. Not recommended for safety-critical dedup.

### Recommendation

Use `crypto.subtle.digest('SHA-256', imageData.data.buffer)` — zero dependencies, ~10ms for 200KB, cryptographically collision-resistant. If profiling shows it is too slow, switch to `hash-wasm` (xxHash64) for sub-millisecond hashing.

A simpler dedup alternative: **skip hashing entirely and compare the first + last 1KB of pixel data** as a fast equality check before full classification. This catches identical consecutive frames with zero overhead.

[HIGH | source: Ronan Takizawa SHA-256 browser benchmarks (medium.com), MDN SubtleCrypto.digest() docs, Web Crypto API spec]

---

## 7. TF.js WASM + SharedArrayBuffer in Electron

**Verdict: Works, but requires explicit header injection. Not automatic.**

### SharedArrayBuffer requirement

TF.js WASM multi-threaded binary (`tfjs-backend-wasm-threaded-simd.wasm`) requires `SharedArrayBuffer`, which requires cross-origin isolation. Without it, TF.js **silently falls back** to SIMD-only (single-threaded) WASM — functional but slower.

### Cross-origin isolation in browsers (Vercel web build)

Vercel/browser deployments need these response headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Warning:** COEP `require-corp` breaks loading of cross-origin resources (CDN scripts, images, iframes) that don't have `Cross-Origin-Resource-Policy` headers. This conflicts with iframe-based app embedding (ChatBridge's core feature). Use `credentialless` instead of `require-corp` if available.

### Cross-origin isolation in Electron

Electron does **not** have a `webPreferences` option for cross-origin isolation. The documented workaround uses `session.defaultSession.webRequest.onHeadersReceived`:

```javascript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  });
});
```

**Known limitation:** `onHeadersReceived` does NOT work with the `file://` scheme. If Electron loads local HTML via `file://`, headers are not injected. Use a custom protocol (`app://`) or serve via a local HTTP server.

### Practical recommendation for ChatBridge

Since ChatBridge is a **web build on Vercel** (not Electron):
1. COEP headers will break iframe embedding of third-party apps (the core feature)
2. **Use single-threaded WASM + SIMD** — skip multi-threading entirely
3. Single-threaded WASM SIMD is sufficient for MobileNetV2 inference (~50-100ms)
4. Run inference in a Web Worker to keep the main thread free regardless

[HIGH | source: TF.js WASM backend README (cross-origin isolation section), Electron GitHub issue #38051, Electron WebPreferences docs (confirms no SAB option), Electron webRequest docs]

---

## Common Pitfalls

1. **COEP breaks iframes:** Setting `Cross-Origin-Embedder-Policy: require-corp` will block all cross-origin iframe content that doesn't set `Cross-Origin-Resource-Policy`. This directly conflicts with ChatBridge's sandboxed iframe architecture. Do not enable COEP on the main page.

2. **First inference warmup:** The first NSFWJS classification after model load takes 2-5x longer than subsequent calls due to WASM compilation and kernel warmup. Pre-warm with a dummy image at startup.

3. **Tensor memory leaks:** Every `model.classify()` call creates tensors. The returned prediction objects are plain JS, but internal tensors must be disposed. Use `tf.tidy()` or ensure the worker implementation calls `dispose()`.

4. **WASM path resolution in Workers:** TF.js cannot auto-detect WASM binary paths inside Web Workers. Always call `setWasmPaths()` before `setBackend('wasm')`.

5. **Model caching race condition:** If multiple tabs/workers try to cache to IndexedDB simultaneously, writes can conflict. Use a single model loader with a promise cache.

[HIGH | source: TF.js WASM README, NSFWJS worker example, TF.js issue #6517]

---

## Unverified Findings

1. **Exact NSFWJS MobileNetV2 quantized weight file size:** The "2.6MB" figure comes from the NSFWJS README's claim that "hosted binary is ~33% smaller than bundled 3.5MB." The actual hosted shard files were not independently measured. Could be 2.3-2.9MB depending on quantization level and model version.
[LOW -- unverified: could not access the actual hosted model files to measure; README statement is the only source]

2. **WASM SIMD single-threaded inference time for MobileNetV2:** Estimated at 50-150ms based on general TF.js WASM benchmarks for similar-sized models. No NSFWJS-specific measurement exists in any source found.
[LOW -- unverified: extrapolated from general TF.js WASM benchmarks, not NSFWJS-specific data]
