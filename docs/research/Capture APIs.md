# Capture APIs for on-device content moderation on Chromebooks

**Electron's `webContents.capturePage()` offers the cleanest capture path — app-only, no prompt, no indicator — while Chrome Extension's `chrome.tabCapture` can bypass user gestures when force-installed via enterprise policy but always shows a blue sharing border.** For the pure web path, no fully prompt-free API exists today: `getViewportMedia()` remains unimplemented as of early 2026, though Region Capture (Chrome 104) and Element Capture (Chrome 132) let you crop or isolate an iframe's content from an existing `getDisplayMedia()` stream. The most efficient capture-to-tensor pipeline on a low-end Chromebook runs entirely off the main thread using `MediaStreamTrackProcessor` → `createImageBitmap` with resize → `OffscreenCanvas`, landing a **224×224** frame in **8–20 ms** before inference.

---

## Question 1: Capture API comparison across all three surfaces

### Electron — `webContents.capturePage([rect])`

This is the highest-fidelity option. `capturePage()` snapshots the composited Chromium frame of a specific `webContents` instance and returns a `Promise<NativeImage>`. It captures **only the rendered DOM viewport** — no OS window chrome, no title bar, no taskbar. An optional `rect` parameter (in CSS pixels) lets you crop to a sub-region within the visible viewport, though it cannot capture content below the scroll fold.

The critical architectural advantage for ChatBridge: each `WebContentsView` (the successor to the deprecated `BrowserView`) maintains its own independent `webContents`. Calling `view.webContents.capturePage()` captures **only that view's rendered content**, not the parent window or sibling views. This means you can embed the third-party educational app in a dedicated `WebContentsView` and capture it in isolation — no need for coordinate math or crop operations.

The returned `NativeImage` supports `toBitmap()` (raw BGRA buffer), `toPNG()`, `toJPEG(quality)`, and `toDataURL()`. For ML pipelines, `nativeImage.resize({width: 224, height: 224}).getBitmap()` is the fastest path: `getBitmap()` returns a shared-pointer buffer (**zero-copy**) of raw BGRA pixel data. Capture is asynchronous, does not trigger reflow, and respects device pixel ratio on HiDPI displays.

An alternative for continuous monitoring is **offscreen rendering**: setting `webPreferences: { offscreen: true }` causes the `webContents` to emit `paint` events with each composited frame as a `NativeImage`. Combined with `setFrameRate(1)`, this provides a steady **1 fps** capture stream with minimal overhead. The `useSharedTexture` option enables GPU-backed shared texture handles for near-zero-copy frame access.

### Chrome Extension — `chrome.tabCapture`

`chrome.tabCapture.capture()` returns a live `MediaStream` of the entire visible tab. It cannot natively scope to a sub-region — you must combine it with Region Capture or Element Capture (detailed in Question 2) to isolate the iframe content. The stream includes both video and audio tracks at the tab's native resolution.

**Managed device behavior is the key question.** A force-installed extension (deployed via Google Admin Console → Force Install, or the `ExtensionInstallForcelist` enterprise policy) **can bypass the user gesture requirement** for `tabCapture`. This is the primary mechanism for zero-interaction capture on managed Chromebooks. However, Chrome always displays a **blue border around the captured tab** and a sharing indicator badge — this visual indicator is hardcoded and **cannot be suppressed** via any enterprise policy.

In Manifest V3 architecture, `capture()` runs only in foreground contexts (popup, side panel). The preferred MV3 pattern uses `getMediaStreamId()` in the service worker, passes the stream ID to an offscreen document via `chrome.runtime.sendMessage`, and calls `navigator.mediaDevices.getUserMedia()` in the offscreen document with `chromeMediaSource: "tab"`. The offscreen document (created via `chrome.offscreen.createDocument` with reason `USER_MEDIA`) persists independently of the service worker lifecycle.

Relevant enterprise policies for controlling capture behavior:

- **`TabCaptureAllowedByOrigins`** — allowlists specific origins for tab capture, overriding broader `ScreenCaptureAllowed` settings
- **`ScreenCaptureWithoutGestureAllowedForOrigins`** — permits `getDisplayMedia()` calls without user gesture for listed origins (applies to web APIs, not the extension API directly)
- **`DisplayCapturePermissionsPolicyEnabled`** — when set to `false`, bypasses the `display-capture` Permissions-Policy requirement, relevant since the parent page sets `Permissions-Policy: display-capture=()`
- **`ExtensionInstallForcelist`** — the primary lever: force-installed extensions gain elevated gesture-bypass privileges

### Web (standard) — `getDisplayMedia()` with `preferCurrentTab`

`navigator.mediaDevices.getDisplayMedia({preferCurrentTab: true})` returns a `MediaStream` after the user approves a simplified Allow/Cancel dialog that pre-selects the current tab. **There is no enterprise policy to auto-approve this prompt.** Per the W3C spec, `getDisplayMedia()` permission "cannot be persisted for reuse" — the user must consent every time. The closest policy, `GetDisplayMediaSetSelectAllScreensAllowedForUrls`, applies only to the multi-screen `getAllScreensMedia()` API, not standard tab capture.

A persistent **blue sharing border** and **"Sharing tab" banner** appear whenever capture is active. These indicators are a deliberate security feature with no override mechanism. The `selfBrowserSurface: 'include'` constraint must be set to allow self-capture (capturing the tab that initiated the call), as Chrome may default to excluding the current tab from the picker.

### Comparison table

| Dimension | Electron `capturePage()` | Chrome Ext `tabCapture` | Web `getDisplayMedia` |
|---|---|---|---|
| **API** | `webContents.capturePage([rect])` | `chrome.tabCapture.capture()` / `getMediaStreamId()` | `navigator.mediaDevices.getDisplayMedia({preferCurrentTab: true})` |
| **Platform** | Windows, macOS, Linux (desktop) | Chrome/Edge 71+, ChromeOS | Chrome/Edge 72+, ChromeOS (non-standard `preferCurrentTab` Chrome 94+) |
| **Permission prompt** | None — Electron has full control | User gesture required (bypassed when force-installed) | Always shows Allow/Cancel dialog |
| **Managed device bypass** | N/A | Yes — force-install via `ExtensionInstallForcelist` | No auto-approve policy exists |
| **Visible indicator** | None | Blue border + sharing badge (cannot suppress) | Blue border + "Sharing tab" banner (cannot suppress) |
| **Output format** | `NativeImage` (PNG/JPEG/raw BGRA bitmap) | `MediaStream` (live video + audio tracks) | `MediaStream` (live video track, optional audio) |
| **Captures what** | Specific `WebContentsView` or full window viewport | Entire visible tab | Entire visible tab (current tab pre-selected) |
| **Sub-region scoping** | Native `rect` parameter | Requires Region Capture / Element Capture | Requires Region Capture / Element Capture |
| **Content leakage** | Zero — captures only targeted view | Tab-only, no desktop or other tabs | Tab-only, no desktop or other tabs |
| **Cross-origin iframe content** | Captured (same renderer process) | Captured (composited tab output) | Captured (composited tab output) |

---

## Question 2: Self-Capture, Region Capture, and Element Capture status

### `getViewportMedia()` remains unimplemented

The Self-Capture API (`getViewportMedia()`) exists only as a **W3C Working Draft** published by the Web Real-Time Communications Working Group. The spec at `w3c.github.io/mediacapture-viewport/` explicitly states "this document is not complete." **No browser has shipped an implementation.** As of September 2025, the AddPipe browser compatibility tracker confirmed zero implementations across Chrome, Firefox, Safari, and Edge. No origin trial has been conducted for `getViewportMedia()` specifically — the earlier `getCurrentBrowsingContextMedia()` concept evolved into the `preferCurrentTab` option on `getDisplayMedia()` rather than becoming `getViewportMedia()`.

The spec requires cross-origin isolation (COOP/COEP headers), a `viewport-capture` Permissions-Policy, transient user activation, and a permission prompt that **cannot be persisted**. For ChatBridge, this API is not a viable path in 2026. The practical substitute is `getDisplayMedia({preferCurrentTab: true})` combined with Region Capture or Element Capture.

### Region Capture shipped in Chrome 104 and crops to an element's bounding box

Region Capture provides `CropTarget.fromElement(element)` and `track.cropTo(cropTarget)`. It spatially crops a tab-capture video track to the bounding box of a target DOM element. **Shipped stable since Chrome 104 (August 2022)**, it works on all desktop platforms including **ChromeOS**.

For ChatBridge, you would call `CropTarget.fromElement(iframeElement)` on the iframe hosting the educational app, then `track.cropTo(cropTarget)` on the `getDisplayMedia` video track. The cropped stream contains only the iframe's bounding rectangle. However, Region Capture has an important limitation: **occluding elements are included in the capture**. If a modal, tooltip, or overlay from the parent page visually covers part of the iframe, those pixels appear in the cropped output. The crop is purely geometric — it knows nothing about z-index or stacking contexts. No additional permissions or user gestures are required beyond the initial `getDisplayMedia()` call.

### Element Capture shipped in Chrome 132 and isolates a DOM subtree

Element Capture (`RestrictionTarget.fromElement(element)` and `track.restrictTo(target)`) is the more powerful successor, **shipped in Chrome 132 (January 2025)** on all desktop platforms including **ChromeOS**. Unlike Region Capture's spatial crop, Element Capture restricts output to **only pixels rendered by the target element and its DOM descendants**, excluding both occluding content (overlays on top) and occluded content (elements behind). This is the ideal API for isolating the iframe's rendered educational app content.

The target element must form its own stacking context (apply `isolation: isolate` in CSS) and have `transform-style: flat`. Uses a separate token type (`RestrictionTarget` vs `CropTarget`) to prevent accidental capability escalation. Currently operates on `getDisplayMedia({preferCurrentTab: true})` tracks, though the long-term plan ties it to `getViewportMedia()` once that API ships.

### Summary of capture-scoping APIs

| API | Status | Chrome version | ChromeOS | Occlusion handling | Extra permissions |
|---|---|---|---|---|---|
| `getViewportMedia()` | W3C Working Draft, **not implemented** | N/A | N/A | N/A | Would require prompt per spec |
| Region Capture `cropTo()` | **Stable** | 104 (Aug 2022) | **Yes** | Occluding pixels **included** | None beyond initial `getDisplayMedia` |
| Element Capture `restrictTo()` | **Stable** | 132 (Jan 2025) | **Yes** | Occluding pixels **excluded** | None beyond initial `getDisplayMedia` |
| `preferCurrentTab` | **Stable (non-standard)** | 94 (Sep 2021) | **Yes** | N/A (full tab) | User prompt every time |

**For ChatBridge, the recommended combination is**: `getDisplayMedia({preferCurrentTab: true, selfBrowserSurface: 'include'})` → `track.restrictTo(RestrictionTarget.fromElement(iframeEl))`. This captures only the iframe's rendered content, excludes any parent-page overlays, and works on managed Chromebooks today. The unavoidable cost is the initial user prompt and persistent sharing indicator.

---

## Question 3: From captured frame to 224×224 ML tensor

### MediaStream-based APIs — four paths from stream to pixel data

All web-based capture APIs (`getDisplayMedia`, `tabCapture`) produce a `MediaStream`. Extracting individual frames for ML classification has four approaches with distinct performance profiles:

**`MediaStreamTrackProcessor` + `VideoFrame`** is the recommended modern path (Chrome 94+). It exposes the video track as a `ReadableStream` of `VideoFrame` objects, works **entirely off the main thread** in a Web Worker, and supports backpressure so unread frames are automatically dropped. Each `VideoFrame` is GPU-backed and transferable. For periodic capture (every 2 seconds), read one frame, process it, close it, then wait — the `ReadableStream` handles buffer management. Estimated per-frame extraction cost on a low-end Chromebook: **8–20 ms**.

**`ImageCapture.grabFrame()`** returns an `ImageBitmap` directly from the track without needing a `<video>` element. Simpler than `MediaStreamTrackProcessor` but **main-thread only** and Chrome-specific. Per-frame cost: **10–30 ms** on a low-end Chromebook.

**`<video>` element + `canvas.drawImage()`** is the universally compatible legacy path. Set `video.srcObject = stream`, then periodically call `ctx.drawImage(video, 0, 0, 224, 224)`. Involves 2–3 memory copies (video decode → canvas → `getImageData` readback). Per-frame cost: **15–40 ms** on a low-end Chromebook. Main-thread only.

**`createImageBitmap()` with resize options** provides async, potentially GPU-accelerated resizing: `createImageBitmap(videoFrame, {resizeWidth: 224, resizeHeight: 224, resizeQuality: 'low'})`. Works in Workers. This is the optimal resize step regardless of which extraction method feeds it.

### The optimal pipeline for each deployment surface

**Electron (Pipeline D — fastest, simplest)**:
```
capturePage() → NativeImage.resize({width:224, height:224})
→ getBitmap() [zero-copy BGRA buffer]
→ BGRA→RGB Float32Array loop → new ort.Tensor('float32', data, [1,3,224,224])
```
One memory copy total (the BGRA→RGB conversion). `getBitmap()` returns a shared pointer — no allocation. `resize()` is a native C++ operation, faster than any JS canvas path. **Estimated end-to-end: 5–15 ms** on a typical machine. This path avoids MediaStream overhead entirely.

**Chrome Extension / Web (Pipeline B — recommended for Chromebooks)**:
```
getDisplayMedia/tabCapture → MediaStreamTrackProcessor (in Worker)
→ reader.read() → VideoFrame
→ createImageBitmap(frame, {resizeWidth:224, resizeHeight:224})
→ OffscreenCanvas.getContext('2d').drawImage(bitmap, 0, 0)
→ getImageData(0, 0, 224, 224)
→ RGBA→RGB Float32Array with normalization
→ new ort.Tensor() or tf.browser.fromPixels()
```
Two memory copies (VideoFrame → ImageBitmap resize → getImageData readback). Runs **entirely off the main thread**, keeping the educational app's UI responsive. **Estimated end-to-end: 8–20 ms** on a low-end Chromebook.

**WebGPU zero-copy path (Pipeline C — future-optimal)**:
```
MediaStreamTrackProcessor → VideoFrame
→ copyTo WebGPU texture → GPU resize compute shader
→ ort.Tensor.fromGpuBuffer() → session.run() [all on GPU]
```
Zero CPU-side copies if the entire pipeline stays on GPU. ONNX Runtime Web's WebGPU execution provider supports `Tensor.fromGpuBuffer()` for direct GPU tensor creation. WebGPU is available on ChromeOS since Chrome 113. This path is optimal when the classification model also runs on WebGPU, avoiding all GPU↔CPU round-trips.

### TensorFlow.js and ONNX Runtime Web tensor creation specifics

`tf.browser.fromPixels(canvas)` with the **WebGL backend** uploads pixels directly to a WebGL texture via `texImage2D` — near-instant on Chrome. With the **WASM backend**, it falls back to `canvas.getContext('2d').getImageData()`, adding ~11 ms for a FullHD source (though this is negligible at 224×224). Setting `tf.env().set('CANVAS2D_WILL_READ_FREQUENTLY', true)` improves `getImageData` performance by switching Chrome to a software-backed canvas that avoids GPU readback stalls.

For ONNX Runtime Web, the standard path extracts `ImageData` from a canvas, then converts RGBA HWC layout to RGB CHW `Float32Array` with normalization (mean subtraction, standard deviation division) in a single loop. The newer `ort.Tensor.fromImage(imageData)` API handles this conversion internally. Both frameworks produce a **~600 KB** tensor for a single 224×224×3 float32 input.

### Memory and performance budget on a 4 GB ARM Chromebook

A full-tab `MediaStream` at typical Chromebook resolution (**1366×768**) consumes **~4.2 MB per raw RGBA frame** in GPU memory. Chrome's compositor manages internal buffering; the `MediaStreamTrackProcessor` maintains a circular buffer of ~3–5 frames (**12–21 MB GPU memory**). After resize to 224×224, each frame drops to **~200 KB** (RGBA) and the final float32 tensor is **~600 KB**.

At **0.5 fps** (one capture every 2 seconds), capture overhead is negligible — under **1% CPU time**. The dominant cost is ML inference itself. On ARM Chromebooks (MediaTek Kompanio 520/MT8183), a MobileNet-class classifier takes **50–150 ms** per inference with TF.js WASM backend (ARM NEON SIMD). On newer ARM chips (Kompanio Ultra/MT8196, shipping 2025+), performance approaches or exceeds Intel Celeron N-series. A critical detail: TF.js on native ARM Chrome runs inference in **~35 ms total** (preprocessing + inference), versus **~100 ms** under x86 emulation on the same hardware — native ARM binary support matters significantly.

Throttling the MediaStream to 0.5 fps via `track.applyConstraints({frameRate: {max: 0.5}})` is unreliable for screen-capture streams. The better approach: let the stream run at its natural content-driven rate, use `MediaStreamTrackProcessor`, and simply read one frame every 2 seconds — the `ReadableStream`'s backpressure mechanism automatically drops intermediate frames without CPU or memory cost.

---

## Conclusion

The three deployment surfaces yield a clear hierarchy for content moderation capture. **Electron is the most capable**: `webContents.capturePage()` provides isolated, prompt-free, indicator-free snapshots of individual embedded views with native resize and zero-copy bitmap access. **Chrome Extension with `tabCapture`** is the practical choice for managed Chromebooks: force-installation via enterprise policy eliminates user gesture requirements, though the blue sharing border is unavoidable. Combined with **Element Capture** (`restrictTo()`, stable since Chrome 132), the extension path can isolate iframe content and exclude parent-page overlays.

The pure web path is the most constrained — `getDisplayMedia()` always requires an explicit user prompt with no enterprise override, and `getViewportMedia()` remains unimplemented. For a managed Chromebook fleet, the Chrome Extension deployed via Google Admin Console force-install is the strongest approach, using `tabCapture` → Element Capture → `MediaStreamTrackProcessor` in a Worker → `createImageBitmap` resize → ONNX Runtime Web inference. This pipeline runs entirely off the main thread, processes each frame in under 20 ms on low-end hardware, and adds under 1% CPU overhead at a 2-second sampling interval. The total memory footprint — stream buffers plus tensor — stays comfortably under **25 MB**, well within a 4 GB Chromebook's budget.