# Task 18: Chess Engine Wrapper

## Summary
Created thin wrapper around chess.js for use by board and bridge modules.

## Implementation
- **File:** `apps/chess/engine.js`
- **Approach:** IIFE wrapping chess.js globals, exported on `window.ChessEngine`
- **Functions:**
  - `newGame()` — creates new Chess instance
  - `makeMove(game, from, to)` — executes move with auto-promotion to queen
  - `getState(game)` — returns game state (FEN, turn, move count, check/gameover status, last 5 moves)
  - `getLegalMoves(game)` — returns all legal moves

## Status
COMPLETE — file created, committed as `feat: chess engine wrapper`

## Notes
- Assumes `window.Chess` is globally available (loaded via CDN in Task 19)
- Includes early error check if chess.js not found
- Ready for consumption by board and bridge modules
