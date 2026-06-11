# Is it safe to run Scenetest in development?

Yes. Scenetest is designed with security in mind, even for dev tooling:

**Server functions are declared at build time.** The Vite plugin extracts `serverCheck()` server functions during the build/transform phase. This means only code that exists in your source files at build time can run on the server - it's impossible for malicious JavaScript loaded at runtime (e.g., from a compromised CDN or XSS attack) to execute server-side code.

**Server functions never return data.** The `serverCheck()` API is intentionally one-way: your server function receives data from the browser and can call `should()` or `failed()`, but it cannot return values. This eliminates an entire class of data exfiltration attacks.

**Minimal dependencies.** The core Scenetest packages have very few dependencies, reducing supply chain attack surface. The runtime assertion code (`should`, `failed`) has zero dependencies.

**Production builds strip everything.** The Vite plugin automatically removes all Scenetest imports and function calls in production builds. No test code, no dev panel, no server endpoints - zero bundle impact and zero attack surface in production.

Scenetest runs with the same trust model as the rest of your development tooling. If you trust your source code and your build process, Scenetest should not increase your risk.

## Test credentials are fixtures, not secrets

Actor passwords are checked into the repo and deployed to your test box — assume they're breached. By convention, give every actor the same obviously fake password (`password`, `test123`): it reminds you they're not secrets, and fixtures that only log into seeded accounts can't be pointed at an environment with real users.

It follows that your test environment must tolerate a hostile logged-in user — the same property production needs so users can't elevate privileges — and that session-derived artifacts (storage state, DOM, dashboard events, reports) are only as private as the box itself. Defend the environment's perimeter, not the credentials.

The exception: **infrastructure credentials are real secrets.** Keep database URLs and API keys in environment variables — never in actor files or team tags (tags ride on dashboard events by design).
