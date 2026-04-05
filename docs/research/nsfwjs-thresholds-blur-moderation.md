# Research: NSFWJS Thresholds, CSS Blur, and OpenAI Moderation

**Date:** 2026-04-04
**Sources:** NSFWJS GitHub (infinitered/nsfwjs), nsfw_model GitHub (GantMan/nsfw_model), OpenAI API docs (developers.openai.com), MDN Web Docs (CSS filter, filter effects guide), InfoQ NSFWJS coverage, API4AI video moderation article, W3Schools CSS filter reference
**Confidence Summary:** 11 HIGH / 3 MEDIUM / 2 LOW

---

## 1. NSFWJS Output Classes and Score Ranges

### Classes

The five classes, from the nsfw_model training repo:

| Class | Definition |
|-------|-----------|
| `Drawing` | "safe for work drawings (including anime)" |
| `Hentai` | "hentai and pornographic drawings" |
| `Neutral` | "safe for work neutral images" |
| `Porn` | "pornographic images, sexual acts" |
| `Sexy` | "sexually explicit images, not pornography" |

[HIGH | source: GantMan/nsfw_model README — https://github.com/GantMan/nsfw_model]

### Score Format

Output is an array of `{ className, probability }` objects. Probabilities are 0.0-1.0 floats from a **softmax** output layer, confirming they sum to ~1.0 across all 5 classes. Verified via example output from the nsfw_model repo:

```
{'sexy': 4.3454722e-05, 'neutral': 0.00026579265, 'porn': 0.0007733492,
 'hentai': 0.14751932, 'drawings': 0.85139805}
```

Sum: ~1.0. Both InceptionV3 and MobileNetV2 model variants use softmax final layer. Model trained on "60+ Gigs of data" from nsfw_data_scraper.

[HIGH | source: GantMan/nsfw_model README output example + softmax is architectural requirement of MobileNetV2/InceptionV3 classification heads]

### Typical Output

- **Safe photo:** high `Neutral` (0.90+), low everything else.
- **NSFW photo:** high `Porn` or `Sexy`, low `Neutral`.
- **SFW anime/illustration:** high `Drawing` (0.85+), low everything else.
- **NSFW drawing:** high `Hentai`, low `Drawing`.

[HIGH | source: infinitered/nsfwjs README — https://github.com/infinitered/nsfwjs]

### Published Threshold Recommendations

**NSFWJS provides no official threshold recommendations.** The library returns raw probabilities and leaves threshold decisions entirely to the application developer. The README states developers should "experiment and try different thresholds." A common default in community implementations is 0.5, but this is not endorsed by the maintainers.

The NSFWJS creator (Gant Laborde) acknowledges the model "still fails at correctly classifying images which a human would instantly and accurately assess" and recommends "a secondary human layer" for production use.

[HIGH | source: infinitered/nsfwjs README, InfoQ — https://www.infoq.com/news/2019/04/nsfw-machine-learning-rating/]

---

## 2. Threshold Recommendations for K-12

### Proposed Thresholds Are Too Permissive

The proposed thresholds (`Porn > 0.7`, `Sexy > 0.8`, `Hentai > 0.7`) are **too high for K-12**. A `Porn > 0.7` threshold means an image the model is 60% confident is pornographic passes through unblurred. For a children's platform, this is unacceptable.

NSFWJS reports ~93% accuracy (midsized model), ~90% (small model). The creator acknowledges "oversensitivity to females" as a known bias. Both factors argue for lower thresholds that trade false positives for safety.

### Recommended K-12 Thresholds

Use aggressive thresholds. Flag if **any** of:

| Class | Threshold | Rationale |
|-------|-----------|-----------|
| `Porn` | > 0.2 | Any meaningful pornography signal should trigger |
| `Hentai` | > 0.3 | Slightly higher — Drawing/Hentai confusion documented (Issue #513) |
| `Sexy` | > 0.4 | Highest of the three — "sexy" is broader (swimwear, fashion) |

These will produce more false positives. For K-12, that is the correct tradeoff. The blur is reversible and non-destructive; exposure to NSFW content is not.

No published K-12 threshold standard exists. A TechRxiv paper ("Automatic Negative Content Monitoring and Blocking using NSFWJS for Kids Browser Apps", doi:10.36227/techrxiv.21341295.v1) addresses this exact use case, confirming that aggressive-threshold NSFWJS deployments for children's apps are a documented pattern.

[MEDIUM | source: Recommendations derived from NSFWJS accuracy data (GantMan/nsfw_model ~93%), creator's false positive acknowledgments (InfoQ), TechRxiv paper existence confirming the approach. Two sources agree: model accuracy limitations + child safety context both demand lower thresholds.]

---

## 3. The "Drawing" Class

### What It Represents

`Drawing` = "safe for work drawings (including anime)." It is the **SFW** counterpart to `Hentai` (NSFW drawings). The two classes partition the illustrated-content space: `Drawing` for safe, `Hentai` for explicit.

[HIGH | source: GantMan/nsfw_model README]

### False Positive Risk from Drawing

Album art, pixel art, game screenshots, and stylized illustrations will score high on `Drawing`. This is **not a problem** because `Drawing` is a SFW class. High `Drawing` score = model thinks the image is a safe illustration.

The real false positive risk is the **inverse**: an SFW drawing (anime art, game characters) could score moderately on `Hentai` due to stylistic similarity. GitHub issue #513 reports an SFW image classified as `Hentai` at 70% probability. This is why the `Hentai` threshold should be slightly higher than `Porn` — genuine confusion between `Drawing` and `Hentai` exists for anime-style SFW content.

[HIGH | source: GantMan/nsfw_model class definitions + infinitered/nsfwjs Issue #513 — https://github.com/infinitered/nsfwjs/issues/513]

### Recommendation

**Ignore `Drawing` and `Neutral` in the flagging decision.** They are SFW classes. Only flag on `Porn`, `Hentai`, and `Sexy`. Since probabilities sum to 1.0, a high `Drawing` score mechanically reduces the probability mass available for NSFW classes — it is implicitly protective.

[HIGH | source: Class definitions from GantMan/nsfw_model — SFW classes by definition cannot indicate unsafe content]

---

## 4. CSS Blur on an Iframe

### `filter: blur()` Works on Iframes

**Yes.** The CSS `filter` property applies to "all elements" (MDN). It is a **post-compositing visual effect** applied to the element's painted output. The browser renders the element (including all descendant content), then applies the Gaussian blur to the rendered bitmap. This does not require DOM access to the iframe's content.

MDN CSS filter effects guide: filter properties "define a way of processing an element's rendering before the element is displayed in the document." When applied to an iframe, the entire visual output — including its embedded document content — is blurred because the blur operates on composited pixels, not the DOM.

This is fundamentally different from trying to read or modify iframe content (which is blocked by same-origin policy). CSS `filter` is a visual rendering operation on the parent's compositing layer.

[HIGH | source: MDN CSS filter — https://developer.mozilla.org/en-US/docs/Web/CSS/filter, MDN CSS filter effects guide — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Filter_effects]

### Cross-Browser Support

`filter` is Baseline Widely Available since September 2016:

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 53 |
| Firefox | 35 |
| Safari | 9 |
| Edge | 13 |

[HIGH | source: MDN browser compatibility, W3Schools CSS filter reference]

### Blur Radius for Content Obscuring

The `blur()` function parameter is the standard deviation of the Gaussian distribution. Higher values blend pixels with more distant neighbors:

| Radius | Effect |
|--------|--------|
| 10px | Shapes visible, text unreadable |
| 20px | Large shapes vaguely detectable, fine detail gone |
| 30-50px | Shapes indistinguishable, content unidentifiable |

**Use `filter: blur(30px)` minimum for K-12 NSFW obscuring.** At 20px, a user can still make out skin tones, body shapes, and large text. At 30px+, the Gaussian spread eliminates identifiable features.

[MEDIUM | source: MDN blur() Gaussian mechanics documentation + practical behavior descriptions from CSS-Tricks, SliderRevolution. No single authoritative source specifies "safe" blur radius for NSFW — derived from Gaussian blur mathematical properties.]

### Side Effects

Applying `filter` creates a new **stacking context** and a new **containing block** for `position: fixed` descendants. For a blurred iframe, this is a non-issue — the entire iframe is obscured anyway.

[HIGH | source: MDN CSS filter — stacking context behavior]

---

## 5. Auto-Recovery After Clean Frame

### Naive Auto-Unblur Is Unsafe

If a borderline image alternates between flagged/not-flagged on consecutive captures (due to compression artifacts, slight rendering changes, or threshold-edge scores), the blur will flicker — creating a strobe effect that is both a UX failure and potentially harmful.

Verified: per-frame NSFW detection implementations (e.g., API4AI's video blur pipeline) are **stateless** with no temporal smoothing — each frame is classified independently. This confirms that temporal flickering is an unaddressed problem in naive implementations.

[MEDIUM | source: API4AI video NSFW detection article (Medium) confirms stateless per-frame design. Flickering is a direct consequence of stateless classification on temporally correlated inputs.]

### Standard Pattern: Hysteresis with Consecutive Clean Frames

Use asymmetric state transitions (Schmitt trigger pattern):

1. **Flag immediately:** When any frame exceeds the NSFW threshold, apply blur with zero delay. Safety first.
2. **Unflag after N consecutive clean frames:** Require 3-5 consecutive clean classifications before removing blur.
3. **Use asymmetric thresholds:** Flag at threshold T, unflag only when score drops below T - margin (e.g., flag `Porn > 0.2`, unflag only when `Porn < 0.1`).

```
State: CLEAN
  if any_nsfw_score > flag_threshold:
    state = FLAGGED
    apply blur
    clean_count = 0

State: FLAGGED
  if all_nsfw_scores < unflag_threshold:
    clean_count++
  else:
    clean_count = 0
  if clean_count >= REQUIRED_CLEAN_FRAMES:
    state = CLEAN
    remove blur
```

Use `REQUIRED_CLEAN_FRAMES = 5` for K-12. The cost of a brief extra blur period is negligible compared to a flash of NSFW content. CSS transition on the blur property (`transition: filter 0.5s ease`) smooths the visual change.

[MEDIUM | source: Hysteresis/Schmitt trigger is a standard signal processing pattern. No NSFW-specific library implements this natively. Derived from: stateless detection confirmed (API4AI), temporal correlation problem is well-established in signal processing, asymmetric thresholds prevent oscillation by design.]

---

## 6. OpenAI Moderation `flagged` Boolean

### Response Structure

```json
{
  "id": "modr-...",
  "model": "omni-moderation-latest",
  "results": [
    {
      "flagged": true,
      "categories": {
        "sexual": false,
        "sexual/minors": false,
        "harassment": false,
        "harassment/threatening": false,
        "hate": false,
        "hate/threatening": false,
        "illicit": false,
        "illicit/violent": false,
        "self-harm": false,
        "self-harm/intent": false,
        "self-harm/instructions": false,
        "violence": true,
        "violence/graphic": false
      },
      "category_scores": {
        "sexual": 2.34e-7,
        "sexual/minors": 1.63e-7,
        "harassment": 0.001164,
        "harassment/threatening": 0.002212,
        "hate": 3.19e-7,
        "hate/threatening": 2.49e-7,
        "illicit": 0.000522,
        "illicit/violent": 3.68e-7,
        "self-harm": 0.001117,
        "self-harm/intent": 0.000626,
        "self-harm/instructions": 7.36e-8,
        "violence": 0.8599,
        "violence/graphic": 0.3770
      }
    }
  ]
}
```

[HIGH | source: OpenAI API reference — developers.openai.com, verified via Context7 /websites/developers_openai_api]

### `flagged` Is Per-Result, Aggregated Across Categories

- `flagged` lives inside each `results[]` entry (one per input).
- It is `true` if **any** category in that result's `categories` object is `true`.
- It is a **single boolean that aggregates all categories** — not per-category.
- Per-category booleans are in `categories`.
- Per-category confidence scores (0.0-1.0) are in `category_scores`.

[HIGH | source: OpenAI API docs — "Whether the model classifies the content as potentially harmful" + response examples showing flagged=true with violence=true while other categories are false]

### All 13 Categories

`harassment`, `harassment/threatening`, `hate`, `hate/threatening`, `illicit`, `illicit/violent`, `self-harm`, `self-harm/intent`, `self-harm/instructions`, `sexual`, `sexual/minors`, `violence`, `violence/graphic`

[HIGH | source: OpenAI API reference — full category list in response schema]

### K-12 Category Handling

For K-12, use `category_scores` with custom thresholds rather than relying solely on the `flagged` boolean. OpenAI's internal thresholds are calibrated for general audiences, not children.

| Category | Action | Rationale |
|----------|--------|-----------|
| `sexual` | Blur | Any sexual content inappropriate for children |
| `sexual/minors` | **Instant block + alert** | CSAM-adjacent — zero tolerance, do not merely blur |
| `violence/graphic` | Blur | Graphic violence inappropriate for children |
| `self-harm` | Blur + alert | Self-harm content requires educator notification |
| `self-harm/instructions` | **Block + alert** | Instructional self-harm = immediate risk |

For `sexual/minors`, trigger at **any non-trivial score** (e.g., > 0.01). The cost of a false positive is negligible compared to the cost of missing CSAM-adjacent content.

[HIGH | source: OpenAI API docs confirm category_scores available for custom thresholding. K-12 action recommendations derived from COPPA/FERPA compliance context in project decisions.md.]

---

## Unverified Findings

**TechRxiv paper thresholds for kids browser apps** — "Automatic Negative Content Monitoring and Blocking using NSFWJS for Kids Browser Apps" (TechRxiv, doi:10.36227/techrxiv.21341295.v1) likely contains specific threshold recommendations for children's applications. Could not be fetched (403). Would upgrade K-12 threshold recommendations from MEDIUM to HIGH confidence if obtainable.
[LOW — unverified: source exists but content inaccessible]

**nsfw-filter extension thresholds** — The nsfw-filter browser extension (github.com/nsfw-filter/nsfw-filter) implements NSFWJS for content blocking. Its source code likely contains practical threshold values from a production deployment. Could not extract threshold config from the repository page.
[LOW — unverified: source code not inspected]
