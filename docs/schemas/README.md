# ChatBridge Tool Schemas

This directory contains tool schema definitions for ChatBridge apps.

## Files

### `nature-explorer-tools.json`
**Complete tool schema definitions for the Nature Explorer app.** This is the source of truth for what tools exist, their parameters, and return shapes. Use this to:
- Understand the complete API contract
- Register the app in `server/src/db/seed.ts`
- Validate tool invocations in the backend

**Structure:**
- `app_id`, `app_name`: App metadata
- `tools[]`: Array of tool definitions, each with:
  - `name`: Tool identifier (e.g., `search_species`)
  - `description`: What the chatbot sees (instructs when to use it)
  - `input_schema`: JSON Schema for parameters (OpenAI function calling format)
- `return_shapes`: Expected response structures for each tool
- `api_details`: iNaturalist and Perenual endpoint references
- `integration_notes`: When/how to use tools, content safety, task completion model

### `NATURE-EXPLORER-DESIGN.md`
**Design rationale and educational context.** Read this first to understand:
- Why these 5 tools (not more)
- When the chatbot should use each tool
- How the iframe renders data vs. the chatbot narrates
- Why task.completed is never called (browse-based, not task-based)
- Example conversations showing the intended flow
- Content safety approach for K-12 students

**Key sections:**
- Tool Schemas (why each parameter exists)
- Integration: Decision tree for tool selection
- Iframe Rendering Strategy
- Task Completion & Session Model
- Why This Design Works (FAQ)

### `NATURE-EXPLORER-DEV-GUIDE.md`
**Implementation quickstart for developers.** Step-by-step guide to:
- File structure to create
- Bridge.js template (handle tool invocations, call APIs, render results)
- API client patterns (iNaturalist, Perenual)
- HTML/CSS structure
- System prompt additions (tell chatbot to use tools)
- Testing checklist
- Content safety verification
- Deployment checklist

**Use this when building the iframe.** All code samples are production-ready patterns (based on chess/go apps).

### `NATURE-EXPLORER-SEED.ts`
**Database registration code (copy-paste into `server/src/db/seed.ts`).**

Registers the Nature Explorer app with all 5 tools in the `apps` table. The tool definitions here match `nature-explorer-tools.json` exactly.

## Quick Links

| Task | File |
|------|------|
| Understand the design philosophy | `NATURE-EXPLORER-DESIGN.md` |
| See all tool parameters & return types | `nature-explorer-tools.json` |
| Build the iframe (code) | `NATURE-EXPLORER-DEV-GUIDE.md` |
| Register in database | `NATURE-EXPLORER-SEED.ts` |

## Integration Checklist

- [ ] Read `NATURE-EXPLORER-DESIGN.md` (understand the "why")
- [ ] Review `nature-explorer-tools.json` (know the API contract)
- [ ] Create `/apps/nature-explorer/` directory
- [ ] Implement bridge.js (use guide as template)
- [ ] Implement API clients (iNaturalist, Perenual)
- [ ] Add seed code to `server/src/db/seed.ts`
- [ ] Update system prompt (instruct chatbot when to use tools)
- [ ] Test: "Tell me about monarch butterflies"
- [ ] Test: "What animals live in the Amazon?"
- [ ] Test: "Compare frogs and toads"
- [ ] Content safety review (images, descriptions)
- [ ] Deploy

## Design Highlights

**5 Tools:**
1. `search_species` — Find animals/plants by name/keyword
2. `get_species_details` — Full profiles: taxonomy, images, facts
3. `explore_habitat` — Browse species by ecosystem/region
4. `get_random_species` — "Show me something cool!" discovery
5. `compare_species` — Side-by-side comparison (2-4 species)

**Key Differences from Chess/Go:**
- Browse-based (no task end) vs. game-based (win/lose)
- Chatbot guides discovery vs. plays moves
- Iframe shows visual profiles vs. game boards
- Never call `task.completed()` (session ends when student closes app)

**Content Safety:**
- All images from curated sources (iNaturalist community moderation)
- Educational animal behavior OK; filter gore/abuse
- Age-appropriate descriptions (K-12 standard)
- No persistent student data (COPPA/FERPA compliant)

**Chatbot Behavior:**
- Always use tools (never answer from memory alone)
- Chain tools for deeper learning (search → details → compare/explore)
- Narrate what students see in iframe
- Ask follow-up questions (Socratic method)

---

## Files Structure

```
/home/context/projects/chatbridge/docs/schemas/
├── README.md (this file)
├── nature-explorer-tools.json
├── NATURE-EXPLORER-DESIGN.md
├── NATURE-EXPLORER-DEV-GUIDE.md
└── NATURE-EXPLORER-SEED.ts
```

---

For questions or updates to these schemas, refer to the design doc or raise an issue.
