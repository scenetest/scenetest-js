'use strict'

// Check 0: did the build survive, and whose fault is it?
//
//   node -e "require('./.github/ci/render-build.cjs')({
//     head: '/tmp/head', base: '/tmp/base', out: '/tmp/fragments'
//   })"
//
// Both build steps run under `continue-on-error` and write two files into their
// artifact: `build.outcome` (the step outcome) and `build.log`. Reading both
// trees is what turns "the build failed" into one of four different messages.
// A PR that inherits a broken base branch should not be told it broke the
// build, and a PR that repairs one deserves to hear so.
//
// When both trees build, this writes no markdown at all. A bot that says "the
// build works" on every green PR is scroll cost.

const fs = require('fs')
const path = require('path')

// How many log lines to quote. Enough to carry one error plus its import trace.
const EXCERPT = 40

// The first line of an error in this repo's build output. The excerpt is
// anchored on this rather than on the tail of the log, because pnpm prints a
// per-package summary and an absolute-path epilogue after the useful part.
//
// Not anchored with `^`: `pnpm -r build` prefixes every line with the package
// directory, so the error text never starts the line —
//
//   packages/scenes build: src/types.ts(12,5): error TS2322: ...
//
// `tsc` supplies the first three alternatives, `vite build` the last two.
const ERROR_HEADING = /(: error TS\d+|ERR_PNPM|Exit status \d|\[vite\]|error during build)/

const read = (p) => {
	try {
		return fs.readFileSync(p, 'utf8')
	} catch {
		return ''
	}
}

/** `success`, `failure`, `skipped`, `cancelled`, or '' when the file is absent. */
const outcome = (dir) => read(path.join(dir, 'build.outcome')).trim()

// Only `success` counts as built. `skipped` and `cancelled` mean the tree was
// never measured, which is not the same as a clean build.
const built = (o) => o === 'success'

/** Strip ANSI so a colourised log does not render as escape codes in markdown. */
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

/**
 * Quote the part of the log a reader needs: from the first error heading, or
 * from the tail when no heading matches.
 */
function excerpt(log) {
	const lines = stripAnsi(log).split('\n').filter((l) => l.trim() !== '')
	if (!lines.length) return '_The build produced no output._'

	let start = lines.findIndex((l) => ERROR_HEADING.test(l))
	if (start === -1) start = Math.max(0, lines.length - EXCERPT)

	const shown = lines.slice(start, start + EXCERPT)
	const dropped = lines.length - start - shown.length
	return (
		'```\n' +
		shown.join('\n') +
		(dropped > 0 ? `\n… ${dropped} more line(s) in the job log` : '') +
		'\n```'
	)
}

module.exports = function render({ head, base, out }) {
	fs.mkdirSync(out, { recursive: true })

	const headOutcome = outcome(head)
	const baseOutcome = outcome(base)

	// Neither job recorded an outcome: this repo took no build-dependent check,
	// or both jobs died before the recording step. Say nothing and let the other
	// checks' own missing-measurement rules speak.
	if (!headOutcome && !baseOutcome) return

	const headOk = built(headOutcome)
	const baseOk = built(baseOutcome)

	let markdown = null
	if (headOk && baseOk) {
		markdown = null
	} else if (headOk && !baseOk) {
		markdown = [
			'#### Build',
			'',
			`✅ **This PR fixes the build.** The base branch does not build (\`${baseOutcome || 'no result'}\`); this tree does.`,
		].join('\n')
	} else if (!headOk && baseOk) {
		markdown = [
			'#### Build',
			'',
			'❌ **This PR breaks the build.** The base branch builds and this tree does not.',
			'',
			excerpt(read(path.join(head, 'build.log'))),
		].join('\n')
	} else {
		markdown = [
			'#### Build',
			'',
			'❌ **Neither tree builds.** The base branch is already broken, so this PR is probably not the cause — repair the base branch first.',
			'',
			excerpt(read(path.join(head, 'build.log'))),
		].join('\n')
	}

	if (markdown) fs.writeFileSync(path.join(out, '05-build.md'), markdown)
	fs.writeFileSync(
		path.join(out, '05-build.json'),
		JSON.stringify(
			{ check: 'build', headOk, baseOk, headOutcome, baseOutcome },
			null,
			2
		)
	)
}

module.exports.excerpt = excerpt
