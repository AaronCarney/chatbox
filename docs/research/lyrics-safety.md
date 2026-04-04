I now have comprehensive research across all five areas. Here are the structured findings:

---

## Lyrics Content Safety for ChatBridge: Research Findings

### Current State

The existing `/api/spotify/search` route filters on Spotify's `explicit` boolean field. This is a coarse signal — Spotify self-reports it and it misses tracks never flagged by their pipeline. The `explicit` field survived the February 2026 API changes (only `external_ids`, `linked_from`, and `popularity` were removed from the track object). So the current filter still works, but it's insufficient as a standalone safety control for K-12.

---

## 1. Lyrics APIs

### Musixmatch
- **Pricing:** Free tier = 2,000 API calls/day for non-commercial use. Commercial tiers are negotiated via `sales@musixmatch.com` — no public pricing page.
- **Explicit flag:** Yes. The `track_explicit_status` field is returned in the track object on search and lyrics endpoints. It's a language-aware computed flag, not just a passthrough from Spotify. Musixmatch runs its own explicit word detection.
- **Lyrics delivery:** Returns lyrics in 30% snippets on free tier; full lyrics require a commercial license. The 30% snippet is enough to run a content classifier.
- **Key endpoint:** `GET https://api.musixmatch.com/ws/1.1/track.lyrics.get?track_id=&apikey=`
- **Verdict:** Best option for a combined "pre-flagged + lyrics text" signal. The explicit flag alone adds value beyond Spotify's. Full lyrics require a commercial deal.

### Genius
- **Pricing:** Free API key via genius.com/api-clients. The API itself does not return lyrics — it returns annotation metadata and HTML page URLs. Lyrics must be scraped, which violates ToS.
- **Rate limits:** ~100 API calls/month per IP on free tier (very restrictive).
- **Verdict:** Not viable. No lyrics in API response, ToS prohibits scraping, rate limits are prohibitively low.

### Spotify Lyrics
- **Status:** Not available via the Web API. Lyrics appear in-app only (powered by Musixmatch under a licensing deal). There's no documented endpoint and no plans to open it. The February 2026 restrictions tightened API access further.
- **Verdict:** Dead end for developers.

### LRCLIB (lrclib.net)
- **Pricing:** Completely free, no API key required, no rate limits (community goodwill model).
- **Database:** ~3 million tracks (synchronized and plain lyrics). Lookup by track name + artist + album + duration, or by ISRC.
- **Key endpoints:**
  - `GET https://lrclib.net/api/get?track_name=&artist_name=&album_name=&duration=`
  - `GET https://lrclib.net/api/search?q=&track_name=&artist_name=`
- **Explicit flag:** None. Raw lyrics only — no pre-computed safety rating.
- **Coverage gaps:** Smaller catalog than Musixmatch, community-maintained, may lag on new releases.
- **Verdict:** Best option for MVP if cost is the constraint. Pair with a classifier since there's no explicit flag.

### Happi.dev
- **Pricing:** Credit-based (~$0.008/credit, minimum $10). Not free at scale.
- **Verdict:** No meaningful advantage over LRCLIB for this use case.

### lyrics.ovh
- **Status:** Free, no auth, but reliability is poor (community-run, no SLA, has had extended outages). Not production-suitable.
- **Verdict:** Skip.

---

## 2. Content Analysis for Lyrics Text

### OpenAI Moderation (`omni-moderation-latest`)
- **Cost:** Free for all developers.
- **Categories returned:** `harassment`, `harassment/threatening`, `hate`, `hate/threatening`, `illicit`, `illicit/violent`, `self-harm`, `self-harm/intent`, `self-harm/instructions`, `sexual`, `sexual/minors`, `violence`, `violence/graphic`.
- **K-12 relevance:** `illicit` (drug instructions), `sexual/minors`, `self-harm` are directly applicable. Returns confidence scores (0.0–1.0) per category — you can set conservative thresholds.
- **Limitations:** Trained on conversational text, not song lyrics specifically. Poetic/metaphorical language may confuse it. Not optimized for coded slang.
- **Verdict:** Best starting point for MVP. Already wired into ChatBridge (`moderation.ts` uses `openai.moderations.create`). Zero marginal cost. Extend `moderateContent()` to handle lyrics text.

### Google Perspective API
- **Cost:** Free until December 31, 2026, then sunset. Do not build on this.
- **Verdict:** Avoid — sunsetting in 9 months.

### Azure Content Safety
- **Free tier (F0):** 5,000 text records/month (1 record = up to 1,000 characters). Stops at limit, no overage.
- **Paid (S0):** $0.38 per 1,000 records (charged per 1,000-char block — a typical song's lyrics = 2–4 records).
- **Categories:** Hate, violence, sexual, self-harm — each with severity levels (Safe/Low/Medium/High). Supports custom categories you can train.
- **Custom categories:** You can train it to detect, e.g., drug glorification, that isn't covered by the default taxonomy.
- **Verdict:** Better for production than OpenAI moderation if you need severity levels and custom categories. More expensive than free but not prohibitive.

### Profanity Word Lists (npm packages)
- **`obscenity`** (npm): Most robust — handles character substitutions (`fuuuck`, `ʃṳ𝒸𝗄`), transformer-based variant matching. Actively maintained.
- **`bad-words`** (npm): Simpler, widely used (155 dependents), last updated 2 years ago.
- **`leo-profanity`** (npm): Dictionary-based, updated 2 months ago, Shutterstock word list.
- **Pros:** Zero latency, zero cost, no API dependency, works offline.
- **Cons:** Context-blind (catches "grape" in "assassinate"), misses coded slang entirely, requires manual maintenance.
- **Verdict:** Use as a fast pre-filter (first pass, <1ms) before calling a classifier API. Catches obvious cases without burning API quota.

### Coded Language / Slang Problem
This is the hard part. Research confirms:
- ML models specialized on song lyrics (e.g., ELSTM-VC ensemble) achieve 96% accuracy detecting explicit content, but require training data and hosting infrastructure.
- Static word lists miss: drug euphemisms ("lean", "percs", "dirty sprite"), sexual slang, coded violence, genre-specific double entendres.
- The OpenAI moderation API handles some of this via semantic understanding but is not tuned for song lyric idioms.
- **Practical answer for K-12 MVP:** A layered approach — Spotify `explicit` flag + Musixmatch explicit flag + OpenAI moderation with conservative thresholds — catches the vast majority. Accept residual false negatives and handle with teacher override.

---

## 3. K-12 Specific Requirements

### Age-Appropriate Thresholds
There's no industry-standard threshold API. The practical pattern is:
- **Elementary (K–5):** Block everything flagged explicit + anything with OpenAI moderation score >0.3 in any harmful category.
- **Middle (6–8):** Block explicit + score >0.5.
- **High school (9–12):** Block explicit + score >0.7 (allows more nuance, protest songs, history).
- Grade level would need to be a configurable parameter per school/classroom — not hardcoded.

### COPPA/FERPA Implications
The April 22, 2026 updated COPPA rule is directly relevant:
- Sending lyrics text to a third-party API (OpenAI, Azure) is low-risk because **lyrics are not student PII**. You're not sending student data — you're sending song text. This does not implicate COPPA/FERPA.
- What would implicate it: sending a student's search query or profile data to a third-party without a DPA. The lyrics themselves are public content.
- **Practical action:** Ensure track ID / lyrics content is passed without any user identifier attached to the API call. No session ID, no student name, no user context. The existing `moderateContent()` function already does this correctly.

### False Positive Handling
Legitimate educational content that could be misclassified:
- Protest songs ("Strange Fruit", "Killing Me Softly")
- Historical songs with period-appropriate language
- Classical/opera with dramatic violent/sexual themes
- Rap with social commentary that uses adult vocabulary

The standard industry pattern (confirmed by research on K-12 content filter products): **flag, don't auto-block, and give teachers an override**. Log the flagged track, show a "requires teacher approval" state in the UI, and maintain an allow-list keyed by `track_id`.

### Cultural Sensitivity
Static English-language word lists fail on Spanish, AAVE, and other vernaculars. OpenAI's `omni-moderation-latest` improved multilingual accuracy by 42% vs. the prior model. For a US K-12 context this is the most viable mitigation without building a custom classifier.

---

## 4. Performance Considerations

### Latency
Lyrics lookup (LRCLIB: ~200–400ms) + OpenAI moderation (~300–600ms) = ~500ms–1s added to every track search response. This is too slow for inline blocking of a 10-track search result set if done sequentially.

### Caching Strategy
The correct architecture, given ChatBridge already has ioredis wired in:

```
Key:   safety:<spotify_track_id>
Value: { safe: bool, score: number, flaggedCategories: string[], checkedAt: ISO8601 }
TTL:   30 days (lyrics don't change; safety rating is stable)
```

Cache hit rate will be high for popular tracks — students cluster around the same songs. After a warmup period, the cache absorbs most requests.

**Two-tier cache:**
- L1: In-process `Map<trackId, rating>` (LRU, ~1000 entries, zero latency)
- L2: Redis (persistent across restarts, shared across server instances)

### Batch vs. Individual
Analyze the search results batch asynchronously: return the tracks immediately with an `safetyStatus: "pending"` field, then push ratings via SSE or polling. Or: pre-filter using only Spotify's `explicit` flag synchronously, then enrich with lyrics analysis asynchronously. The second pattern is simpler for MVP.

### Pre-computation
For a set of known popular tracks (Billboard charts, Spotify top 200), batch pre-compute safety ratings offline and seed the cache. This eliminates cold-start latency for the most common queries.

---

## 5. Implementation Patterns

### Pattern A: Synchronous Block (simplest)
1. Spotify search returns 20 tracks.
2. Filter `explicit === true` (already done).
3. For remaining tracks, check Redis cache by `track_id`.
4. Cache miss: fetch lyrics (LRCLIB) → run word-list pre-filter → if clean, run OpenAI moderation → cache result.
5. Return only tracks with `safe: true`.
- **Pro:** Simple. No UI state machine.
- **Con:** Adds 500ms–2s to searches with cache misses.

### Pattern B: Async Flag + Teacher Override (recommended for production)
1. Spotify search → filter `explicit === true` → return remaining tracks immediately with `safetyStatus: "checking" | "safe" | "flagged"`.
2. Background job: fetch lyrics + analyze → update Redis cache → push update to client via polling or SSE.
3. Flagged tracks render with a "Pending teacher review" indicator.
4. Teacher can approve a flagged track → write `approved` to a DB allowlist keyed by `(classroom_id, track_id)`.
- **Pro:** No added latency to search. Handles edge cases gracefully. Matches industry pattern for K-12 content filtering tools.
- **Con:** More UI/state complexity.

### Fallback Behavior When Lyrics API Unavailable
- LRCLIB down: Fall back to Musixmatch (if licensed) or fail-open with `safetyStatus: "unverified"`.
- Explicit flag still blocks the obvious cases.
- For `unverified` tracks: show to teacher/admin only, not to students directly (fail-conservative on unavailability).

---

## Recommended Approach

### MVP (this sprint)
1. **Lyrics source:** LRCLIB — free, no key, no rate limit, good coverage. Fetch by `track_name` + `artist_name`.
2. **Classifier:** OpenAI `omni-moderation-latest` via the existing `openai` package already in `package.json`. Reuse `moderateContent()` in `moderation.ts`. Add a lyrics-specific wrapper that passes conservative thresholds.
3. **Cache:** Redis via existing `ioredis` dependency. Key `safety:<track_id>`, TTL 30 days.
4. **Filtering:** Synchronous block at search time (Pattern A). Acceptable for MVP with a Redis warm cache.
5. **Word list pre-filter:** `obscenity` npm package as a fast first pass before calling OpenAI — saves API round-trips on obvious cases.

### Production (post-MVP)
1. Upgrade lyrics to Musixmatch commercial plan for the `track_explicit_status` flag + partial lyrics on every track (double signal, wider catalog).
2. Shift to Pattern B (async flag + teacher override) with a DB allowlist table.
3. Add Azure Content Safety for severity scoring if grade-level thresholds are required.
4. Pre-compute safety ratings for top 5000 Spotify tracks offline to seed the cache.
5. Add grade-level configuration (per-classroom threshold) as a school admin setting.

---

**Key files in ChatBridge relevant to implementation:**
- `/home/context/projects/chatbridge/server/src/routes/spotify.ts` — search route where filtering happens
- `/home/context/projects/chatbridge/server/src/middleware/moderation.ts` — existing `moderateContent()` to extend
- `/home/context/projects/chatbridge/server/package.json` — `openai` and `ioredis` already present, need to add `obscenity`

Sources:
- [Musixmatch API Documentation](https://musixmatch.mintlify.app/lyrics-api/introduction)
- [LRCLIB API Documentation](https://lrclib.net/docs)
- [LRCLIB on Hacker News (show HN)](https://news.ycombinator.com/item?id=39480390)
- [Spotify February 2026 API Changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [Spotify February 2026 Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify Developer Access Update Blog](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
- [OpenAI Moderation API Docs](https://platform.openai.com/docs/guides/moderation)
- [OpenAI omni-moderation-latest Model](https://platform.openai.com/docs/models/omni-moderation-latest)
- [OpenAI Multimodal Moderation Announcement](https://openai.com/index/upgrading-the-moderation-api-with-our-new-multimodal-moderation-model/)
- [Azure Content Safety Pricing](https://azure.microsoft.com/en-us/pricing/details/content-safety/)
- [Azure AI Content Safety Overview](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/overview)
- [Perspective API Sunsetting Info (Lasso)](https://www.lassomoderation.com/blog/what-is-perspective-api/)
- [obscenity npm package](https://github.com/jo3-l/obscenity)
- [Explicit Song Lyrics Detection ML paper (PeerJ)](https://peerj.com/articles/cs-1469/)
- [Fine-tuning LLMs for explicit lyrics detection (arXiv)](https://arxiv.org/html/2602.05485)
- [COPPA 2026 EdTech Compliance](https://anonym.legal/blog/coppa-2026-edtech-anonymization)
- [FERPA & COPPA Compliance for School AI](https://schoolai.com/blog/ensuring-ferpa-coppa-compliance-school-ai-infrastructure)
- [Happi.dev Lyrics API](https://happi.dev/)
- [Redis Caching for Node.js](https://redis.io/tutorials/howtos/solutions/microservices/caching/)
- [K-12 Content Filter Design (ManagedMethods)](https://managedmethods.com/blog/k12-classroom-management-and-content-filtering/)
- [Musixmatch Swagger SDK](https://github.com/musixmatch/musixmatch-sdk)