# Task 21: Go Engine

## Status: COMPLETE

## What Was Built

`apps/go/engine.js` — vanilla JS Go board game engine exposed as `window.GoEngine`.

## API

- `newGame(boardSize)` — validates 9/13/19, defaults to 9. Returns game state.
- `idx(x, y, size)` — flat array index helper.
- `neighbors(x, y, size)` — adjacent [x,y] pairs within bounds.
- `getGroup(board, x, y, size)` — BFS flood-fill returning `{ stones, liberties }`.
- `placeStone(game, x, y)` — full rule enforcement: bounds, occupied, ko, capture, suicide. Returns `{ success, captured }` or `{ error }`.
- `passTurn(game)` — two consecutive passes triggers game over with `simpleScore`.
- `simpleScore(game)` — stone count + captures + 6.5 komi for white.
- `boardToString(game)` — rows of `.`/`B`/`W` joined by newlines.
- `getState(game)` — `{ board, turn, captures, size, passCount }`.

## Key Logic Notes

- Capture loop uses a `seen` Set to avoid double-counting groups sharing neighbor cells.
- Suicide check runs after captures so a move that captures and then has liberties is legal.
- Ko is set only when exactly 1 stone is captured and the placing group is also size 1.

## Commit

`ed6095c feat: Go engine with capture/ko/scoring`
