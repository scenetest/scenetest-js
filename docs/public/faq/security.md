# Is it safe to run Scenetest in development?

Yes. Scenetest is designed with security in mind, even for dev tooling:

**Server functions are declared at build time.** The Vite plugin extracts `serverCheck()` server functions during the build/transform phase. This means only code that exists in your source files at build time can run on the server - it's impossible for malicious JavaScript loaded at runtime (e.g., from a compromised CDN or XSS attack) to execute server-side code.

**Server functions never return data.** The `serverCheck()` API is intentionally one-way: your server function receives data from the browser and can call `should()` or `failed()`, but it cannot return values. This eliminates an entire class of data exfiltration attacks.

**Minimal dependencies.** The core Scenetest packages have very few dependencies, reducing supply chain attack surface. The runtime assertion code (`should`, `failed`) has zero dependencies.

**Production builds strip everything.** The Vite plugin automatically removes all Scenetest imports and function calls in production builds. No test code, no dev panel, no server endpoints - zero bundle impact and zero attack surface in production.

Scenetest runs with the same trust model as the rest of your development tooling. If you trust your source code and your build process, Scenetest should not increase your risk.

## Test credentials are fixtures, not secrets

Actor passwords live in your actor files, checked into the repo and deployed to your test box. Assume they're breached. By convention, make them all the same — one obviously fake value like `password` or `test123` across every actor — partly as a standing reminder of their status, and partly as a forcing function: fixtures that only log into seeded test accounts can't accidentally be pointed at an environment with real users, because nothing would log in.

Two things follow from assuming the breach:

- **Your test environment must tolerate a hostile logged-in user.** This is not a new requirement — it's the same property you already need in production so that users can't elevate privileges. A breached test credential should buy an attacker exactly what any user has: one seeded account on a disposable box.
- **Session-derived artifacts inherit the same status.** Warmup storage state (cookies, tokens), DOM contents, dashboard events, and run reports all come from those sessions. Scenetest keeps typed values out of dashboard events and report timelines, but treat all run artifacts as visible to anyone who can reach the test environment, and keep the environment's perimeter — not the credentials — as the boundary you actually defend.

One line to keep sharp: **actor credentials are fixtures; infrastructure credentials are not.** Database connection strings and API keys in `config.server` are real secrets — keep them in environment variables, never in actor files or team tags. Tags ride on dashboard events by design, so anything in a tag is visible wherever events go.
