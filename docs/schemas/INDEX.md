# Nature Explorer Tool Schemas - Index

**Complete design for a K-12 species exploration app with ChatBridge integration.**

## What You're Getting

Five comprehensive documents that define tool schemas, design philosophy, implementation patterns, and deployment steps for Nature Explorer—an educational app that lets students explore animals and plants via iNaturalist and Perenual APIs.

---

## Document Guide

### 1. `NATURE-EXPLORER-SUMMARY.txt` ← **START HERE**
- **5 minutes read**
- Quick overview of the entire system
- The 5 tools and how they work
- Chatbot decision tree
- Example conversations
- Content safety approach
- Task completion model (why no completion event)

### 2. `nature-explorer-tools.json`
- **The source of truth for tool definitions**
- 5 tools with complete parameters and return shapes
- Ready to copy into database seed
- API endpoint references
- Integration notes

### 3. `NATURE-EXPLORER-DESIGN.md`
- **Design philosophy and rationale**
- Why these 5 tools, not more
- When the chatbot should use each tool
- How the iframe renders vs. chatbot narrates
- Educational interaction patterns
- Content safety strategies
- Example scenarios showing intended flow
- Future enhancement ideas

### 4. `NATURE-EXPLORER-DEV-GUIDE.md`
- **Step-by-step implementation guide**
- File structure to create
- Complete bridge.js template (tool invocation handler)
- API client code (iNaturalist, Perenual)
- HTML/CSS structure
- System prompt additions
- Testing checklist
- Content safety verification
- Deployment steps

### 5. `NATURE-EXPLORER-SEED.ts`
- **Database registration code**
- Copy directly into `server/src/db/seed.ts`
- Registers Nature Explorer with all 5 tools
- Matches `nature-explorer-tools.json` exactly

### 6. `README.md`
- **Quick navigation guide**
- File structure overview
- Integration checklist
- Design highlights
- Key differences from chess/go

### 7. `INDEX.md` (this file)
- Navigation and reading order

---

## The 5 Tools at a Glance

| Tool | Purpose | Chatbot Trigger |
|------|---------|-----------------|
| `search_species` | Find animals/plants by name | "Tell me about X" |
| `get_species_details` | Full profile with images & facts | After search, "show me more" |
| `explore_habitat` | Browse species by ecosystem | "What animals live in...?" |
| `get_random_species` | Surprise discovery | "Show me something cool" |
| `compare_species` | Side-by-side comparison | "What's the difference between X and Y?" |

---

## Quick Start

### For Product Managers / Designers
1. Read `NATURE-EXPLORER-SUMMARY.txt` (5 min)
2. Read example conversations in `NATURE-EXPLORER-DESIGN.md` (10 min)
3. Review integration flow diagram in design doc (5 min)

### For Backend Developers
1. Read `NATURE-EXPLORER-SUMMARY.txt`
2. Review `nature-explorer-tools.json` (understand the contract)
3. Copy `NATURE-EXPLORER-SEED.ts` into database seed

### For Frontend Developers
1. Read `NATURE-EXPLORER-SUMMARY.txt`
2. Read full design doc (`NATURE-EXPLORER-DESIGN.md`)
3. Follow `NATURE-EXPLORER-DEV-GUIDE.md` step-by-step
4. Use provided code templates

### For QA / Testing
1. Read `NATURE-EXPLORER-SUMMARY.txt`
2. Use testing checklist in `NATURE-EXPLORER-DEV-GUIDE.md`
3. Content safety verification section

---

## Key Design Principles

### 1. Browse-Based, Not Task-Based
Unlike chess/go (win/lose), Nature Explorer is discovery-focused. Students explore until they're satisfied, then close the app. **Never call `task.completed()`.**

### 2. Chatbot Orchestrates, Iframe Displays
- Chatbot: decides which tools to call, narrates findings, asks follow-ups
- Iframe: shows beautiful species profiles, habitat grids, comparison tables

### 3. Tools Are Discoverable
Each tool has a natural language trigger that the chatbot recognizes:
- Specific species? → `search_species`
- Habitat question? → `explore_habitat`
- Want difference? → `compare_species`
- Want surprise? → `get_random_species`

### 4. Content-Safe for K-12
- iNaturalist + Perenual provide curated imagery
- Filter out graphic content (predation, mating)
- Educational descriptions (clinical language)
- No persistent student data (COPPA/FERPA compliant)

### 5. Rich Learning Experience
- Images, taxonomy, fun facts, comparisons
- Guides curiosity (Socratic questioning)
- Chains tools to deepen understanding
- Natural conversation flow

---

## File Locations

All files are in: `/home/context/projects/chatbridge/docs/schemas/`

```
docs/schemas/
├── INDEX.md (this file)
├── NATURE-EXPLORER-SUMMARY.txt
├── nature-explorer-tools.json
├── NATURE-EXPLORER-DESIGN.md
├── NATURE-EXPLORER-DEV-GUIDE.md
├── NATURE-EXPLORER-SEED.ts
└── README.md
```

---

## Integration Checklist

- [ ] Product: Read summary, understand design
- [ ] Backend: Add seed code to database
- [ ] Frontend: Create `/apps/nature-explorer/` directory
- [ ] Frontend: Implement bridge.js (use template)
- [ ] Frontend: Implement API clients (use template)
- [ ] Backend: Update system prompt for chatbot
- [ ] QA: Test 5 tools with sample queries
- [ ] QA: Content safety verification
- [ ] DevOps: Deploy to staging, then production

---

## What's Not Included

These schemas cover the **tool design and integration**. Not included:
- Actual API implementation (you'll write this)
- CSS styling details (basic template provided)
- Database schema (existing ChatBridge schema works)
- Deployment infrastructure (use your existing process)

---

## Questions?

Refer to:
- **"Why this tool?"** → `NATURE-EXPLORER-DESIGN.md` (FAQ section)
- **"How do I build this?"** → `NATURE-EXPLORER-DEV-GUIDE.md`
- **"What parameters does tool X take?"** → `nature-explorer-tools.json`
- **"How should the chatbot work?"** → `NATURE-EXPLORER-SUMMARY.txt` or design doc

---

## Version & Status

- **Created:** 2026-04-05
- **Status:** Ready for implementation
- **Last updated:** 2026-04-05
- **Format:** OpenAI function calling (JSON Schema)
- **Compatibility:** ChatBridge app model (iframe + bridge pattern)

---

**Let's build something awesome for K-12 students to explore nature!**
