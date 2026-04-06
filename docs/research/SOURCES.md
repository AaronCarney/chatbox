# Research Sources — Nature API Content Safety

All sources referenced in content safety and implementation research.

---

## iNaturalist API & Content Policy

### Research Grade & Quality Standards
- [iNaturalist Help: What is Research Grade?](https://help.inaturalist.org/en/support/solutions/articles/151000169936-what-is-the-data-quality-assessment-and-how-do-observations-qualify-to-become-research-grade-)
- [iNaturalist Blog: New Tools to Flag and Assess Evidence](https://www.inaturalist.org/blog/118284)
- [iNaturalist API Reference](https://www.inaturalist.org/pages/api+reference)
- [iNaturalist API (v1)](https://www.inaturalist.org/api)

### Moderation & Inappropriate Content
- [iNaturalist Community Guidelines](https://www.inaturalist.org/pages/community+guidelines)
- [iNaturalist: Dealing with Low Quality Observations and Inappropriate Content](https://www.inaturalist.org/posts/15725-dealing-with-low-quality-observations-and-inappropriate-content-on-inat)
- [iNaturalist Help: What is Considered Inappropriate Content?](https://help.inaturalist.org/en/support/solutions/articles/151000169915-what-is-considered-inappropriate-content-on-inaturalist-)

### Photo Licensing & Attribution
- [iNaturalist Help: How Do Licenses Work?](https://help.inaturalist.org/en/support/solutions/articles/151000173511-how-do-licenses-work-on-inaturalist-should-i-change-my-licenses-)
- [iNaturalist Blog: Choosing Licensing for Scientists to Use Your Observations](https://www.inaturalist.org/posts/84932-updated-choosing-licensing-that-allows-scientists-to-use-your-observations)
- [iNaturalist Help: Can I Use Photos Posted on iNaturalist?](https://help.inaturalist.org/en/support/solutions/articles/151000169918-can-i-use-the-photos-and-sounds-that-are-posted-on-inaturalist-)
- [iNaturalist: Licensed to Share!](https://www.inaturalist.org/posts/58298-licensed-to-share)

### Disturbing Content (Roadkill, Parasites, Predation)
- [iNaturalist Community Forum: Photos of Dead Animals](https://forum.inaturalist.org/t/photos-of-dead-animals/4892)
- [iNaturalist Community Forum: No Ability to Report Disturbing Images](https://forum.inaturalist.org/t/no-ability-to-report-disturbing-images/49843)
- [iNaturalist Global Roadkill Observations Project](https://www.inaturalist.org/projects/global-roadkill-observations)
- [iNaturalist Roadkill Project](https://www.inaturalist.org/projects/roadkill)
- [Journal Article: Touring iNaturalist for Roadkill Observations as a Tool for Ecologists](https://wildlife-biodiversity.com/index.php/jwb/article/view/181)

---

## Plant Species & Common Names

- [Wikipedia: Palicourea elata (Hooker's Lips)](https://en.wikipedia.org/wiki/Palicourea_elata)
- [CGTN: Hooker's Lips — A Tropical Plant with Enchanting Red Bracts](https://news.cgtn.com/news/2019-07-18/Hooker-s-lips-A-tropical-plant-with-enchanting-red-bracts-IqmlfxUD2U/index.html)
- [iNaturalist: Hot Lips Plant (Psychotria elata)](https://www.inaturalist.org/taxa/287472-Psychotria-elata)
- [Amusing Planet: Psychotria Elata — The Most Kissable Plant](https://www.amusingplanet.com/2013/05/psychotria-elata-or-hookers-lips-most.html)
- [Our Breathing Planet: Hooker's Lips](https://www.ourbreathingplanet.com/hookers-lips/)

---

## Perenual API

- [Perenual: Free Plant API](https://perenual.com)
- [Perenual Documentation](https://www.perenual.com/docs/plant-open-api)
- [Perenual: Free Subscription Student Contact](https://perenual.com/subscription-student-contact)
- [Perenual API Pricing](https://www.perenual.com/subscription-api-pricing)

---

## COPPA 2025 & K-12 Privacy Compliance

### Updated COPPA Rules & Guidance
- [Federal Register: Children's Online Privacy Protection Rule (2024 Update)](https://www.federalregister.gov/documents/2024/01/11/2023-28569/childrens-online-privacy-protection-rule)
- [EdPrivacy: COPPA Updates 2025 — What K-12 Schools Must Know](https://edprivacy.com/news-media/coppa-updates-2025-what-k-12-schools-must-know)
- [FTC: Complying with COPPA — Frequently Asked Questions](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

### Third-Party Data & Privacy Best Practices
- [SecurePrivacy: School Data Governance — FERPA, COPPA & K-12 Compliance in 2025](https://secureprivacy.ai/blog/school-data-governance-software-ferpa-coppa-k-12)
- [Promise Legal: COPPA Compliance 2025 — Practical Guide for Tech & EdTech](https://blog.promise.legal/startup-central/coppa-compliance-in-2025-a-practical-guide-for-tech-edtech-and-kids-apps/)
- [EdTechMagazine: How to Vet Schools' Apps for Student Data Privacy](https://edtechmagazine.com/k12/article/2023/12/how-vet-schools-apps-for-student-data-privacy)
- [US Department of Education: Protecting Student Privacy — Education Technology Vendors](https://studentprivacy.ed.gov/audience/education-technology-vendors?page=1)
- [SchoolDay: Interoperability in K-12 Schools](https://www.schoolday.com/interoperability-in-k-12-building-a-seamless-data-ecosystem-for-schools/)

---

## Related Standards & References

### Alternative Plant APIs
- [Trefle: The Plants API](https://trefle.io/)
- [Pl@ntNet API for Developers — Terms of Use](https://my.plantnet.org/terms_of_use)

### Your Existing ChatBridge Infrastructure
- Content Safety: `src/renderer/lib/content-safety/` (NSFWJS + OpenAI moderation, state machine)
- Safety State Machine: `src/renderer/lib/content-safety/hysteresis.ts` (blur, hard block logic)
- OpenAI Moderation: `server/src/services/llm.ts` (or equivalent)

---

## How to Update This Document

When referencing new sources in implementation:

1. Add link + title to appropriate section above
2. Update the related research documents with the source link in footer
3. Maintain alphabetical order within each section for readability
4. Mark sources with `[CHECKED: DATE]` if you verify currency

---

## Checklist: Before Implementation

- [ ] Review all COPPA links — verify 2025 rules still current
- [ ] Verify iNaturalist API hasn't changed endpoints (v1 → v2?)
- [ ] Check Perenual current licensing & educational use terms
- [ ] Confirm iNaturalist photo license codes (CC BY-NC, CC BY, CC0)
- [ ] Get Perenual API key (free tier for educational use)
- [ ] Have legal review privacy policy + COPPA self-assessment

