# Nature Encyclopedia API Content Safety Research

**Date:** 2026-04-05  
**Context:** K-12 educational nature encyclopedia app pulling species data and photos from iNaturalist and Perenual APIs, embedded in ChatBridge chat platform with existing content safety infrastructure (NSFWJS visual classification, OpenAI moderation, iframe sandbox).

---

## Executive Summary

**Recommendation:** Use both iNaturalist and Perenual, but implement server-side filtering + client-side moderation pipeline:

1. **iNaturalist:** Query `quality_grade=research` to reduce low-quality/inappropriate uploads. Implement:
   - NSFWJS + OpenAI moderation on all photos before display
   - Taxonomy-based blocklist (high-risk taxa: roadkill, graphic parasites, dissection)
   - Server-side species name normalization (aliases for sensitive names)
   - Attribution + license compliance check

2. **Perenual:** Curated images are safer than iNaturalist's user-generated content, but:
   - Still run through NSFWJS pre-flight check
   - Verify licensing for educational use
   - Less regulatory risk due to centralized curation

3. **COPPA/Legal:** Recent COPPA 2025 update requires parental consent for any third-party data sharing or algorithmic processing. iNaturalist/Perenual images themselves aren't "personal data," but must verify no tracking pixels, SDKs, or analytics from these services reach your backend.

---

## 1. iNaturalist Photo Content & Moderation

### Current State

**Research Grade Definition:**
- ~170M of 270M observations marked "Research Grade"
- Achieved when community agrees on species-level ID (2/3+ of identifiers agree on taxon)
- Data Quality Assessment includes evidence evaluation (new for 2024+)
- Available via API with `quality_grade=research` filter

**Community Moderation:**
- User-flagged content reviewed by curators/staff
- Flags available for: inappropriate photos, artificially generated content (AI-flagged images)
- Sexual content policy: "Sexually explicit content is not permitted... but observations of mating in non-human species are okay if common sense is used"
- Obscene photo protocol exists, but applied inconsistently
- **No API-level photo safety filter parameter exists** — you cannot query "safe for kids" through the API

### Problematic Content Identified in Community Forum Discussions

**Dead Animals & Roadkill:**
- iNaturalist actively hosts "Global Roadkill Observations" project with thousands of photos
- Dead/dismembered animals accepted as scientifically valid
- Research use is legitimate (ecology, predator-prey studies)
- **Educational risk:** High-school students might see detailed roadkill photos intended for zoologists

**Parasites & Graphic Biology:**
- Parasites, infections, and diseased animals documented with close-up macro photography
- Scientifically valuable but visually disturbing (e.g., bot flies, mites on skin)
- **Educational risk:** K-5 students exposed to graphic internal parasites

**Predation Events:**
- Photos of predators with prey (birds with impaled small animals, snakes with kill)
- Legitimate wildlife biology but potentially distressing for younger ages

**Mating/Reproductive Imagery:**
- Covered under community guidelines ("common sense"), but not consistently moderated
- Can be explicit or simply anatomically detailed

### Mitigation: API Filtering Options

**Available:**
```
quality_grade=research        # Only high-confidence IDs (reduces spam/junk)
has=photos                    # Must include at least one photo
photos_licensed_as=...        # Can filter by license (see next section)
```

**NOT Available:**
- No content category filtering (e.g., exclude roadkill, parasites)
- No explicit safe-for-kids flag
- No photo moderation status parameter

**Workaround:** Pre-fetch taxa IDs for species you want to support (e.g., common North American birds, flowering plants, insects) and blocklist high-risk ones server-side.

---

## 2. Species Name & Description Content Concerns

### Plant Names with Problematic Colloquialisms

**"Hooker's Lips" (Psychotria elata / "Hot Lips Plant"):**
- Named after botanist Sir William Jackson Hooker, NOT inappropriate in origin
- Common name can appear suggestive to children (marketing angle: "perfect Valentine's gift")
- **Impact:** Low — visible only in species title; easily aliased in your UI
- **Mitigation:** Display scientific name + alternate common name ("Red Lips Plant" or "Hot Lips Plant")

**Other examples likely exist:** Squirting cucumber, Naked Man plant, Lady's slipper orchid, etc.
- Botanical Latin + colloquial names often have amusing double meanings
- Risk is mostly in UI presentation, not photo safety

### Reproduction Descriptions

**Current Data:**
- iNaturalist API returns minimal description (mainly species names, brief taxonomy)
- Perenual includes care guides but unlikely to include explicit reproductive biology
- Most sexual reproduction info is scientific (stamens, pistils) — not graphically described

**Impact:** Low if you source from standard educational databases rather than user comments

### Venomous/Dangerous Species

**Data available:** iNaturalist includes snakes, scorpions, venomous spiders, etc.
- No explicit "danger flag" in API
- Warning labels are educational (not censorship)

**Recommendation:** Tag venomous species with warning badges in UI ("Venomous" / "Warning: Can cause injury"). This is transparent + educational rather than hiding danger.

---

## 3. Perenual API Content Safety

### Current State

**API Structure:**
- 10,000+ plant species with images, care data, growth info
- Curated centrally (not user-uploaded like iNaturalist)
- Educational focus (gardening, farming, cultivation, pest management)

**Safety Profile:**
- **Significantly safer than iNaturalist** due to curation
- No roadkill projects, no explicit parasites, minimal dead animals
- Images mostly "well-lit indoor plant" or "garden specimen" style

**Educational Use:**
- Perenual actively supports educators
- "Bridging the Gap" outreach to academic institutions
- Free tier available for educational use (verify in current ToS)

### Content Concerns

- **Pest/disease photos:** May show plant infestations or damage (educational but not disturbing)
- **Herbicide/pesticide references:** Care data might mention chemical treatments (age-appropriate for 10+)
- **No known moderation issues** reported in forums

### Licensing

- No specific search results on Perenual's current licensing, but check their API docs for:
  - Attribution requirements
  - Commercial vs. educational use
  - Embedded usage rights (can you show in iframe?)

---

## 4. Licensing & Attribution Requirements

### iNaturalist Photos

**Default License:** CC BY-NC (Creative Commons: Attribution-NonCommercial)
- Some photos may be CC BY (allows commercial use with attribution)
- Some users choose no CC (retain copyright — requires explicit permission)
- Some photos are CC0 (public domain)

**Attribution Format (CC BY-NC):**
- "Photo by [User] on iNaturalist" or exact citation from photo page
- Include link to observation page
- Can append "(via iNaturalist)" after name

**Educational Use:** Covered by "non-commercial" if you're not charging students. Educational institutions using iNaturalist data for teaching = compliant.

**Implementation:**
- Query API for `license` field on each photo
- Store license type with photo cache
- Render attribution line below image (or in photo modal)
- Block/skip CC photos without CC BY-NC or CC0 license

### Perenual Photos

- **Not found in search results** — check perenual.com/docs or contact directly
- Likely more permissive than iNaturalist for educational use
- May require attribution in specific format

---

## 5. COPPA (Children's Online Privacy Protection Act) Implications

### Updated Rules (Effective June 23, 2025 | Full Compliance April 22, 2026)

**Key Changes:**
1. **Parental Consent for Third-Party Data Sharing:**
   - If iNaturalist or Perenual data flows to analytics services, CDNs with tracking, or AI training, you need verifiable parental consent
   - Photo images themselves are NOT "personal data" under COPPA (they're species data)
   - **BUT:** IP address, session tokens, user interaction patterns = personal data

2. **AI Processing Disclosure:**
   - If photos are used to train or refine algorithms (e.g., animal identification ML), separate parental consent required
   - Unless algorithm training is "essential to delivering the service"
   - You must disclose this in privacy policy

3. **Sub-Processor Transparency:**
   - If iNaturalist/Perenual have third-party analytics or SDKs, they must be disclosed
   - Flow-down obligations required (sub-processors can't do secondary use)

### Compliance Checklist

- [ ] **No tracking pixels from iNaturalist/Perenual** — verify by inspecting image domains
- [ ] **No third-party SDKs embedded in photo URLs** — direct image request only, no referrer headers
- [ ] **Privacy Policy discloses:** iNaturalist/Perenual as content sources, what photo data is retained, how long
- [ ] **Parental consent form** (if you offer accounts) explicitly addresses species photo sources
- [ ] **Data retention policy:** Limit photo caching to [X days], then delete
- [ ] **No algorithmic personalization** based on user's viewed species (or if you do: parental consent required)

### What You DON'T Need COPPA Consent For

- Displaying a photo of an iNaturalist observation (the photo is species data, not personal data)
- Crediting the photographer (name alone, no linking to user profile)
- Standard web logs (IP address OK for abuse prevention, per FTC guidance)

### What You DO Need COPPA Consent For

- If your backend logs which species a child viewed + builds a profile
- If you integrate tracking/analytics SDKs (Hotjar, Fullstory, etc.)
- If you share user interaction with iNaturalist/Perenual (e.g., webhooks)
- If you use photos to train child-facing ML models

---

## 6. Practical Mitigation Strategy

### Server-Side Filtering (Recommended)

**Phase 1: Taxonomy Blocklist**

Create a server-side blocklist of taxa IDs to exclude from API results:

```typescript
// Example blocklist
const BLOCKED_TAXA = {
  // Dead animals
  'roadkill_project_observations': true,
  
  // Parasites & macro disease
  '501657': true,  // Acari (mites, ticks) — graphic macro photos
  
  // Graphic predation (optional — you may want to include with warning label)
  // '3': true,  // Mammalia — no, too broad
  
  // High-risk combinations
  'observations_with_keywords': ['dead', 'dismembered', 'roadkill', 'infection'],
};

// Query iNaturalist, filter server-side
async function fetchSpecies(name: string) {
  const obs = await iNaturalistAPI.getObservations({
    q: name,
    quality_grade: 'research',
    has: 'photos',
  });
  
  return obs.filter(o => !isBlockedTaxon(o.taxon));
}
```

**Phase 2: Image Moderation Pipeline**

Run all iNaturalist photos through your existing safety stack:

```typescript
async function approvePhoto(imageUrl: string, taxonId: string) {
  // 1. NSFWJS check (fast, client-ready)
  const nsfwResult = await classifyWithNSFWJS(imageUrl);
  if (nsfwResult.flagged) return false;
  
  // 2. OpenAI moderation (on server-side cache)
  const openaiResult = await moderateImage(imageUrl);
  if (openaiResult.categories.violence || openaiResult.categories.graphic) {
    return false;
  }
  
  // 3. Cache result with TTL
  cache.set(`photo:${imageUrl}`, 'approved', 7*24*3600);
  return true;
}
```

### Client-Side Warnings

**For Sensitive-But-Educational Content:**

```tsx
// If the photo passes moderation but shows predation/parasites/etc.
<ImageWithWarning 
  src={photoUrl} 
  warnings={['Shows predation', 'Graphic biology']}
  minAge={14}
/>
```

Allow parents/educators to control via app settings:
- "Show all content (no filters)"
- "Filter graphic content (predation, parasites, roadkill)"
- "Educational content only (approved classroom photos)"

### Licensing Compliance

```typescript
async function renderSpeciesPhoto(iNaturalistObservationId: string) {
  const obs = await fetchObservation(iNaturalistObservationId);
  
  // Check license before rendering
  if (!['CC BY-NC', 'CC BY', 'CC0'].includes(obs.photo.license)) {
    return <LockedPhoto reason="License not available for educational use" />;
  }
  
  return (
    <figure>
      <img src={obs.photo.url} alt={obs.species_name} />
      <figcaption>
        Photo by {obs.photo.user} on iNaturalist (CC BY-NC)
        <br />
        <a href={obs.uri}>View full observation →</a>
      </figcaption>
    </figure>
  );
}
```

---

## 7. Recommended Approach by Age Group

### Ages 5–8 (Elementary)

**Restrictions:**
- Perenual only (curated, safe)
- iNaturalist: common vertebrates (birds, mammals, reptiles) + pretty flowers only
- Blocklist: parasites, predation, roadkill, anything with blood/graphic anatomy

**Content:** Colorful birds, butterflies, flowering plants, common garden insects (ladybugs, dragonflies)

### Ages 9–12 (Middle School)

**Restrictions:**
- iNaturalist + Perenual both available
- Blocklist: graphic parasites, detailed roadkill, explicit mating
- Warning labels for: predation, insects with fangs, venomous species

**Content:** Broader taxonomy, introduce food chains ("snakes eat mice"), insect life cycles

### Ages 13–18 (High School)

**Restrictions:**
- Full iNaturalist + Perenual (all quality_grade=research)
- Optional filtering for explicit reproductive imagery
- Full context + scientific framing

**Content:** Entire ecosystem including parasites, predation, ecological relationships, full taxonomy

---

## 8. Attribution & Legal Checklist

### For Every iNaturalist Photo Displayed

- [ ] Show photographer name
- [ ] Link to observation page (allows user to verify data)
- [ ] State license (CC BY-NC, CC BY, or CC0)
- [ ] Do not modify photos or misrepresent origin

### For Perenual Photos

- [ ] Check current ToS at perenual.com (not fully documented in search results)
- [ ] Follow attribution format specified in their API docs
- [ ] Verify educational use rights in license

### Privacy Policy Section

Include:
- "This app sources species photos from iNaturalist (CC BY-NC licensed) and Perenual. Photos are not personal data. iNaturalist contributor names are displayed but not linked to user profiles."
- Data retention: "Photos are cached locally for 7 days then deleted. No photos are sent to third-party analytics services."
- Parental notice: "If your child creates an account, we do not share their activity with iNaturalist or Perenual."

---

## 9. Summary Table: Risk & Mitigation

| Concern | iNaturalist | Perenual | Mitigation |
|---------|-----------|----------|-----------|
| **Inappropriate user photos** | HIGH | LOW (curated) | NSFWJS + OpenAI pre-filter + taxonomy blocklist |
| **Roadkill/graphic animals** | HIGH | NONE | Blocklist taxa; warning labels for predation |
| **Parasites/macro disease** | MEDIUM-HIGH | LOW | Blocklist macro + medical imagery; age-gating |
| **Mating/reproductive** | MEDIUM | LOW | Community moderation; warning labels |
| **Plant names (Hooker's lips)** | LOW | LOW | Display scientific name + UI aliases |
| **Licensing compliance** | COMPLEX | SIMPLE | Check license field; skip non-CC photos |
| **COPPA data sharing** | LOW RISK* | LOW RISK* | No tracking; no user data sent to APIs |
| **Photo attribution** | REQUIRED | CHECK ToS | Render credit + link below each image |

*Assumes you don't build user profiles around which species they view.*

---

## 10. Final Recommendations

### Do This Now

1. **Set up iNaturalist API queries with `quality_grade=research`** — reduces junk by ~63%
2. **Implement NSFWJS check** on all external photos before cache (you already have this)
3. **Run server-side moderation** on iNaturalist photos via OpenAI API (already in your stack)
4. **Create a blocklist** of high-risk taxa IDs (roadkill projects, parasites)
5. **Add licensing check** — skip photos not CC BY-NC, CC BY, or CC0
6. **Update privacy policy** to disclose iNaturalist/Perenual as sources; clarify no user tracking

### Do This Before Launch

7. **Test end-to-end** with a K-12 age group (recruit parent panel or school partner)
8. **Verify COPPA compliance** — no tracking pixels, no SDKs, no third-party data sharing
9. **Add parental/educator controls** — let them toggle "filter graphic content" on/off
10. **Set up attribution rendering** — test that credit appears correctly in iframe
11. **Document species name aliases** — map problematic names to safer variants

### Nice-to-Have (Post-Launch)

12. Create a "citizen-curated blocklist" — educators flag problematic observations; you bulk-block taxa
13. Integrate Perenual more prominently for younger grades (safer baseline)
14. Build teacher dashboard showing which taxa your app surfaces (transparency + feedback)

---

## Sources

- [iNaturalist Research-grade Standard](https://help.inaturalist.org/en/support/solutions/articles/151000169936-what-is-the-data-quality-assessment-and-how-do-observations-qualify-to-become-research-grade-)
- [iNaturalist Community Guidelines](https://www.inaturalist.org/pages/community+guidelines)
- [iNaturalist Photo Licensing](https://help.inaturalist.org/en/support/solutions/articles/151000173511-how-do-licenses-work-on-inaturalist-should-i-change-my-licenses-)
- [iNaturalist API Reference](https://www.inaturalist.org/pages/api+reference)
- [iNaturalist Blog: New Tools for Evidence Assessment](https://www.inaturalist.org/blog/118284)
- [Dealing with Inappropriate Content on iNaturalist](https://www.inaturalist.org/posts/15725-dealing-with-low-quality-observations-and-inappropriate-content-on-inat)
- [Hooker's Lips Plant Info](https://www.amusingplanet.com/2013/05/psychotria-elata-or-hookers-lips-most.html)
- [Roadkill Observations on iNaturalist](https://www.inaturalist.org/projects/global-roadkill-observations)
- [Perenual Free Plant API](https://perenual.com)
- [COPPA 2025 Updates for K-12](https://edprivacy.com/news-media/coppa-updates-2025-what-k-12-schools-must-know)
- [FTC COPPA Compliance Guide](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [School Data Governance: FERPA & COPPA Compliance](https://secureprivacy.ai/blog/school-data-governance-software-ferpa-coppa-k-12)

