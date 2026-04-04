# On-device ML models and browser runtimes for ChatBridge content moderation

**No single open-source model covers the full K-12 safety spectrum for in-browser deployment.** NSFWJS is the only battle-tested, browser-native classifier that fits ChatBridge's ARM Chromebook constraints, but it detects only nudity and sexual content. Violence, weapons, hate symbols, self-harm, and drugs require custom model development — most likely a shared MobileNet-v2 backbone with multiple lightweight classification heads. For the runtime, TensorFlow.js with WASM SIMD + multi-threading is **3.75× faster** than ONNX Runtime Web on MobileNet-class models and is the only option that reliably meets the 150ms inference budget on a Kompanio 520.

---

## Question 4: Pre-trained classifiers mapped against K-12 requirements

### NSFW models cover nudity well but nothing else

The open-source NSFW detection landscape is mature but narrow. Every model focuses exclusively on nudity and sexual content, leaving six of the seven K-12 categories uncovered.

**NSFWJS** (infinitered/nsfwjs) is the clear frontrunner for ChatBridge. It was purpose-built for in-browser inference with a MobileNet-v2 backbone at **224×224** native input, ships as a TF.js package at just **~2.6 MB** quantized, and outputs five classes: Drawing, Hentai, Neutral, Porn, and Sexy. It achieves **~93% accuracy**, carries an MIT license, has **8,800+ GitHub stars**, and remains actively maintained. Inference on modern browsers takes 30–50 ms, well within budget even on ARM.

**Yahoo's OpenNSFW** uses a thin ResNet-50 (1-by-2) backbone producing binary SFW/NSFW scores. At ~24 MB FP32, it's heavier than NSFWJS. Browser readiness is poor — direct TF.js conversion has failed historically due to unsupported ops, though an ONNX path via `opennsfw-standalone` exists. The original repo was archived in October 2019. A Keras 3 reimplementation (`bhky/opennsfw2`, v0.15.2) keeps it alive for Python workflows.

**Falconsai/nsfw_image_detection** fine-tunes ViT-base-patch16-224 and achieves **98% accuracy** — but at **~346 MB** FP32 (86M parameters), it is completely infeasible for a 4 GB Chromebook. **AdamCodd/vit-base-nsfw-detector** is similarly oversized. **Marqo/nsfw-image-detection-384** uses a ViT-Tiny backbone (5.7M parameters, ~22 MB) with **98.56% accuracy** and an Apache-2.0 license, making it the most accurate lightweight option — though its native 384×384 resolution requires resizing and it lacks a TF.js port.

**NudeNet v3** takes a detection-based approach using YOLOv8-nano, outputting bounding boxes for 18 body-part labels at 320×320 input. The 320n ONNX model is ~12 MB. However, object detection + NMS is heavier than classification, the AGPL-3.0 license is restrictive, and maintenance appears inactive.

### Model comparison table: NSFW classifiers

| Model | Backbone | Input | Categories | Size (smallest) | License | Browser-ready | Feasible? |
|---|---|---|---|---|---|---|---|
| **NSFWJS MobileNetV2** | MobileNet-v2 | 224×224 | 5-class (Porn/Sexy/Hentai/Drawing/Neutral) | **2.6 MB** (TF.js quant) | MIT | ✅ TF.js native | **✅ Best fit** |
| Yahoo OpenNSFW | ResNet-50 1×2 | 224×224 | Binary (SFW/NSFW) | ~24 MB | BSD-2 | ⚠️ ONNX only | ⚠️ Heavy |
| Falconsai/nsfw | ViT-base-patch16 | 224×224 | Binary (normal/nsfw) | ~346 MB | Unclear | ⚠️ Transformers.js | ❌ Too large |
| NudeNet 320n | YOLOv8-nano | 320×320 | 18 body-part labels | ~12 MB ONNX | AGPL-3.0 | ⚠️ ONNX Web | ⚠️ Detection overhead |
| Marqo nsfw-384 | ViT-Tiny-patch16 | 384×384 | Binary (NSFW/SFW) | ~22 MB | Apache-2.0 | ❌ Needs conversion | ⚠️ Resolution mismatch |
| LAION-SAFETY | EfficientNet-V2-B2 | 260×260 | 5-class (same as NSFWJS) | ~30 MB | Unclear | ❌ Needs conversion | ⚠️ Needs work |

### Violence and weapons detection requires fine-tuning on a lightweight backbone

No off-the-shelf, browser-ready violence or weapons classifier exists. However, **MobileNet-v2 fine-tuned on violence datasets** is a proven approach in academic literature, achieving **97% accuracy** on the Real Life Violence Situations Dataset (RLVSD) as a single-frame binary classifier. At **~3.5 MB** INT8 quantized with 224×224 input, this architecture would run under 100 ms on ARM WASM — well within the inference budget.

YOLO-nano models (YOLOv8n at ~13 MB ONNX, YOLO11n at ~6 MB) can detect weapons via bounding boxes but face a speed problem. At native 640×640 resolution, YOLOv8n would take **300–800+ ms** in browser WASM on ARM — far too slow. Downscaling to 224×224 brings inference into the 100–250 ms range but degrades detection accuracy significantly. **Classification beats detection for this use case**: a MobileNet-v2 binary classifier answering "does this frame contain violence/weapons?" is faster, smaller, and sufficient when the goal is flagging rather than localizing.

Key training datasets are available: **RLVSD** (2,000 videos), **Hockey Fights** (1,000 clips), **RWF-2000** (2,000 clips), and multiple **Roboflow weapons datasets** (1,000–5,000+ annotated images for firearms and knives). Fine-tuning a MobileNet-v2 backbone on these datasets and exporting to TF.js or ONNX is a straightforward ML engineering task.

### Hate symbol detection is the hardest gap — no open-source solution exists

This is the most significant coverage gap in the entire pipeline. **No open-source, pre-trained, downloadable hate symbol classifier exists.** The situation breaks down as follows:

Commercial APIs handle hate symbols well — **Hive AI** detects Nazi/KKK/Confederate symbols, **SightEngine** identifies swastikas (distinguishing Buddhist from Nazi variants), SS bolts, Sonnenrad, and Confederate flags, and **Clarifai** offers a hate-symbol-detection model for swastikas and Confederate flags. But all are cloud-only, exactly the deployment model ChatBridge rejected.

The ADL's **HateVision** tool, trained on 39 extremist symbols, detected nearly a million instances in a Steam platform analysis — but it is proprietary to the ADL's Center on Extremism and not publicly released. Academic efforts are minimal: a Haar cascade trained on ~400 swastika images, a YOLOv3 swastika detector with similarly tiny training data, and a Roboflow dataset of just 55 images.

Building a custom hate symbol classifier would require **3–6 months** of effort: curating a dataset of 2,000–10,000 images covering the 10–15 highest-priority symbols (swastikas, Confederate flags, SS bolts, Sonnenrad, Celtic crosses, KKK imagery, extremist Pepe variants), including hard negatives (Buddhist swastikas, standard crosses), and training a MobileNet-v2 classifier. The architecture would be lightweight (~3.5 MB INT8) and browser-compatible.

### Multi-category classifiers exist but none fit browser constraints

Several models cover multiple safety categories simultaneously, but all are orders of magnitude too large for in-browser ARM inference:

- **LlamaGuard 4** (Meta, 12B parameters): Covers 14 safety categories with native image understanding. Requires GPU. Far too large.
- **ShieldGemma 2** (Google, 4B parameters): Covers sexually explicit, violence/gore, and dangerous content for images. State-of-the-art quality. Requires GPU.
- **Q16 Classifier**: Uses CLIP backbone (~151–428 MB) with learned prompts. Detects broad "inappropriate content" including violence and hate, but explicitly *excludes* nudity. CLIP backbone is too large for browser.
- **Multi-Headed Safety Classifier** (Qu et al., "Unsafe Diffusion"): CLIP backbone + 5 MLP heads for sexually explicit, violent, disturbing, hateful, and political content. Architecturally closest to the ideal approach, but trained on only 800 images and the CLIP backbone is too heavy.

Industry practice confirms that **multi-headed architectures with shared backbones** are the dominant production pattern. Hive AI uses separate heads for NSFW, guns, violence, drugs, and hate on a shared feature extractor. Clarifai documents using ensemble category-specific models. This approach maps directly to ChatBridge's needs.

### Coverage gap analysis and recommended architecture

| K-12 Category | Pre-trained coverage | Recommended path |
|---|---|---|
| Nudity / sexual content | ✅ **Strong** — NSFWJS (5-class, browser-native) | Use NSFWJS directly or adopt its training approach |
| Violence / gore | ⚠️ **Datasets available**, no browser model | Fine-tune MobileNet-v2 on RLVSD + UCF Crime |
| Weapons | ⚠️ **Datasets available**, no browser model | Fine-tune MobileNet-v2 on Roboflow weapons data |
| Hate symbols | ❌ **No model, no public dataset** | Custom dataset curation + MobileNet-v2 training (3–6 months) |
| Self-harm / suicide | ❌ **No lightweight model** | Custom training needed; limited public datasets |
| Drug / alcohol imagery | ❌ **No lightweight model** | Fine-tune on ImageNet subclasses + custom data |
| Text profanity in images | ⚠️ **OCR exists but too slow** | Async Tesseract.js in Web Worker (~1–3s, non-blocking) |

**The recommended architecture is a single MobileNet-v2 (or v3) shared backbone with multiple lightweight MLP classification heads** — one per safety category. A single forward pass through the backbone (~35 ms on native ARM Chrome) produces feature vectors that feed 3–5 small MLP heads (~1–2 ms each), yielding a total inference time of **~40–50 ms**. This is far more efficient than running separate models sequentially and fits the 150ms budget with wide margin. The NSFWJS training approach validates this backbone choice. Export to TF.js format for browser deployment. Estimated total model size: **15–20 MB**.

For text profanity, Tesseract.js (v6.0.0, Apache-2.0) at ~15 MB can run asynchronously in a Web Worker. At 224×224 resolution, OCR takes ~0.5–1.5 seconds — too slow for the synchronous 150 ms pipeline, but acceptable as a background check that reports results with a few seconds' delay.

---

## Question 6: TF.js vs ONNX Runtime Web on ARM Chromebooks

### TF.js is 3.75× faster on MobileNet thanks to XNNPACK

The most important benchmark: on a 2019 MacBook Pro, **TF.js WASM (SIMD + multi-threading) runs MobileNet-v2 in ~12 ms** while **ONNX Runtime Web WASM takes ~45 ms** — a **3.75× performance gap**. This advantage comes from TF.js's use of **XNNPACK**, Google's library with hand-tuned WASM SIMD microkernels specifically optimized for depthwise separable convolutions, the core operation in MobileNet architectures.

Extrapolating to the Kompanio 520 (Cortex-A76 big cores at 2 GHz, roughly 3–5× slower than the MacBook Pro's i7 for WASM workloads):

| Runtime | MacBook Pro (measured) | Kompanio 520 (estimated) | Meets 150 ms? |
|---|---|---|---|
| **TF.js WASM SIMD + 2 threads** | **~12 ms** | **~36–60 ms** | **✅ Yes, with wide margin** |
| ORT Web WASM SIMD + 2 threads | ~45 ms | ~135–225 ms | ⚠️ Borderline / likely fails |
| ORT Web WebGPU (desktop GPU) | ~6.4 ms FP16 | N/A (Mali-G52 too weak) | — |

ONNX Runtime Web's own blog documents a **3.4× total speedup** with SIMD + 2 threads over baseline WASM, but the absolute numbers start from a higher baseline than TF.js. ORT Web would need INT8 quantized inference to close the gap.

### WASM SIMD is universally available; relaxed SIMD adds marginal gains

**Fixed-width WASM SIMD** (128-bit) has been enabled by default since Chrome 91 (May 2021) and maps nearly 1:1 to ARM NEON instructions. All current Kompanio 520 Chromebooks run Chrome versions well above 91, so SIMD is guaranteed. Both runtimes ship SIMD-enabled WASM binaries. The speedup over plain WASM is **2–3×**.

**Relaxed SIMD** (Chrome 114+) offers additional performance through instructions like fused multiply-add and integer dot products. ONNX Runtime Web explicitly supports it via `ort.env.wasm.simd = "relaxed"` and has shown ~1.15× improvement for quantized models using ARM SDOT instructions. TF.js does not expose a relaxed SIMD flag, but XNNPACK may use relaxed SIMD internally in newer builds. On ARM, relaxed SIMD provides modest gains (up to **26–50%** for specific operations like quasi-FMA) rather than transformative speedups.

### Multi-threading helps but 2 threads is the ceiling

Both runtimes use SharedArrayBuffer + Web Workers for WASM multi-threading, which requires **cross-origin isolation** (COOP + COEP headers). For Chrome extensions, these are set in the manifest.json v3 configuration. ChromeOS supports this natively with no special flags.

On the Kompanio 520's two Cortex-A76 big cores, **setting thread count to 2 is optimal**. Additional threads would spill onto the six A55 efficiency cores (~40–50% slower per core), adding synchronization overhead without proportional benefit. At MobileNet scale (~300M multiply-adds), TF.js data shows multi-threading provides **1.8–2.9× speedup** on desktop; on a 2-core device, expect a more modest **1.5–1.8×** gain. This is still meaningful — it's the difference between ~60 ms and ~100 ms on the Kompanio 520.

One caveat: SharedArrayBuffer may not propagate into sandboxed iframe contexts within Chrome extensions. ChatBridge's architecture (sandboxed iframes for third-party apps) needs careful testing to ensure the monitoring code runs in an extension context that supports cross-origin isolation, not inside the sandboxed iframe itself.

### WebGPU is not worth pursuing on target hardware

The Kompanio 520's **Mali-G52 MC2** GPU has just 2 shader cores on the Bifrost architecture. While it supports Vulkan 1.0/1.1 (and thus WebGPU via Chrome 113+), this GPU is designed for basic 3D rendering, not ML compute. GPU dispatch overhead would dominate at MobileNet scale. **WASM SIMD + threads will be faster than WebGPU on the Mali-G52.**

On desktop GPUs, ORT Web WebGPU achieves ~6.4 ms for MobileNet-v2 FP16, and TF.js WebGPU similarly accelerates inference by 5–10× over WASM. But these numbers come from powerful discrete or integrated GPUs. WebGPU should be treated as an **optional fast path** that ChatBridge detects and enables only on newer Chromebooks with capable GPUs (e.g., those with Intel Xe or better ARM Mali GPUs), never as the baseline.

### Model format, quantization, and memory differ meaningfully

**MobileNet-v2 model sizes across formats:**

| Format | Size | Notes |
|---|---|---|
| FP32 (either runtime) | ~14 MB | Baseline |
| FP16 ONNX | ~7 MB | 2× reduction |
| INT8 ONNX (uint8 weights + activations) | ~3.5–4.4 MB | True quantized inference in ORT Web |
| TF.js uint8 quantized | ~3.5 MB download | **FP32 at runtime** — quantization reduces download only |

This is a critical distinction. **ONNX Runtime Web supports true INT8 inference** — quantized weights stay quantized during computation, yielding both size and speed benefits. TF.js's quantization is download-only: "as soon as we load into memory we need to use Float 32 again," per a W3C working group presentation. For ChatBridge, this means ORT Web could theoretically run faster with INT8 models, partially offsetting its XNNPACK disadvantage — though no published benchmark confirms this closes the 3.75× gap.

**Conversion pipelines differ in complexity.** PyTorch → ONNX is a single `torch.onnx.export()` call. PyTorch → TF.js requires an intermediate step (PyTorch → ONNX → TensorFlow → TF.js, or PyTorch → TF SavedModel → TF.js). If the team trains models in PyTorch, the ONNX path is simpler. If using TensorFlow/Keras (as NSFWJS does), TF.js conversion via `tensorflowjs_converter` is direct and well-supported.

**Memory footprint favors TF.js.** The WASM binary is smaller (~3–5 MB vs. ~8–20 MB for ORT Web's default build). Total estimated memory including model weights, intermediate tensors, and runtime overhead: **~75–100 MB for TF.js** vs. **~100–360 MB for ORT Web**. On a 4 GB Chromebook where Chrome itself consumes 1–2 GB, both fit, but TF.js leaves more headroom for the multi-head model architecture ChatBridge needs.

### Practical recommendation: TF.js WASM is the right choice

**TensorFlow.js with the WASM SIMD + multi-threading backend should be ChatBridge's primary runtime.** The rationale is straightforward:

1. **Speed**: Estimated **36–60 ms** on Kompanio 520 for MobileNet-v2, meeting the 150 ms budget with 60–75% headroom — enough to run the shared backbone plus multiple classification heads in a single pass.
2. **Memory**: ~75–100 MB total footprint leaves ample room on 4 GB devices.
3. **Ecosystem**: NSFWJS (the best-fit NSFW model) is already a TF.js package. Building additional heads on the same MobileNet-v2 backbone stays within the TF.js ecosystem.
4. **Maturity**: Google-backed since 2018, millions of weekly npm downloads, extensive documentation for Chrome extensions.
5. **Simplicity**: Single runtime, single model format, single optimization path.

**Choose ONNX Runtime Web instead only if**: the team commits to PyTorch for all model training and true INT8 quantized inference proves necessary to meet latency targets — a scenario that should be validated with hardware benchmarks before making the architectural switch.

The recommended TF.js configuration for Kompanio 520:

- Backend: `wasm` (not `webgl` or `webgpu`)
- Threads: `setThreadsCount(2)` to target the two A76 big cores
- Model weights: FP32 or float16 quantization (avoid uint8 for MobileNet — significant accuracy degradation in TF.js)
- Fallback: detect SIMD/threading support at startup; degrade gracefully to single-threaded WASM
- Caching: leverage browser auto-caching of TF.js 4 MB weight shards; pre-warm model on extension startup

## Conclusion

ChatBridge faces a classic build-vs-buy gap. Nudity detection is solved — NSFWJS at 2.6 MB delivers 93% accuracy in a browser-native package. Violence and weapons classifiers can be built within weeks by fine-tuning MobileNet-v2 on available datasets (RLVSD, Roboflow). Hate symbol detection is the true hard problem, requiring months of dataset curation from scratch since no public model or training dataset exists.

The architectural answer is a **shared MobileNet-v2 backbone with category-specific classification heads**, running on TF.js WASM at an estimated 40–50 ms total inference time on the Kompanio 520. This leaves 100 ms of budget headroom for the capture-to-tensor pipeline and any future model additions. Text-based profanity detection should run asynchronously via Tesseract.js in a Web Worker, accepting 1–3 second latency as a background process rather than a blocking gate.

The runtime decision is clear: TF.js's XNNPACK-powered WASM backend is nearly 4× faster than ONNX Runtime Web for the exact model family ChatBridge needs. That performance gap is the difference between comfortable headroom and missed deadlines on every frame.