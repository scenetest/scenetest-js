# WORKING DOC FOR PRIMARY DEVELOPER

## Instructions for the coding agent

Under normal circumstances you will start by looking through the document for items that are pending or in an otherwise "ready" state, and then you'll attempt to do it! Go in whatever order you think is _most important_. (Revert your changes and move on after 3 missed attempts.) If you think you've succeeded at an item, run the linters, and fix things until they pass. It's very important after every item, whether you completed it, or just did some research, or tried and failed, you must add a DIFFICULTY score (1-to-4) underneath the COMPLEXITY score. (It does NOT have to be the same; it is used to give us information about when we have guessed incorrectly.)

Then add whatever notes you want, for later, git commit, (in the same commit along with the work on the item), and move on. If the commit fails, fix any errors and finish the commit. So when you're done, regardless of the status, update the item with a new status, difficulty, and your notes, and if necessary, amend notes to the prior commit. You do not have to go in any order. If something is large enough to warrant its own project doc, like a difficulty of 3 or 4, then make your own project doc and wait for human feedback before moving ahead to implementation.

If you have been instructed to do a BIG ITEMS PASS, then do one thing differently: start first by looking at the items that are marked as BIG ITEMS, or that you can see require analysis or have a complexity of 3 or 4. Otherwise, work through the doc item by item picking the ones most relevant to you, as you normally would, but not writing any code or doing any git commits, simply leaving your analysis and plans on these items and moving on.

---

## Items to tackle

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

- See `CLAUDE.md` for completed implementation notes.
- See `implementation-details.md` for previous choices you made and forgot.
- See `docs/design/server-actions.md` for design of our server-actions API.