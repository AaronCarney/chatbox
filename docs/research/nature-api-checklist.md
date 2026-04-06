# Nature API Integration Checklist

Quick reference for implementing iNaturalist & Perenual in ChatBridge.

---

## Content Safety Decisions (Already Made)

- [x] Use iNaturalist (`quality_grade=research` filter reduces junk)
- [x] Use Perenual (curated, safer baseline)
- [x] Pre-filter with server-side taxonomy blocklist
- [x] Reuse existing NSFWJS + OpenAI moderation pipeline
- [x] Implement licensing compliance (CC BY-NC/BY/CC0 only)
- [x] Age-gate content (K-5, 6-8, 9-12, 13-18 tiers)
- [x] COPPA compliant (no tracking, no third-party SDKs)

---

## Implementation Tasks

### Backend Setup

- [ ] Create `server/src/lib/taxonomy-blocklist.ts`
  - Blocklist for roadkill, parasites, graphic predation
  - Warning tags for age-appropriate predation/mating
  - Age-gating thresholds (e.g., parasites → age 10+)

- [ ] Create `server/src/services/nature-api.ts`
  - `fetchInatObservations(query)` — query iNaturalist API with `quality_grade=research`
  - `filterObservations(obs, userAge)` — apply blocklist, licensing, age gates
  - `searchSpeciesPhotos(query, { userAge, limit })` — main entry point
  - Handle HTTP errors gracefully (fail closed)

- [ ] Create `server/src/services/photo-moderation.ts`
  - `moderatePhoto(photoUrl)` — reuse your existing OpenAI moderation service
  - Cache results (7-day TTL) to avoid re-moderating same photos
  - Detect: NSFW, violence, graphic content

- [ ] Create `server/src/routes/nature.ts`
  - Route: `GET /api/nature/search?q=butterfly&age=13&limit=10`
  - Returns: `{ count, photos: [{ speciesName, photoUrl, attribution, warning, observationUrl }] }`
  - Route: `GET /api/nature/species/:taxonId` (future: species detail page)
  - Wire into `server/src/index.ts` with `app.use('/api/nature', natureRouter)`

- [ ] Create tests: `server/tests/services/nature-api.test.ts`
  - Test quality_grade filtering
  - Test blocklist exclusion
  - Test license filtering
  - Test age-gating
  - Test warning tag assignment

### Frontend Setup

- [ ] Create `src/renderer/components/SpeciesPhoto.tsx`
  - Display photo, photographer name, license badge, observation link
  - Show warning badge if `warning` field present (e.g., "Shows predation")
  - Handle image load errors gracefully

- [ ] Create `src/renderer/components/SpeciesPhotosGrid.tsx`
  - Grid layout for multiple photos
  - Responsive (auto-fill, min 250px)

- [ ] Create hook: `src/renderer/hooks/useSpeciesSearch.ts`
  - `const { photos, loading, error } = useSpeciesSearch(query, userAge)`
  - Fetch from `/api/nature/search`
  - Cache results locally

- [ ] Integrate into chat interface
  - When user mentions species → offer nature encyclopedia card
  - Show first 5 photos + "View more" link
  - Verify attribution displays correctly

### Perenual (Phase 2)

- [ ] Get API key from Perenual (free tier available)
- [ ] Create `server/src/services/perenual-api.ts`
  - Follow same pattern as iNaturalist (but less filtering needed)
  - Verify current licensing requirements
  - Implement photo curation (Perenual images are safer)

- [ ] Create route: `GET /api/nature/plants/:id`
  - Query Perenual for plant details
  - Show photos + care guide

### Legal & Privacy

- [ ] Update Privacy Policy section: "Data Sources"
  - "This app sources species photos from iNaturalist (CC BY-NC licensed, open data) and Perenual. These photos are not personal information. Photographer names and iNaturalist links are displayed but do not link to user profiles."

- [ ] Update Privacy Policy: "Data Retention"
  - "Species photo cache expires every 7 days. We do not share user interaction (viewed species, search history) with iNaturalist or Perenual."

- [ ] Update Privacy Policy: "Third-Party Services"
  - "iNaturalist and Perenual are content sources only. We do not use their SDKs or analytics. No tracking pixels are embedded."

- [ ] Update Terms of Service or Parental Consent
  - If you offer student accounts: "By creating an account, you acknowledge we may display species photos from community science databases (iNaturalist). These photos are curated for educational quality and safety. [Link to blocklist/policy if applicable]"

- [ ] COPPA Self-Assessment
  - [ ] Do you collect user data on which species they view? If yes → COPPA consent needed
  - [ ] Do you use third-party analytics on the nature encyclopedia? If yes → COPPA consent needed
  - [ ] Do you train recommendation models on species viewing? If yes → separate COPPA consent needed
  - If all "no" → you're in the clear for COPPA (just photos are safe)

### Quality Assurance

- [ ] Test searches across grade levels:
  - Grade K: "butterfly" → only Perenual? (optional: safe iNaturalist)
  - Grade 3: "robin" → research-grade birds with warning labels
  - Grade 6: "tick" → should be blocked or age-gated
  - Grade 9: "parasitic wasp" → allowed with warning
  - Grade 11: "roadkill" → blocked

- [ ] Test attribution rendering:
  - [ ] All photos display "Photo by [name]"
  - [ ] License badge visible (CC BY-NC, etc.)
  - [ ] iNaturalist link clickable and functional
  - [ ] Mobile view: attribution readable, not cut off

- [ ] Test error handling:
  - [ ] Network timeout → graceful message, not crash
  - [ ] iNaturalist API down → fallback to Perenual (or cached)
  - [ ] Photo 404 → skip in grid, show placeholder
  - [ ] Invalid age parameter → default to 13

- [ ] Load testing:
  - [ ] 100 concurrent searches for "butterfly" → no API throttling
  - [ ] Cache hit rate → verify photos served from cache 80%+ of time

- [ ] Educator/Parent Review:
  - [ ] Show K-12 educator sample screenshots
  - [ ] Ask: "Is this age-appropriate for [grade]?"
  - [ ] Document any feedback for future blocklist updates

---

## Risk Mitigation (Already Planned)

| Risk | Mitigation |
|------|-----------|
| **Roadkill/dead animals in photos** | Server-side taxonomy blocklist |
| **Parasites/graphic biology** | Age-gating (parasites → age 10+) |
| **Mating/reproductive imagery** | OpenAI moderation pre-filter + warning tags |
| **Inappropriate species names** | UI aliases (e.g., "Hot Lips" not "Hooker's Lips") |
| **Licensing violations** | License check on every photo; skip non-CC |
| **COPPA violation** | No user tracking, no third-party SDKs |
| **Photo disappears later** | Cache with original URL; graceful 404 handling |
| **Offensive content slips through** | Your existing NSFWJS + OpenAI state machine catches it |

---

## API Integration Details

### iNaturalist

**Endpoint:** `https://api.inaturalist.org/v1/observations`

**Query Example:**
```
GET /observations?q=butterfly&quality_grade=research&photos=true&per_page=10
```

**Response fields used:**
- `id` → observationId
- `taxon.id` → taxonId (for blocklist check)
- `taxon.name` → speciesName
- `photos[0].url` → photoUrl
- `photos[0].license_code` → license (check against ALLOWED_LICENSES)
- `user.login` → photographerName (for attribution)
- `uri` → observationUrl (link to original data)

### Perenual

**Endpoint:** `https://perenual.com/api/species-list`

**Auth:** Bearer token (API key)

**Query Example:**
```
GET /species-list?q=tomato&page=1
Authorization: Bearer <API_KEY>
```

**Response fields:** TBD (check current docs)

---

## Deployment Order

1. **Week 1:** Backend (blocklist, iNaturalist service, moderation, route)
2. **Week 2:** Frontend components + integration with chat
3. **Week 3:** Legal review + privacy policy updates
4. **Week 4:** QA + user testing + COPPA self-assessment
5. **Week 5:** Perenual integration (Phase 2)

---

## References

- Full content safety research: `docs/research/nature-api-content-safety-research.md`
- Implementation guide: `docs/research/nature-api-implementation-guide.md`
- iNaturalist API: https://www.inaturalist.org/pages/api+reference
- Perenual API: https://perenual.com/docs/plant-open-api
- COPPA 2025 Rules: https://edprivacy.com/news-media/coppa-updates-2025-what-k-12-schools-must-know

---

## Questions for Product/Legal

1. **Age-gating preference:** Should parasites/roadkill be hidden for K-5, or shown with warning labels?
2. **Educator override:** Should teachers be able to request unfiltered iNaturalist access (for biology classes)?
3. **User activity tracking:** Will you log which species users view? (If yes → COPPA consent needed)
4. **Algorithmic recommendations:** Will you recommend species based on prior views? (If yes → separate COPPA consent needed)
5. **Account feature:** Do you require/offer student accounts? (Affects COPPA scope)

