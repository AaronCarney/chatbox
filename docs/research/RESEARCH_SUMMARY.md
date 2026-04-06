# Nature API Content Safety Research — Executive Summary

**Date:** 2026-04-05

Two detailed research documents have been created:

1. **`nature-api-content-safety-research.md`** (10 sections, 400+ lines)
   - Comprehensive analysis of iNaturalist & Perenual content safety
   - Risk assessment by concern type
   - COPPA 2025 compliance requirements
   - Mitigation strategies (taxonomy blocklist, image moderation pipeline)
   - Age-based content recommendations (K-8, middle, high school)

2. **`nature-api-implementation-guide.md`** (9 sections, 350+ lines)
   - Practical TypeScript/Express code examples
   - Integration with your existing content safety stack
   - Server-side API filtering + client-side rendering
   - Test strategy + deployment checklist

---

## Key Findings

### iNaturalist
- **User-uploaded photos** — no built-in content filter in API
- **Research grade available** via `quality_grade=research` (reduces junk 63%)
- **Problematic content found:** roadkill, parasites, graphic predation, mating imagery
- **Licensing:** 90% CC BY-NC; check each photo's license field
- **No API-level safety filter** — must implement server-side blocklist

### Perenual
- **Curated images** — significantly safer than iNaturalist
- **10,000+ species** with gardening/care data
- **Educational focus** — active support for educators
- **License info:** Not documented in search results — verify current ToS

### Content Safety Approach
Use **three layers:**
1. **Server:** Taxonomy blocklist (roadkill, parasites) + license check
2. **Server:** OpenAI moderation on photos before caching (reuse your existing service)
3. **Client:** Your existing NSFWJS + state machine as safety net

### COPPA 2025 Compliance
- Images themselves NOT personal data (they're species data)
- **DO REQUIRE parental consent for:** User activity tracking, algorithmic personalization, third-party data sharing
- **DON'T REQUIRE for:** Displaying curated photos with photographer attribution
- Verify: no tracking pixels, no SDKs, no user activity logs sent to iNaturalist/Perenual

### Age-Based Filtering
- **Ages 5–8:** Perenual only + whitelisted iNaturalist (birds, flowers, butterflies)
- **Ages 9–12:** Both APIs, block parasites/roadkill, warn on predation
- **Ages 13–18:** Full access with scientific framing

---

## Recommended Actions

### Before Launch
1. Create taxonomy blocklist (file: `server/src/lib/taxonomy-blocklist.ts`)
2. Implement iNaturalist query handler with filtering (file: `server/src/services/nature-api.ts`)
3. Wire photo moderation using your existing OpenAI service
4. Create Express route: `GET /api/nature/search?q=butterfly&age=13&limit=10`
5. Build React component for photo display with attribution
6. Add COPPA notice to privacy policy
7. Test with K-12 user panel for age-appropriateness

### Post-Launch
8. Create educator blocklist mechanism (flag problematic taxa)
9. Add teacher dashboard showing surface taxonomy
10. Integrate Perenual as safer baseline for younger grades

---

## Files Created

- `/home/context/projects/chatbridge/docs/research/nature-api-content-safety-research.md`
- `/home/context/projects/chatbridge/docs/research/nature-api-implementation-guide.md`

Both are ready for team review and implementation planning.

