# FairDrop Full-Loop Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing CoDropPass transaction page into a FairDrop demo that communicates discovery, conditional signup, order states, and organizer settlement while preserving real wallet behavior.

**Architecture:** Keep `src/App.tsx` as the stateful wagmi integration boundary and add local demo data plus view state around the existing contract actions. Use existing CSS tokens and asset, extending `src/style.css` with dashboard layout, activity cards, tabs, status chips, and responsive rules. No new dependencies or contract changes.

**Tech Stack:** React 19, TypeScript, Vite, wagmi, viem, plain CSS.

---

### Task 1: Add demo domain data and view state

**Files:**
- Modify: `src/App.tsx`

- [ ] Define typed demo activities, demo orders, and `view`/`selectedActivity` state near the existing component state.
- [ ] Derive a `demoMode` flag from missing contract data or disconnected wallet, while keeping contract reads enabled when an address exists.
- [ ] Add handlers for selecting an activity, switching views, simulated signup, and order filter changes.
- [ ] Run `npm run typecheck` and fix TypeScript errors.

### Task 2: Recompose the rendered application shell

**Files:**
- Modify: `src/App.tsx`

- [ ] Replace the single Hero-first body with a compact product header, view tabs, activity market/detail view, orders view, and organizer workspace view.
- [ ] Keep the existing real contract purchase form and transaction status mounted in the selected activity detail.
- [ ] Add explicit Demo Mode label and preserve network/wallet controls.
- [ ] Run `npm run typecheck`.

### Task 3: Add visual system for marketplace and workspace

**Files:**
- Modify: `src/style.css`

- [ ] Add styles for tabs, activity grid, activity cards, detail split, chips, progress bars, order rows, workspace metrics, and demo banner.
- [ ] Add responsive rules below 860px and 680px without changing existing mobile behavior.
- [ ] Preserve readable focus states and avoid nested card containers.

### Task 4: Verify and polish

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/style.css`

- [ ] Run `npm run build`.
- [ ] Start Vite with `npm run dev -- --host 0.0.0.0` and inspect the rendered page at desktop and mobile widths using browser tooling if available.
- [ ] Fix overflow, broken interactions, or build issues found during verification.
