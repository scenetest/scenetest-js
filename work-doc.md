# WORKING DOC FOR PRIMARY DEVELOPER

## Instructions for the coding agent

Under normal circumstances you will start by looking through the document for items that are pending or in an otherwise "ready" state, and then you'll attempt to do it! Go in whatever order you think is _most important_. (Revert your changes and move on after 3 missed attempts.) If you think you've succeeded at an item, run the linters, and fix things until they pass. It's very important after every item, whether you completed it, or just did some research, or tried and failed, you must add a DIFFICULTY score (1-to-4) underneath the COMPLEXITY score. (It does NOT have to be the same; it is used to give us information about when we have guessed incorrectly.)

Then add whatever notes you want, for later, git commit, (in the same commit along with the work on the item), and move on. If the commit fails, fix any errors and finish the commit. So when you're done, regardless of the status, update the item with a new status, difficulty, and your notes, and if necessary, amend notes to the prior commit. You do not have to go in any order. If something is large enough to warrant its own project doc, like a difficulty of 3 or 4, then make your own project doc and wait for human feedback before moving ahead to implementation.

If you have been instructed to do a BIG ITEMS PASS, then do one thing differently: start first by looking at the items that are marked as BIG ITEMS, or that you can see require analysis or have a complexity of 3 or 4. Otherwise, work through the doc item by item picking the ones most relevant to you, as you normally would, but not writing any code or doing any git commits, simply leaving your analysis and plans on these items and moving on.

---

## Items to tackle

### Inline Assertions Panel round 2
- **Status**: PENDING
- **Complexity**: 1 each
- **Difficulty**:
- **Tags**: DEV-PANEL
- **Description**:
  - when we click an item in the small panel and it opens in the big panel, we need it to scroll maybe 30px farther down because the fixed header
  - when we click an item in the small panel and it opens in the big panel, we should highlight the item at least for a second, so we can really see which one it corresponds to.
  - when you have a failure and it says `(1 after ✓)` I would like some way to go and see that! or maybe to click a kind of info toggle that hides everything except the other instances of this same test. The point is that we just need to be able to see "is this discrepancy a bad thing or is it fine?". The dev just needs some way of seeing that much context. use your best judgement and make a guess.


### Inline Assertions Panel
- **Status**: DONE
- **Complexity**: 1 each
- **Difficulty**: 1
- **Tags**: DEV-PANEL
- **Description**:
  - always show items grouped. remove the button to group and ungroup.
  - always treat as "collapsed" and we'll open items as needed. remove the button.
  - with item groups, even if there are 0 errors, next to `✓ 8` still show 0 errors. it's a positive sign. it can be gray instead of green.
  - this `(2 prior ✓, 3 after ✓)` we don't need to show it on the small panel; we need it on the big one only.
  - I don't like the click-to-open-in-vscode, but when in small-panel mode I think the main click on the item should open the fullscreen version to that item.
- **Notes**: All items implemented. Removed grouped/collapsed toggles from both panels. Zero errors shown in gray. History hidden on small panel. Clicking item in small panel opens fullscreen scrolled to that group.

### Multi-Context Assertions (assertion() API)
- **Status**: DESIGN READY - AWAITING REVIEW
- **Complexity**: 4
- **Tags**: BIG ITEM
- **Description**: The `assertion({ assertFn, appData })` API is more complex:
  - `appData` runs in browser, collects data
  - `assertFn` runs on server (Vite middleware) with database access
  - Vite plugin extracts assertFn at build time, generates RPC client
  - Server functions configured in `scenetest.config.ts`
- **Design Doc**: See `docs/design/server-actions.md`
- **Notes**: Design doc written. Key architecture: Vite plugin middleware serves as test server, no external process needed. assertFn extracted and served as virtual module. Browser calls `/__scenetest/run` endpoint with serialized appData. Results flow back through existing `__scenetest_report` mechanism.
- **Decisions made**:
  1. No imports in assertFn - everything via `server` or `fromApp`
  2. Optional `key` field for uniqueness in loops (combined with file location)

---

## Open Questions

1. **Assertion timing**: How do we know when to "wait" for assertions? The README mentions awaiting `form.submit()` should wait for assertions triggered by onSettled. Need to design a mechanism for this.

2. **Assertion identity**: How do we dedupe assertions that fire multiple times (e.g., on re-render)? Do we want to?

3. **Error handling**: If an assertion throws, should it break the scene flow or just record a failure?
   - Answer: Record a failure. Our scenes are not to be messed with by our inline assertions.

4. **Reporter format**: What format should assertion results take? Need to integrate with Playwright's reporter system.

---

## Reference

See `CLAUDE.md` for completed implementation notes.
