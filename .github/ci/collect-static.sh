#!/usr/bin/env bash
# Collect normalised static-check output into $1.
#
# Runs once on the head tree and once on the base tree, always from the repo
# root. Output is one sorted line per issue, so the diff engine can treat the
# two runs as comparable sets.
#
# Only the typecheck runs here. This repo has no lint script and no format
# script, so there is nothing else to collect. The script keeps its shape so a
# linter can be added later without touching the workflow.
#
# ORDER MATTERS: run this AFTER `pnpm build`. Every package resolves its
# workspace siblings through their published `dist/*.d.ts`, so `tsc --noEmit`
# on an unbuilt tree reports about forty `TS2307 Cannot find module
# '@scenetest/...'` errors that say nothing about the code. The built `dist/` is
# this repo's "generate before you typecheck" step.

# Deliberately no `-e`: the typecheck exits non-zero when it finds errors, which
# is the normal case here, not a script failure.
set -uo pipefail

OUT="${1:?usage: collect-static.sh <output-dir>}"
mkdir -p "$OUT"

# Byte-order sorting, so the two trees produce comparable lists even if the two
# runners ever differ in locale.
export LC_ALL=C

# `pnpm -r typecheck` runs `tsc --noEmit` in each workspace package and prefixes
# every line with the package's directory:
#
#   packages/scenes typecheck: src/types.ts(12,5): error TS2322: ...
#
# The prefix is repo-root-relative; the tsc path after it is package-relative.
# The sed below splices the two into one repo-root-relative path, so both trees
# produce identically shaped keys:
#
#   packages/scenes/src/types.ts(12,5): error TS2322: ...
#
# Without that, every issue would key on a package-relative path and two
# packages with a `src/index.ts` would collide.
#
# `--no-bail`: without it pnpm stops at the first failing package, so how much
# of the repo gets typechecked depends on which package fails first. The delta
# would then swing wildly on unrelated changes.
#
# `--reporter=append-only`: pins the prefixed line format. pnpm picks a
# different reporter on a TTY, and the sed above depends on this one.
#
# The grep drops pnpm's own summary lines ("Summary: 9 fails, 3 passes") and the
# absolute paths in its error epilogue. Those change with the count and with the
# runner's working directory, so they would diff as pure noise.
pnpm -r --no-bail --reporter=append-only typecheck 2>&1 |
	grep ': error TS' |
	sed 's#^\([^[:space:]]\{1,\}\) typecheck: #\1/#' |
	sort >"$OUT/typecheck.txt"
status=${PIPESTATUS[0]}

# A typechecker that failed but printed nothing the grep recognises would leave
# an empty file, which reads as zero errors and merges clean. Record the failure
# as an issue instead.
if [ "$status" -ne 0 ] && [ ! -s "$OUT/typecheck.txt" ]; then
	echo "typecheck:0:0: error TS0000: the typechecker exited $status without recognisable error lines — see the job log" \
		>"$OUT/typecheck.txt"
fi

# Never let a missing file break the render step.
[ -f "$OUT/typecheck.txt" ] || : >"$OUT/typecheck.txt"

wc -l "$OUT"/*.txt
