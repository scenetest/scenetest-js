# Security Issues

This document contains security issues identified during a security review of scenetest-js. Each section can be used to create a GitHub issue.

---

## Issue 1: Document security boundaries for dev mode

**Labels:** security, documentation

### Summary
The project should clearly document that dev mode runs with full privileges and is not designed for untrusted code.

### Background
The security review identified that:
- User-provided assertion code is embedded directly into generated virtual modules (`packages/vite-plugin/src/virtual-module.ts:73-76`)
- This code executes via SSR without sandboxing (`packages/vite-plugin/src/middleware.ts:74`)

While this is acceptable for dev-only tooling, users should understand the security model.

### Progress
- [x] Add inline comments in virtual-module.ts warning about the security implications (DONE - see lines 63-67)
- [ ] Add a "Security Considerations" section to README.md explaining:
  - Dev mode executes assertion code with full server privileges
  - Only run scenetest in development with trusted code
  - Production builds strip all test code (so no exposure in prod)
