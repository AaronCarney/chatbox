# Nature Explorer Tool Design

## Overview

Nature Explorer is a discovery-based educational app that lets K-12 students explore animals and plants via iNaturalist and Perenual APIs. Unlike game-based apps (chess/go), it's browse-based: students learn through guided discovery, image-rich profiles, and comparisons rather than completing tasks.

**Key design principle:** The *chatbot orchestrates*, the *iframe displays*. Tools return data; the iframe renders it beautifully.

---

## Tool Schemas

### 1. search_species

**Purpose:** Find animals or plants by name, keyword, or scientific term.

```json
{
  "name": "search_species",
  "parameters": {
    "query": "string (required, ≤100 chars)",
    "type": "enum: animal | plant | all (optional, default: all)",
    "region": "enum: geographic region (optional, default: worldwide)"
  }
}
```

**When to use:**
- Student: "Tell me about monarch butterflies" → `search_species(query="monarch butterfly")`
- Student: "Show me desert animals" → `search_species(query="desert", type="animal", region="North America")`
- Student: "What's *Quercus robur*?" → `search_species(query="Quercus robur")`

**Returns:**
- Array of matching species with `{id, common_name, scientific_name, type, image_url, habitat, iucn_status}`
- Useful for quick browsing; follow with `get_species_details` for full info

**Design rationale:**
- `query` is unrestricted (flexible for common/scientific/keyword searches)
- `type` filter reduces noise in results (e.g., searching "bat" returns animals only)
- `region` helps ground results (e.g., "Amazon" implies South America; filter for local relevance)

---

### 2. get_species_details

**Purpose:** Fetch comprehensive species data: taxonomy, habitat, behavior, fun facts, images.

```json
{
  "name": "get_species_details",
  "parameters": {
    "species_id": "string (required)",
    "include_images": "boolean (optional, default: true)",
    "include_similar": "boolean (optional, default: true)"
  }
}
```

**When to use:**
- After `search_species`: student sees a search result, wants to learn more
- Student: "Tell me more about that species"
- Chatbot: Always call this after search to render a rich profile in the iframe

**Returns:**
```json
{
  "id": "string",
  "common_name": "string",
  "scientific_name": "string",
  "taxonomy": { "kingdom", "phylum", "class", "order", "family", "genus", "species" },
  "description": "long educational text",
  "habitat": "string",
  "diet": "string",
  "behavior": "string",
  "fun_facts": ["fact1", "fact2", ...],
  "iucn_status": "LC|NT|VU|EN|CR|EX|DD",
  "images": [{ "url", "credit" }, ...],
  "similar_species": [{ "id", "name", "difference" }, ...]
}
```

**Design rationale:**
- `include_similar` enables "frog vs. toad" comparisons without a separate tool call
- Taxonomy is flat (not nested) so the chatbot can easily discuss each rank
- `iucn_status` teaches conservation (great for K-12 learning about endangered species)
- Rich text description + fun facts keep students engaged

---

### 3. explore_habitat

**Purpose:** Browse species by habitat type and region. Discover what lives where.

```json
{
  "name": "explore_habitat",
  "parameters": {
    "habitat": "enum: rainforest | desert | coral_reef | ocean | forest | grassland | arctic | wetland | mountains | urban (required)",
    "region": "enum: geographic region (optional, default: worldwide)",
    "type": "enum: animal | plant | all (optional, default: all)",
    "limit": "integer 1-50 (optional, default: 12)"
  }
}
```

**When to use:**
- Student: "What animals live in the Amazon?" → `explore_habitat(habitat="rainforest", region="South America", type="animal")`
- Student: "Show me coral reef creatures" → `explore_habitat(habitat="coral_reef")`
- Student: "What plants grow in mountains?" → `explore_habitat(habitat="mountains", type="plant")`

**Returns:**
```json
{
  "habitat": "string",
  "region": "string",
  "species": [
    {
      "id": "string",
      "common_name": "string",
      "type": "animal|plant",
      "image_url": "string",
      "brief_description": "1-2 sentence description"
    },
    ...
  ]
}
```

**Design rationale:**
- Enum habitats are pre-curated (not arbitrary strings) → consistent results
- Habitat + region combinations are meaningful ecologically
- Returns thumbnails + brief descriptions (quick browsing)
- `limit` enables pagination for large result sets
- Educational: students learn that different habitats have different species compositions

---

### 4. get_random_species

**Purpose:** "Surprise me!" Engagement tool. Shows a random species with full details.

```json
{
  "name": "get_random_species",
  "parameters": {
    "type": "enum: animal | plant | all (optional, default: all)",
    "difficulty": "enum: easy | medium | hard | any (optional, default: any)",
    "region": "enum: geographic region (optional, default: worldwide)"
  }
}
```

**When to use:**
- Student: "Show me something cool!" or "I want to learn about something random"
- Chatbot: End of conversation, suggest a random discovery to keep learning going

**Returns:** Same as `get_species_details` (full profile with images, fun facts, taxonomy).

**Design rationale:**
- `difficulty` tiers control learning: "easy" = recognizable (house cat, oak tree), "medium" = interesting but familiar, "hard" = rare/unusual (reveals deeper biology)
- Great for engagement and serendipitous learning
- `region` preference lets students explore different parts of the world
- Returns full profile immediately (not just a search result)

---

### 5. compare_species

**Purpose:** Side-by-side comparison of 2-4 species. Builds critical thinking.

```json
{
  "name": "compare_species",
  "parameters": {
    "species_ids": "array of 2-4 IDs (required)",
    "aspects": "enum[]: taxonomy | habitat | diet | behavior | size | lifespan | conservation | adaptations (optional)"
  }
}
```

**When to use:**
- Student: "What's the difference between a frog and a toad?" → `compare_species(species_ids=["frog_id", "toad_id"])`
- Student: "Compare lions and tigers" → `compare_species(species_ids=["lion_id", "tiger_id"])`
- Chatbot: "Let me show you how these species differ" (renders comparison table)

**Returns:**
```json
{
  "comparison": [
    {
      "species_id": "string",
      "common_name": "string",
      "taxonomy": { ...taxon data... },
      "habitat": "string",
      "diet": "string",
      "size": "string",
      "lifespan": "string"
    },
    ...
  ],
  "similarities": ["both amphibians", "lay eggs in water", ...],
  "differences": ["frogs have smooth skin, toads have bumpy", ...]
}
```

**Design rationale:**
- Returns both data (for iframe table) + narratives (similarities/differences for chatbot to discuss)
- Limits to 4 species (readability; comparing 10 things is overwhelming)
- `aspects` is optional; defaults to all (but student can focus on e.g. "diet and habitat")
- Educational: trains analytical thinking (classify, compare, contrast)

---

## Integration: When Does the Chatbot Use Which Tool?

### Decision Tree

```
Student message → Analyze intent:

1. Asking about a SPECIFIC species?
   → search_species(query="species name")
   → get_species_details(species_id=result[0])
   → [iframe renders rich profile]
   → Chatbot discusses: taxonomy, fun facts, habitat, conservation status

2. Asking about a HABITAT or REGION?
   → explore_habitat(habitat="...", region="...", type="...")
   → [iframe renders species grid for that habitat]
   → Chatbot highlights: "Here are 12 species from Amazon rainforests. Notice they all have..."

3. Asking for COMPARISON or DIFFERENCE?
   → search_species(query="species A")
   → search_species(query="species B")
   → compare_species(species_ids=[id_a, id_b])
   → [iframe renders comparison table]
   → Chatbot discusses: similarities, differences, evolutionary adaptations

4. Wants DISCOVERY or "SHOW ME SOMETHING COOL"?
   → get_random_species(difficulty="medium", region="worldwide")
   → [iframe renders full profile of random species]
   → Chatbot engages: "Did you know...? Let me tell you about..."

5. Student says "Tell me more" or "What else?"
   → Follow up with get_species_details(include_similar=true)
   → Suggest related species or explore_habitat for same ecosystem
   → Chain multiple calls to deepen learning
```

---

## Iframe Rendering Strategy

Unlike chess/go (game boards), Nature Explorer is **visual and informational**.

**Iframe responsibilities:**
- Render species profile cards with:
  - High-quality images (carousel)
  - Taxonomy tree (kingdom → species)
  - Habitat map (if available)
  - Conservation status (color-coded)
  - Key facts in callouts
- Comparison tables (side-by-side species)
- Habitat grids (12 species thumbnails per habitat)
- Interactive elements (e.g., expand taxonomy, click for more info)

**Chatbot responsibilities:**
- Narrate the science: explain why frogs have wet skin, discuss food chains, relate to student's life
- Ask follow-up questions: "What would happen if this habitat got warmer?"
- Guide discovery: "Since you liked monarch butterflies, let's learn about their migration..."
- Provide context: "This species is endangered because..."

**Example interaction:**
```
Student: "Tell me about monarch butterflies"

Chatbot action:
  1. search_species(query="monarch butterfly")
  2. get_species_details(species_id="inaturalist:123456")

Iframe renders: Beautiful profile card with
  - Monarch image carousel
  - Taxonomy (Kingdom: Animalia, ..., Species: D. plexippus)
  - Habitat: "Milkweed meadows, prairies, gardens"
  - Diet: "Milkweed plants (caterpillar), nectar (adult)"
  - Fun fact: "Monarchs migrate 3,000 miles to Mexico!"
  - Conservation: "Least Concern (but declining)"

Chatbot says:
  "The monarch is one of nature's greatest travelers! Look at those 
   distinctive orange and black wings. You know what's special? 
   Monarchs eat milkweed, which is toxic to most predators. The 
   butterflies store the toxins and become poisonous themselves—
   their bright colors warn predators to stay away. This is called 
   aposematism. Pretty clever, right? And that migration... females 
   lay eggs on milkweed in the north, and their great-great-
   grandchildren fly back to Mexico for winter. How do they know 
   where to go if they've never been there?"
```

---

## Task Completion & Session Model

**Key difference from chess/go:** There's no winning condition.

- **Chess/Go:** Game ends when someone wins → `ChatBridge.complete('success', {...})`
- **Nature Explorer:** Students browse until they're satisfied → No completion event

**Session lifecycle:**
1. Student opens Nature Explorer
2. Explores species, habitats, comparisons
3. Asks follow-up questions; chatbot chains tool calls
4. Student closes app when done (no explicit "finish" needed)
5. Iframe cleanup: localStorage, timers, API subscriptions

**Implementation:**
- Don't call `ChatBridge.complete()` (no task end)
- Do call `ChatBridge.sendState()` after each tool to keep chatbot in sync
- Save exploration history to localStorage (optional, for "recently viewed")
- Handle close event gracefully (cleanup, no errors)

---

## API Backend Mapping

### iNaturalist (free, no API key)

**For search_species:**
```
GET /api/v1/taxa/autocomplete?q=monarch+butterfly
Returns: list of taxa with IDs, names, photos
```

**For get_species_details:**
```
GET /api/v1/taxa/{id}
Returns: full taxonomy, description, images, conservation status
```

**For explore_habitat:**
```
GET /api/v1/observations?place_id={place_id}&taxon_id={id}&per_page=50
Combine with place autocomplete to find place IDs
```

### Perenual (free tier requires API key)

**For plant search:**
```
GET https://perenual.com/api/species-list?q=shade+plant&key={API_KEY}
Returns: plants matching query
```

**For plant details:**
```
GET https://perenual.com/api/species/details/{id}?key={API_KEY}
Returns: care requirements, images, watering info
```

---

## Content Safety

**What to include:**
- Educational animal behavior (predation is part of nature)
- Anatomy and adaptations
- Habitat and ecology
- Conservation and endangered species

**What to filter out:**
- Graphic animal abuse or suffering
- Explicit mating/reproduction imagery (keep it clinical: "reproduce" not "mate violently")
- Dead animals/gore (unless scientifically necessary, e.g., fossil discussion)

**Implementation:**
- Curate image URLs: use iNaturalist's community moderation (already does this)
- Add content tags to filter: `image.content_rating` (iNaturalist provides)
- Test with sample K-12 classrooms (not automated, human review)

---

## Why This Design Works

| Question | Answer |
|----------|--------|
| **Why these 5 tools, not more?** | Covers the main student actions: search, explore, learn details, discover, compare. More tools = more complexity for LLM decision-making. These 5 are sufficient. |
| **Why is compare_species separate?** | Could be done with 2 × get_species_details, but compare_species returns both the raw data AND narratives (similarities/differences), saving the chatbot from doing the analysis itself. |
| **Why enum habitats instead of free-text?** | iNaturalist has thousands of places; enums ensure consistent results and prevent invalid searches (e.g., "xyzzy" gets no results). Enums are also ecologically meaningful. |
| **Why is region a parameter, not just part of the search query?** | Cleaner schema. "Show me Amazon animals" becomes `explore_habitat(habitat="rainforest", region="South America")` instead of `search_species(query="Amazon animals")` which is ambiguous. |
| **Why no "save to collection" or "bookmark" tools?** | COPPA/FERPA compliance: no persistent student data. Session-based learning only. If needed, localStorage is fine (ephemeral per device). |
| **Why doesn't the chatbot answer from knowledge?** | The prompt should instruct: "Always use tools. Never answer 'emperor penguins are...' from memory; use search_species + get_species_details so the student sees current, curated imagery and data." This ensures consistency with the iframe. |

---

## Implementation Checklist

- [ ] Create `/apps/nature-explorer/` directory
- [ ] Write `bridge.js` to handle tool invocations (mimic chess/go pattern)
- [ ] Write `index.html` to render species profiles, habitats, comparisons
- [ ] Implement `SpeciesProfile` component (card layout, images, taxonomy)
- [ ] Implement `ComparisonTable` component (side-by-side grid)
- [ ] Implement `HabitatGrid` component (thumbnail grid of species)
- [ ] Wire iNaturalist API client (search, taxa details, observations)
- [ ] Wire Perenual API client (plant search, plant details)
- [ ] Add content safety filters (image moderation)
- [ ] Test with sample queries: "monarch butterfly", "Amazon rainforest", "frog vs toad"
- [ ] Verify iframe sandbox perms (postMessage, localStorage, images)
- [ ] Write user docs (what Nature Explorer is, how to use it in chat)

---

## Example Conversations

### Scenario 1: Guided Discovery
```
Student: "I want to learn about insects that are really important to plants"

Chatbot: "Great question! Let's start with pollinators. How about I show you 
         one that's super important and beautiful?"
  → get_random_species(type="animal", difficulty="easy")
  → Returns: Honey bee

[Iframe: Beautiful bee profile with images, shows flowers it pollinates]

Chatbot: "This is a honey bee. See how its back legs have these pockets 
        (pollen baskets)? It visits flowers for nectar and pollen sticks to 
        it. When it visits the next flower, pollen rubs off and fertilizes 
        it. Want to see more pollinators?"

Student: "Sure! Show me more"

Chatbot: Calls explore_habitat(habitat="meadow", type="animal")
  → Returns: 12 pollinators (bees, butterflies, hummingbirds, beetles)

[Iframe: Grid of 12 species, all pollinators]

Chatbot: "Notice how different they are? Some have long beaks, some have fuzzy 
        bodies, some are tiny. Each has different flowers it's good at 
        pollinating. Some plants ONLY work with one pollinator—talk about 
        teamwork!"
```

### Scenario 2: Comparison Question
```
Student: "What's the difference between a frog and a toad?"

Chatbot action:
  → search_species(query="frog")
  → search_species(query="toad")
  → compare_species(species_ids=[frog_id, toad_id], aspects=["habitat", "skin", "behavior"])

[Iframe: Comparison table showing frog vs toad side-by-side]

Chatbot: "Great question! Both are amphibians, but notice the differences:
         Toads have bumpy, dry skin with toxins—their squat body is built 
         for walking on land. Frogs have smooth, moist skin and are built 
         for jumping and swimming. Frogs need water to breed; toads are 
         more independent. So if you find a bumpy guy hopping around your 
         yard on a dry night, it's probably a toad!"
```

### Scenario 3: Habitat Exploration
```
Student: "What lives in coral reefs?"

Chatbot:
  → explore_habitat(habitat="coral_reef", type="all", limit=15)

[Iframe: 15 species grid—fish, corals, crustaceans, octopuses with images]

Chatbot: "A coral reef is like an underwater rainforest! In a small area, 
        there's incredible diversity. See how colorful everything is? That's 
        adaptation: bright colors warn predators 'I'm toxic' or attract 
        mates. The reef is built by corals, which are actually animals that 
        work with algae. They're under stress from warming oceans, so 
        studying them helps us understand climate change."

Student: "That octopus looks cool. Tell me more."

Chatbot:
  → get_species_details(species_id="octopus_id", include_similar=true)

[Iframe: Full octopus profile with hunting behavior, adaptations]

Chatbot: "Octopuses are crazy smart—they solve puzzles, change color in 
        milliseconds, and can squeeze through tiny gaps. Want to learn about 
        their cousins, squid and cuttlefish?"
```

---

## Future Enhancements (Out of Scope)

- **Citizen science:** Let students report their own observations (iNaturalist integration)
- **Field guides:** Download offline species lists for outdoor exploration
- **AR identification:** Use device camera to identify species in real time
- **Endangered species alerts:** Focus on conservation education with species at risk
- **Food webs:** Build interactive food chains from habitat data
- **Sound embeddings:** Audio of frog calls, bird songs, etc.

