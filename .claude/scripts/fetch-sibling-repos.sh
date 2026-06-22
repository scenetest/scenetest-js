#!/bin/bash
# Make sibling repositories available for read access in Claude Code web sessions.
#
# The built-in GitHub MCP tools (mcp__github__*) are scoped to the repo a web
# session was started from, so they can't read other repos. Plain git through
# the cloud session's GitHub proxy, however, can read any repo the connected
# GitHub account can see. This hook clones (or refreshes) those repos next to
# this one so they're on disk for grep/read every session.
#
# Cloud-only: it no-ops on a local machine, where you already have your repos.

set -u

# Only run inside Claude Code on the web. Locally this is a no-op.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Repos to make available, as <owner>/<name>. Add more lines as needed.
REPOS=(
  "scenetest/scenetest-cloud"
)

# Clone siblings next to the current project (e.g. /home/user/scenetest-cloud).
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PARENT_DIR="$(dirname "$PROJECT_DIR")"

for repo in "${REPOS[@]}"; do
  name="${repo##*/}"
  dest="$PARENT_DIR/$name"
  if [ -d "$dest/.git" ]; then
    echo "[fetch-sibling-repos] updating $repo in $dest"
    git -C "$dest" pull --ff-only --quiet || echo "[fetch-sibling-repos] pull failed for $repo (continuing)"
  else
    echo "[fetch-sibling-repos] cloning $repo into $dest"
    git clone --quiet "https://github.com/$repo" "$dest" \
      || echo "[fetch-sibling-repos] clone failed for $repo (continuing)"
  fi
done

# Never block session startup on a fetch hiccup.
exit 0
