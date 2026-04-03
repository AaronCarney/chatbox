# Task 1: Replace Sidebar with ChatBridge Sidebar

## Status: COMPLETE

## Summary

Rewrote `Sidebar.tsx` to remove all unsafe Chatbox navigation (Settings, Image Creator, Copilots, Help, About, Dev Tools, SessionList, TaskSessionList, task toggle, version check). Kept SwipeableDrawer shell, responsive resize, and collapse button. Now shows only ChatBridge branding, Clerk UserButton, and New Chat button.

## Files Modified
- `/home/context/projects/chatbridge/src/renderer/Sidebar.tsx` (-251, +17 lines)

## Tests
- 0 added (skip-tdd: static UI, no logic)
- 580 passing, 7 pre-existing failures (token-estimation analyzer), 0 regressions

## Build
- `pnpm vite build` passes clean

## Commit
- `730143c` feat: replace Chatbox sidebar with ChatBridge sidebar
