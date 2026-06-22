#!/bin/bash
# File a GitHub issue on any repo, including ones outside this session's scope.
#
# The built-in GitHub tools are scoped to the repo this web session started
# from, so they can't open issues on sibling repos (e.g. scenetest-cloud).
# This posts to the GitHub REST API (api.github.com, which is reachable under
# the default "Trusted" network policy) using a fine-grained PAT.
#
# Token: set GH_TOKEN (or GH_ISSUES_TOKEN) as an environment variable on the
# Claude Code web environment. It needs only "Issues: Read and write" on the
# target repos — no Contents access, so it can't push code.
#
# Usage:
#   file-issue.sh <owner/repo> <title> [body] [label,label,...]
#
# Examples:
#   file-issue.sh scenetest/scenetest-cloud "Receiver drops run:end" "Repro: ..."
#   file-issue.sh scenetest/scenetest-cloud "Flaky waterfall test" "" bug,flaky

set -euo pipefail

repo="${1:-}"
title="${2:-}"
body="${3:-}"
labels_csv="${4:-}"

if [ -z "$repo" ] || [ -z "$title" ]; then
  echo "usage: file-issue.sh <owner/repo> <title> [body] [label,label,...]" >&2
  exit 2
fi

token="${GH_TOKEN:-${GH_ISSUES_TOKEN:-}}"
if [ -z "$token" ]; then
  echo "error: no token. Set GH_TOKEN (or GH_ISSUES_TOKEN) in the environment's" >&2
  echo "       variables with a fine-grained PAT scoped to Issues: Read and write." >&2
  exit 1
fi

# Build the JSON payload safely with jq (pre-installed in cloud sessions).
if [ -n "$labels_csv" ]; then
  IFS=',' read -ra _labels <<< "$labels_csv"
  labels_json="$(printf '%s\n' "${_labels[@]}" | jq -R . | jq -s .)"
else
  labels_json='[]'
fi
payload="$(jq -n --arg t "$title" --arg b "$body" --argjson l "$labels_json" \
  '{title: $t, body: $b} + (if ($l | length) > 0 then {labels: $l} else {} end)')"

# POST and capture body + status separately.
resp="$(curl -sS -w '\n%{http_code}' \
  -X POST "https://api.github.com/repos/$repo/issues" \
  -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "$payload")"
code="${resp##*$'\n'}"
json="${resp%$'\n'*}"

if [ "$code" = "201" ]; then
  echo "Created: $(echo "$json" | jq -r '.html_url')"
else
  echo "Failed (HTTP $code): $(echo "$json" | jq -r '.message // .' 2>/dev/null || echo "$json")" >&2
  exit 1
fi
