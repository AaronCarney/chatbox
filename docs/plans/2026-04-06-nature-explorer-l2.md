# L2: Nature Explorer Implementation

**Spec:** `docs/specs/2026-04-06-nature-explorer.md`
**Repo:** `/home/context/projects/chatbridge`
**Branch:** `main`

## Plan

```json
{
  "plan_id": "nature-explorer-l2",
  "created": "2026-04-06",
  "waves": [
    {
      "id": "wave-1",
      "description": "Server routes + iframe app (independent, parallelizable)",
      "tasks": [
        {
          "id": "T1",
          "title": "Server routes — iNaturalist + Perenual proxy",
          "description": "Create Express routes that proxy iNaturalist and Perenual APIs with response normalization, taxonomy blocklist, and license filtering.",
          "files_to_create": [
            "server/src/routes/nature.ts",
            "server/src/lib/taxonomy-blocklist.ts"
          ],
          "files_to_modify": [
            "server/src/index.ts"
          ],
          "acceptance_criteria": [
            "GET /api/nature/search?q=butterfly returns normalized species list from iNaturalist taxa autocomplete",
            "GET /api/nature/species/:id returns full species details with taxonomy, images, fun facts from iNaturalist taxa endpoint",
            "GET /api/nature/habitat?habitat=rainforest returns species list from iNaturalist observations filtered by place/taxon",
            "GET /api/nature/random returns a random species with full details",
            "All routes filter by quality_grade=research and CC licenses",
            "Taxonomy blocklist excludes roadkill/parasite keywords from results",
            "Perenual API key read from PERENUAL_API_KEY env var (optional — routes work without it, just fewer plant results)",
            "Routes registered in server/src/index.ts",
            "Tests verify search, details, habitat, random endpoints with mocked API responses"
          ],
          "test_strategy": "Unit tests with mocked fetch for iNaturalist/Perenual responses. Test blocklist filtering, license filtering, error handling.",
          "estimated_complexity": "medium"
        },
        {
          "id": "T2",
          "title": "Iframe app — Nature Explorer UI + bridge",
          "description": "Create the Nature Explorer iframe app with search results, species detail, habitat grid, and comparison views. Wire ChatBridge SDK for tool invocations.",
          "files_to_create": [
            "src/renderer/public/apps/nature-explorer/index.html",
            "src/renderer/public/apps/nature-explorer/app.js",
            "src/renderer/public/apps/nature-explorer/bridge.js",
            "src/renderer/public/apps/nature-explorer/styles.css"
          ],
          "files_to_modify": [],
          "acceptance_criteria": [
            "index.html loads ChatBridge SDK from /sdk/chatbridge-sdk.js",
            "bridge.js handles all 5 tool invocations via ChatBridge.on('toolInvoke') and calls ChatBridge.respondToTool()",
            "app.js renders 4 views: search results grid, species detail profile, habitat grid, comparison table",
            "Search results show card grid with image, common name, scientific name, IUCN conservation badge",
            "Species detail shows hero image, taxonomy tree, habitat, diet, behavior, fun facts, conservation status, photo attribution",
            "Habitat grid shows species thumbnails in responsive grid",
            "Comparison table shows side-by-side species data",
            "Nature color palette: forest green #2D5016, earth brown #8B6F47, cream #F5E6D3",
            "ChatBridge.sendState() called after each tool response",
            "ChatBridge.resize() called on view changes",
            "No ChatBridge.complete() call (browse-based)",
            "Responsive layout, accessible (alt text on images, semantic HTML)"
          ],
          "test_strategy": "Manual verification — iframe apps are vanilla JS, no unit test framework. Verify tool handlers respond correctly by testing with the chat interface.",
          "estimated_complexity": "medium"
        }
      ]
    },
    {
      "id": "wave-2",
      "description": "DB seed + integration wiring (depends on T1 routes existing)",
      "tasks": [
        {
          "id": "T3",
          "title": "DB seed + docs update",
          "description": "Add nature-explorer to DB seed with 5 tool schemas. Update docs (decisions.md, api.md, cost-analysis.md, README).",
          "files_to_create": [],
          "files_to_modify": [
            "server/src/db/seed.ts",
            "docs/decisions.md",
            "docs/api.md",
            "docs/cost-analysis.md",
            "README.md"
          ],
          "acceptance_criteria": [
            "Nature Explorer app registered in seed.ts with correct id, name, description_for_model, iframe_url, auth_type, and 5 tool schemas",
            "seed() function calls nature explorer insert on startup",
            "docs/decisions.md has Nature Explorer section with key decisions",
            "docs/api.md has /api/nature/* endpoint documentation",
            "docs/cost-analysis.md includes iNaturalist (free) and Perenual (free tier) costs",
            "README.md architecture diagram updated with Nature Explorer"
          ],
          "test_strategy": "Run seed against DB, verify app appears in /api/apps response. Verify docs are accurate.",
          "estimated_complexity": "low"
        }
      ]
    },
    {
      "id": "wave-3",
      "description": "Build, test, deploy",
      "tasks": [
        {
          "id": "T4",
          "title": "Build + test + deploy",
          "description": "Run full build, verify tests pass, push to main, deploy frontend to Vercel and backend to Railway.",
          "files_to_create": [],
          "files_to_modify": [],
          "acceptance_criteria": [
            "pnpm vite build succeeds",
            "pnpm vitest run passes (pre-existing 6 failures OK)",
            "git push origin main succeeds",
            "Vercel deployment succeeds with VITE_API_URL pointing to Railway",
            "Nature Explorer accessible at deployed URL",
            "All 5 tools functional end-to-end"
          ],
          "test_strategy": "Build + test + deploy commands. Manual E2E verification.",
          "estimated_complexity": "low"
        }
      ]
    }
  ],
  "dependency_graph": {
    "T1": [],
    "T2": [],
    "T3": ["T1"],
    "T4": ["T1", "T2", "T3"]
  }
}
```
