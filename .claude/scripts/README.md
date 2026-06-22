# `.claude/scripts`

Helpers that run in Claude Code **web** sessions (cloud). They work around the
fact that a session's built-in GitHub tools are scoped to the repo it was
started from, so they can't read or write *other* repos.

## `fetch-sibling-repos.sh`
SessionStart hook. Clones (or fast-forward-pulls) sibling repos next to this
one so they're on disk for read/grep. Cloud-only; no-op locally. Edit the
`REPOS=( … )` array to change which repos are made available.

## `file-issue.sh`
Files an issue on **any** repo via the GitHub REST API (`api.github.com`,
reachable under the default *Trusted* network policy).

```
file-issue.sh <owner/repo> <title> [body] [label,label,...]
```

**One-time setup — a fine-grained PAT, no code-push power:**

1. github.com → Settings → Developer settings → **Fine-grained tokens** →
   Generate new token.
   - Resource owner: the org that owns the repos.
   - Repository access: select **both** repos (e.g. `scenetest/scenetest-js`,
     `scenetest/scenetest-cloud`).
   - Permissions → Repository → **Issues: Read and write**. Leave **Contents**
     at *No access* — the token cannot push commits or open PRs.
2. Add it to the Claude Code web environment's **Environment variables**:
   ```
   GH_TOKEN=github_pat_xxxxxxxx
   ```
   (Env vars are visible to anyone who can edit the environment — no secrets
   store exists yet.)

Filing an issue on *this* session's own repo needs no token — the built-in
GitHub tools already cover it. The PAT is only for cross-repo issue writing.
For both teams to file with each other, each person sets `GH_TOKEN` (with a PAT
they own, scoped to Issues) in their own environment.
