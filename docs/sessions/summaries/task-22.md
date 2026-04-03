# Task 22: Go Canvas Board UI

**Status:** Complete
**Commit:** feat: Go canvas board UI

## Files Created

- `apps/go/index.html` — Page shell; loads SDK, engine.js, board.js, bridge.js; canvas #board 400x400; #status and #captures divs
- `apps/go/styles.css` — Centered flex layout, 1px solid border on canvas, #status (16px, 10px margin), #captures (14px, gray)
- `apps/go/board.js` — `window.GoBoard` with three methods:
  - `render(game)`: wood background (#dcb35c), grid lines, star points for 9x9 and 19x19, black/white stones as filled circles
  - `onClick(event, game)`: maps clientX/Y to board intersection, validates bounds, returns `{x, y}` or null
  - `updateStatus(game)`: sets #status to turn/game-over text, #captures to capture counts

## Notes

- Star points use 0-indexed board coordinates matching the spec (9x9: [2,2],[6,2],[2,6],[6,6],[4,4]; 19x19: standard 9-point layout)
- Board grid uses 1-based pixel offsets (cellSize = canvasWidth / (size + 1)) so stones at edges have equal margins
