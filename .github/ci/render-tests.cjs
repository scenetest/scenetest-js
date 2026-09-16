'use strict'

// Render a test-run fragment. Single-branch: a test either passes on head or
// it does not, so there is nothing to diff against base.
//
//   node -e "require('./.github/ci/render-tests.cjs')({
//     results: '/tmp/test-results', out: '/tmp/out/fragments', outcome: 'success'
//   })"
//
// `results` is a DIRECTORY, not a file. `pnpm -r test` runs one Vitest process
// per package, and `--outputFile` is resolved against each package's own
// directory, so seven packages write seven reports. The workflow gathers them
// into one directory and this merges them. Pointing every package at one
// absolute path instead would have each run overwrite the last, leaving only
// whichever package finished last.

const fs = require('fs')
const path = require('path')

const CAP = 20

/** Parse one Vitest/Jest `--reporter=json` report. */
function parseOne(raw, label) {
	const r = JSON.parse(raw)
	const failures = []
	for (const file of r.testResults ?? []) {
		for (const t of file.assertionResults ?? []) {
			if (t.status !== 'failed') continue
			failures.push({
				name: [...(t.ancestorTitles ?? []), t.title].join(' › '),
				// Vitest writes absolute paths. Trim to repo-root-relative so a
				// failure reads the same as the file path in the PR's diff.
				file: file.name?.replace(process.cwd() + '/', '') ?? label,
				message: (t.failureMessages ?? []).join('\n').split('\n')[0] ?? '',
			})
		}
	}
	return {
		total: r.numTotalTests ?? 0,
		passed: r.numPassedTests ?? 0,
		failed: r.numFailedTests ?? failures.length,
		skipped: r.numPendingTests ?? 0,
		failures,
	}
}

/** Sum every report in a directory into one set of counts. */
function parseDir(dir) {
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()
	const s = { total: 0, passed: 0, failed: 0, skipped: 0, failures: [], packages: files.length }
	for (const f of files) {
		const one = parseOne(fs.readFileSync(path.join(dir, f), 'utf8'), f)
		s.total += one.total
		s.passed += one.passed
		s.failed += one.failed
		s.skipped += one.skipped
		s.failures.push(...one.failures)
	}
	return s
}

module.exports = function render({ results, out, outcome = '' }) {
	fs.mkdirSync(out, { recursive: true })

	const present = fs.existsSync(results) && fs.readdirSync(results).some((f) => f.endsWith('.json'))
	if (!present) {
		fs.writeFileSync(
			path.join(out, '50-tests.md'),
			'#### Tests\n\n⚠️ No results were produced — the runner probably crashed before writing output. Check the job log.'
		)
		// A missing report is a failure, not a pass. Say so to the gate.
		fs.writeFileSync(
			path.join(out, '50-tests.json'),
			JSON.stringify({ check: 'tests', failed: 1, missing: true }, null, 2)
		)
		return
	}

	const s = parseDir(results)

	// A runner that died after writing some reports leaves counts that look
	// clean. The step outcome is the only evidence of that, so carry it in and
	// refuse to report a pass the step itself did not claim.
	const silentFailure = outcome && outcome !== 'success' && s.failed === 0
	const icon = s.failed || silentFailure ? '❌' : '✅'

	const lines = [
		'#### Tests',
		'',
		`${icon} ${s.passed}/${s.total} passed across ${s.packages} package(s)` +
			(s.failed ? ` · **${s.failed} failed**` : '') +
			(s.skipped ? ` · ${s.skipped} skipped` : ''),
	]

	if (silentFailure) {
		lines.push(
			'',
			`⚠️ The test step reported \`${outcome}\` but no individual test failed. A package probably crashed before writing its report — check the job log.`
		)
	}

	if (s.failures.length) {
		const shown = s.failures.slice(0, CAP)
		const block = shown.map((f) => `✗ ${f.name}\n  ${f.file}\n  ${f.message}`.trimEnd()).join('\n\n')
		const more = s.failures.length > CAP ? `\n\n… and ${s.failures.length - CAP} more` : ''
		lines.push('', `**Failed (${s.failures.length}):**`, '', '```', block + more, '```')
	}

	fs.writeFileSync(path.join(out, '50-tests.md'), lines.join('\n'))
	fs.writeFileSync(
		path.join(out, '50-tests.json'),
		JSON.stringify(
			{ check: 'tests', failed: silentFailure ? 1 : s.failed, total: s.total },
			null,
			2
		)
	)
}

module.exports.parseOne = parseOne
module.exports.parseDir = parseDir
