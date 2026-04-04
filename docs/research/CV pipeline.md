# Adaptive performance, action tiers, and COPPA compliance for ChatBridge's CV pipeline

ChatBridge's on-device content moderation system can safely operate across the full Chromebook spectrum by combining a **four-tier adaptive capture strategy** (500ms–2s intervals plus event-driven fallback), a **four-tier graduated action framework** with per-category threshold tuning, and an architecture that satisfies COPPA ephemeral treatment requirements—with one critical caveat around Illinois BIPA. The system's strongest legal posture rests on three architectural facts: frames capture app UI rather than student faces, pixel data never leaves memory, and session identifiers are opaque and auto-expiring. Below is a detailed technical and legal analysis across all three research questions.

---

## Question 7: Device capability detection works best as a hybrid

The choice between `navigator` heuristics and a first-frame benchmark is a false binary. Neither approach alone is reliable on managed Chromebooks, but together they create a robust capability-detection pipeline.

**`navigator.hardwareConcurrency`** returns logical processor count and is supported in Chrome since version 37, but Chrome may report a lower number than actual cores, and a known Chromium issue (#324445648) documents unexplained value changes. On Kompanio 520 (8-core big.LITTLE), it should return 8 but cannot be guaranteed under enterprise management policies. **`navigator.deviceMemory`** is worse: it rounds to the nearest power of 2, caps at 8, and Chrome's `ReduceDeviceMemoryEnabled` feature flag **hardcodes the return value to 8.0** regardless of actual RAM, rendering it useless on affected builds.

A first-frame benchmark avoids these API quirks but introduces its own failure mode: **JIT warmup skew**. TF.js documentation explicitly warns that first inference runs "several times slower than subsequent inferences"—TF.js GitHub issue #4907 reports 10–20× variance. For WASM SIMD, warmup overhead is lower than WebGL (no shader compilation), but module instantiation still inflates the first call by roughly 2–3×.

**The recommended startup sequence** eliminates both failure modes: (1) read `hardwareConcurrency` + `deviceMemory` for an initial tier guess, (2) run one warmup inference on zeros and discard the result, (3) run three timed inferences and take the median as the actual capability measure, (4) assign the final tier based on measured inference time (overriding heuristics when they disagree), and (5) cache the result in `chrome.storage.local` with weekly recalibration. This approach follows the adaptive loading pattern validated by Google and Facebook at Chrome Dev Summit 2019.

### Four capture tiers matched to device speed

The CPU budget for a background monitoring task should target **≤5% sustained utilization** to remain imperceptible, with 10% as an absolute ceiling. Chrome's Heavy Ads Intervention—which blocks ad frames consuming >60s of CPU in a 30-second window—provides a useful reference: sustained >50% in any frame is "heavy." For a monitoring extension, staying well below this is essential to avoid impacting educational app performance.

The math is straightforward: if the full pipeline (capture + inference + result processing) takes **P milliseconds**, and the target CPU duty cycle is **D%**, then the minimum interval is P / D. On the Kompanio 520 (P ≈ 75ms worst case), a 5% budget yields 1,500ms intervals.

| Tier | Device class | Measured inference | Capture interval | CPU budget | Capture strategy |
|------|-------------|-------------------|-----------------|------------|-----------------|
| **Tier 1** | Low-end ARM (≤4 cores or inference >100ms) | >100ms | **2,000ms** | ~3.75% | Event-driven primary; periodic every 60s as safety net |
| **Tier 2** | Mid-range ARM / Kompanio 520 class | 55–100ms | **1,500ms** | ~5% | Periodic with event-driven boost on navigation |
| **Tier 3** | Mid-range x86 / Celeron-i3 | 30–55ms | **1,000ms** | ~4% | Standard periodic capture |
| **Tier 4** | High-end x86 / i5+ or Ryzen 5+ | <30ms | **500ms** | ~6% | High-frequency periodic |

**Queue buildup prevention** requires a single-slot frame buffer: when a new frame arrives while the worker is busy, overwrite the pending frame. Never queue more than one pending frame. This guarantees bounded memory usage and ensures the system always classifies the most recent content.

### Thermal throttling demands the Compute Pressure API

ARM Chromebooks with passive cooling (fanless designs like most Kompanio 520 devices) throttle aggressively. Typical behavior: **20–40% CPU frequency reduction** under sustained thermal pressure, with big.LITTLE designs potentially migrating workloads entirely to efficiency cores, causing 50%+ performance drops. Internal temperatures rise roughly 12°C above ambient when CPU exceeds 70% utilization for more than 90 seconds.

The **Compute Pressure API** (shipped in Chrome 125, available in Web Workers, confirmed working on ChromeOS) is the primary detection mechanism. It exposes four states—`"nominal"`, `"fair"`, `"serious"`, `"critical"`—with a minimum 1-second sample interval. The adaptation logic maps cleanly:

| Pressure state | Inference time signal | Action |
|---------------|----------------------|--------|
| `"nominal"` or `"fair"` | Inference ≤ 1.2× baseline | Use tier's default interval |
| `"serious"` | Inference > 1.5× baseline | **Double** the capture interval |
| `"critical"` | Inference > 2× baseline | Switch to **event-driven only** (no periodic) |
| — | Inference > 3× baseline | **Pause pipeline** entirely; resume after 30s cooldown check |

As a fallback where the Compute Pressure API is unavailable, maintain an exponential moving average (α=0.2) of inference times and compare against the calibration baseline. The EMA approach detects throttling with a few seconds' lag but requires no special API support.

### Web Worker scheduling and main-thread isolation

**`requestIdleCallback` is NOT available in Web Workers** (MDN explicitly confirms this). The correct alternative is **`scheduler.postTask()`**, which is available in Web Workers since Chrome 94 and supports three priority levels. For inference tasks, use `priority: "background"` to yield to higher-priority work. The newer `scheduler.yield()` (Chrome 125+) allows breaking up long inference post-processing.

Web Workers run on separate threads and do not block main-thread rendering. However, on a 4-core device, a WASM SIMD worker at full utilization competes for CPU time with Chrome's compositor. At the recommended 5% duty cycle on an 8-core Kompanio 520 (75ms work every 1,500ms), the worker occupies one big core intermittently, leaving the main thread ample headroom. At duty cycles above 15%, contention becomes measurable on 4-core devices.

### Event-driven capture closes the gap without burning CPU

A hybrid architecture combines event-driven triggers with a low-frequency periodic safety net. Reliable event sources include `chrome.webNavigation.onCommitted` (fires for iframe navigations with frame ID > 0), MutationObserver on the iframe's `src` attribute (detects programmatic source changes), `document.visibilitychange`, and `chrome.webNavigation.onHistoryStateUpdated` (catches SPA-style routing).

The critical gap in pure event-driven mode is **canvas-rendered content**. Educational games, drawing apps, and interactive simulations change content entirely within a `<canvas>` element without triggering any navigation or DOM events. WebSocket-driven updates and timer-based content rotation similarly produce no observable events from the parent frame.

The recommended hybrid pattern: trigger **immediate capture** on any navigation event, followed by two additional captures at 2s and 5s post-navigation (to catch asynchronously rendered content), then resume the periodic schedule. The periodic safety net runs at reduced frequency—**60s for Tier 1, 30s for Tiers 2–3, 15s for Tier 4**—ensuring canvas-based content changes are eventually caught without significant CPU cost.

---

## Question 8: A four-tier action framework with per-category tuning

### The 0.9 threshold is correct for auto-blocking but dangerously incomplete as the only threshold

A 0.9 confidence threshold is at the aggressive-high end of production practice. **Amazon Rekognition** defaults to 0.50 and recommends testing at 0.70–0.80. **TensorFlow.js's own toxicity classifier** uses 0.9 as its recommended threshold. **Hive AI** (used by Reddit) achieves 90% precision at 90% recall for guns, though only 80% for blood. An AAAI/ICWSM study found that at 0.9, a model achieved **0.96 precision but recall plummeted to 0.02**—meaning 98% of violating content passed through undetected.

For ChatBridge, 0.9 as the sole threshold would create a dangerous blind spot: genuinely harmful content scoring 0.6–0.89 would pass through silently. The system needs lower tiers for flagging and review. This aligns with how every major platform operates—Meta, YouTube, Roblox, and Discord all use graduated response systems with multiple confidence bands.

**Temperature calibration is non-negotiable.** The seminal Guo et al. (2017) paper demonstrated that modern neural networks are systematically overconfident—a raw "0.9 confidence" score from an uncalibrated MobileNet-v2 might represent only 70% true positive rate. Post-training temperature scaling (dividing logits by a learned parameter T) is a single-parameter fix that makes confidence scores approximately match true correctness likelihood. The project's planned focal loss (γ=2, α=0.3) helps with class imbalance but does not fix calibration. Validate with per-category reliability diagrams on held-out K-12 content, targeting **Expected Calibration Error (ECE) < 2%** per category.

### The concrete tier table

The industry standard is a four-tier graduated response. Unlike social media platforms with large human-review teams, ChatBridge has a **teacher-in-the-loop**, which means auto-action thresholds should be higher (a false positive blocks a child's learning activity) and mid-confidence scores should favor notification over blocking.

| Tier | Confidence | Student experience | Teacher dashboard | System action | Circuit breaker impact |
|------|-----------|-------------------|-------------------|--------------|----------------------|
| **T0: Pass** | < 0.30 | None | None | No log | None |
| **T1: Monitor** | 0.30 – 0.60 | None | Aggregate analytics only | Log to analytics; feed EMA | None |
| **T2: Soft flag** | 0.60 – 0.85 | **No disruption** | Real-time notification badge | Log event; increment flag counter | Contributes to HALF_OPEN if 10+ in 15 min |
| **T3: Block + alert** | 0.85 – 0.95 | Generic placeholder ("Content isn't available right now") | Alert with details + override button | Blur/overlay iframe; log | Contributes to OPEN if 5+ in 10 min |
| **T4: Hard block + escalate** | > 0.95 | App disabled for session | Urgent alert; incident created | Block iframe; disable app; log | Immediate OPEN if 3+ in 5 min |

**Per-category threshold adjustments** are essential because false-positive rates and miss severity differ dramatically across categories:

| Category | T2 starts | T3 starts | T4 starts | Rationale |
|----------|----------|----------|----------|-----------|
| Nudity (NSFWJS) | 0.70 | 0.85 | 0.95 | Standard thresholds; NSFWJS is well-calibrated for this domain |
| Violence | 0.65 | 0.85 | 0.95 | Lower T2 for broader monitoring; historical/educational content creates FPs |
| Weapons | 0.70 | **0.90** | **0.97** | Highest auto-block threshold—chess boards, Go stones, pixel art weapons are persistent FP sources |
| Hate symbols | 0.60 | 0.80 | 0.92 | Lower thresholds due to high severity; educational FPs are rarer |
| Self-harm | **0.55** | **0.75** | 0.90 | **Lowest thresholds across all categories**—duty of care demands over-flagging; teacher notification at T2+ always |
| Drugs/alcohol | 0.65 | 0.85 | 0.95 | Moderate thresholds; science content creates occasional FPs |

Three special rules override the table: (1) any CSAM signal above 0.70 triggers immediate hard block, admin escalation, and mandatory reporting—non-overridable under any circumstance; (2) self-harm at T2 or above always triggers teacher notification due to duty of care; (3) pre-approved educational apps on the allowlist receive a **+0.15 threshold boost** for weapons and violence categories only, while new or unknown apps get a **−0.10 threshold reduction** for their first 48 hours.

### Persistent false positives need statistical dampening, not escalation

A chess app consistently scoring 0.4 on "weapons" across 20+ sessions is a systematic false-positive signature, not an emerging threat. The recommended approach uses an exponential moving average (EMA) per app per category: `score_ema = 0.3 × new_score + 0.7 × old_ema`. When the EMA stabilizes below threshold with low variance over sufficient samples (>10 sessions), the system should classify this as a **known false-positive pattern** and suppress escalation. EWMA charts for concept drift detection (Ross et al., 2012) validate this approach for controlling false-positive detection rates.

Conversely, a sudden score jump (chess app normally at 0.4 weapons suddenly hitting 0.85) should be treated as a genuine alert—it may indicate app compromise, content injection, or the student navigating away from the approved content.

### Circuit breaker integration treats content violations as a parallel signal

Content violations feed into the existing CLOSED→OPEN→HALF_OPEN circuit breaker alongside schema validation failures and error rates, not as a replacement. The key differentiator between "app is genuinely unsafe" and "model is confused by this app's visual style" lies in the score distribution: genuinely unsafe apps produce high-confidence scores (>0.9) clustered in time, often across multiple categories, while model confusion produces stable medium scores (0.4–0.6) in a single category with flat EMA trends. Teacher feedback is the definitive tiebreaker.

When the circuit trips to OPEN, it disables the **specific app in that classroom**, not the entire platform. HALF_OPEN allows limited access (one student at a time) for 5 minutes of monitoring. Admin-level FORCED_CLOSED overrides exist for pre-approved apps where the circuit trips due to known FP patterns.

### Teacher overrides operate at three scope levels

| Override level | Who authorizes | Scope | Duration | Constraints |
|---------------|---------------|-------|----------|-------------|
| Session allowlist | Teacher alone | This classroom, this session | Expires with session TTL (1–4 hr) | Max 5 overrides per session |
| App-category adjustment | Teacher + admin co-sign within 24 hr | Per-app, per-category threshold boost | Until revoked or semester end | Cannot reduce thresholds below T2 floor |
| Global allowlist | Admin/IT only | Platform-wide app allowlist | Permanent until annual review | Requires documented review |

CSAM, terrorism, and any content with legal reporting obligations are **never teacher-overridable**. Override abuse is mitigated through rate limiting, anomaly detection on override volume, and monthly audit reports. When a teacher marks a flag as false positive, it creates an immediate session allowlist entry and feeds into the per-app Bayesian prior; after 3+ FP markings for the same app-category combination across different teachers, the system auto-suggests a global allowlist review to the admin.

---

## Question 9: COPPA ephemeral treatment is achievable but has no explicit safe harbor

### The 2025 COPPA rule does not create an "ephemeral data" exception for images

The FTC finalized COPPA Rule amendments on **January 16, 2025** (published April 22, 2025, as 90 FR 16977, effective June 23, 2025). Critically, the final rule **does not create a specific ephemeral-processing exemption for image or video data**. The closest analog is the **audio file exception** at §312.5(c)(9), which permits collecting a child's voice recording without parental consent when the file is "used in responding to a child's specific request" and "deleted immediately after"—but this applies only to audio, not images or screen captures.

However, the threshold question is whether ChatBridge's frame data constitutes "personal information" at all. Under 16 CFR §312.2, personal information includes "a photograph, video, or audio file where such file contains a child's image or voice" (category 8). ChatBridge captures **screen content from educational app iframes**—not webcam or camera feeds. If the frames show only app UI content rather than the child's face or image, category 8 does not apply, making the ephemeral treatment question largely moot for the pixel data itself. If a child's image could theoretically appear (e.g., a video call visible within an iframe), the momentary in-memory processing could technically constitute "collection" under COPPA's broad definition ("gathering of any personal information from a child by any means"). **The FTC has not issued guidance on whether truly ephemeral, in-memory-only processing with immediate discard constitutes "collection."** This is an area of genuine legal uncertainty.

The strongest factual defense rests on COPPA's own definition of "delete" at §312.2: "remove personal information such that it is not maintained in retrievable form and cannot be retrieved in the normal course of business." ChatBridge's architecture—Web Worker in-memory processing, immediate pixel discard, no persistence to disk or network—satisfies this definition by design, since the pixel data is never "maintained in retrievable form" at any point.

### Classification metadata is not personal information under COPPA

The tuple `{appId, timestamp, category, confidence}` contains none of the 11 enumerated categories of personal information under §312.2. It carries no names, addresses, government identifiers, photographs, geolocation, or biometric data. The opaque session ID in Redis (1–4 hour TTL) is **not a "persistent identifier"** under §312.2(7), which requires the ability to "recognize a user over time and across different websites or online services." A short-lived, single-service, auto-expiring session token fails both temporal persistence and cross-service criteria.

The re-identification risk through correlation deserves attention. Under §312.2(11), information becomes personal when "the operator collects online from the child and combines with an identifier." The operative word is **"combines"**—ChatBridge itself must perform the combination. If ChatBridge never receives, stores, or accesses student identity data (Chromebook usernames, Google accounts), it is not combining anything with a student identifier. A school's theoretical ability to correlate timestamps with device-assignment records does not retroactively transform ChatBridge's anonymous logs into personal information, provided ChatBridge contractually prohibits schools from providing student-correlating data.

### FERPA exposure is minimal but requires architectural discipline

Under 34 CFR §99.3, "education records" must be (1) **directly related to a student** and (2) **maintained by an educational agency or institution, or by a party acting for the agency**. Classification logs containing no student identifiers fail prong one—they cannot be linked to any specific student and are therefore not education records.

Even if a school could theoretically correlate session timestamps with Chromebook login sessions, FERPA's de-identification standard (34 CFR §99.31(b)(1)) requires only a "reasonable determination" that identity is not personally identifiable considering "other reasonably available information." ChatBridge should document this analysis formally. As an additional safeguard, the "school official" exception at 34 CFR §99.31(a)(1) permits disclosure to contractors performing institutional services under the school's direct control—ChatBridge qualifies if properly contractualized.

### Illinois BIPA is the highest-risk state law

**BIPA (740 ILCS 14/1 et seq.)** poses the most significant state-level risk. Under §14/10, a "biometric identifier" includes a "scan of hand or face geometry" but explicitly excludes "photographs." The critical legal question is whether a CV classifier extracting features from screen captures constitutes a "scan of face geometry."

Recent case law draws a sharp line: in *Sosa v. Onfido* (N.D. Ill. 2022), the court held that software extracting facial geometry from photos can create biometric identifiers even though photos themselves are excluded. But in *Martell v. X Corp.* (N.D. Ill. 2024), creating a hash of a photo for content safety (PhotoDNA) was **not** a scan of face geometry. In *Zellmer v. Meta* (9th Cir. 2024), "face signatures" that do not reveal geometric information fell outside BIPA's scope.

ChatBridge's system aligns with the *Martell* pattern: it classifies content type (violence, weapons, etc.), not facial geometry. No facial templates, faceprints, or face geometry measurements are created. The key protective measures are: (1) document that the TF.js model classifies content categories without extracting facial features, (2) verify the model architecture contains no face-detection or facial-landmark intermediate layers, and (3) note that all processing is on-device (Apple raised this defense in *Hazlitt v. Apple*, arguing on-device processing should not trigger BIPA, though courts have not definitively resolved this). The **Cothron v. White Castle** ruling (2023 Ill. S. Ct.)—holding each biometric scan constitutes a separate violation at $1,000–$5,000—makes BIPA exposure enormous if the system were found to process facial geometry.

**California's SOPIPA** (Cal. Bus. & Prof. Code §22584) applies to ChatBridge as a K-12 platform but creates low risk given no commercial data use and opaque session IDs. **New York's Ed Law 2-d** (N.Y. Educ. Law §2-d) imposes procedural requirements—a Data Protection Officer, NIST Cybersecurity Framework adoption, a Parents' Bill of Rights, and a per-contract Data Security and Privacy Plan—even when minimal student data is collected. These are process obligations rather than architectural constraints.

### The audit trail should use tiered retention

Storing classification results permanently creates a surveillance record. Discarding them immediately makes CIPA compliance demonstration difficult during E-rate audits. The solution is **tiered retention**:

- **Layer 1 (real-time):** Classification results in Redis with 1–4 hour TTL. Supports live teacher dashboard and immediate safety response. Auto-expires.
- **Layer 2 (aggregate):** Fully de-identified daily statistics—`{date, category, total_count}`—retained for the E-rate audit cycle (typically one year). Contains no session IDs, timestamps, or device-correlatable data. Demonstrates that monitoring is active without creating re-identification risk.
- **Layer 3 (safety incidents):** When T3/T4 flags trigger, retain the classification event metadata (still without student identifiers) under school-controlled retention policies for safety review. Subject to the same deletion mechanisms (semester purge, on-demand parent/admin deletion within 72 hours).

CIPA (47 U.S.C. §254(h)) requires schools to deploy technology protection measures and monitor online activities of minors, but **does not specify** logging formats, retention periods, minimum data fields, or audit trail structure. Compliance is demonstrated during E-rate certification by showing that filtering and monitoring are in place. Aggregated Layer 2 statistics satisfy this requirement.

### The blue sharing indicator is necessary but not legally sufficient notice

Chrome's tabCapture API displays a blue sharing indicator border. Under COPPA's notice requirements (§312.4), operators must provide "clearly and understandably written" notice **to parents**, not to children. The blue indicator is a visual cue to the user (the child), does not explain what data is collected or how it is used, and does not constitute the required "direct notice" to parents. For children ages 5–8, its communicative value is essentially nil.

The correct notice framework relies on the **school consent authority**: longstanding FTC guidance (COPPA FAQs, Section M) permits schools to consent on parents' behalf when data is collected "for the use and benefit of the school, and for no other commercial purpose." The 2025 final rule did not codify this but also did not revoke it. Content monitoring for student safety clearly falls within educational purpose. The required structure is: (1) a written agreement with each school describing exactly what data is captured, processed, and retained; (2) schools include ChatBridge in their annual technology notification to parents explaining that content monitoring occurs, no images are retained, and parents can request deletion; (3) for students age 9+, an age-appropriate supplemental explanation of the blue border; (4) the blue indicator serves as a transparency supplement, not a legal notice substitute.

## Conclusion

The three research questions converge on a single design principle: **minimize aggressiveness at every layer**. The adaptive performance system should default to the lightest-touch capture frequency the device can sustain rather than pushing hardware limits. The action tier system should favor teacher notification over student disruption for everything below 0.85 confidence. The privacy architecture should retain the minimum data needed for safety compliance and discard everything else.

Three findings deserve particular emphasis. First, the **Compute Pressure API** (Chrome 125+, available in Workers, confirmed on ChromeOS) transforms thermal throttling from an unpredictable failure mode into a manageable signal—this single API eliminates the need for inference-time heuristics as the primary throttling detector. Second, **per-category threshold tuning** is not optional: weapons thresholds must be materially higher than self-harm thresholds, or the system will either over-block chess apps or under-detect self-harm content. Third, the **BIPA exposure** from Illinois is the system's most significant legal risk and can be fully mitigated by documenting that the TF.js model contains no facial-geometry extraction layers—a verification that should happen before deployment, not after a lawsuit.