'use strict'

// Differential engine for base-vs-head CI reports.
//
// Pure functions with no GitHub or network coupling: require() it from an
// actions/github-script step, or run `node delta.cjs --selftest` locally to
// check the pairing logic after you edit it.

const fs = require('fs')

const DEFAULT_PROXIMITY = 10

// ── Parsers ──────────────────────────────────────────────────────────────
// Each parser turns one raw output line into a comparable record. `rest` holds
// everything that identifies the issue APART from its line number, so a pure
// line shift can be recognised and discounted.

const parsers = {
	// tsc: src/foo.ts(12,5): error TS2339: Property 'x' does not exist.
	tsc: (raw) => {
		const m = raw.match(/^(.+?)\((\d+),(\d+)\):\s*(error\s+TS\d+:\s*.*)$/)
		return m ?
				{ file: m[1], line: +m[2], col: +m[3], rest: m[4], raw }
			:	{ file: '', line: 0, col: 0, rest: raw, raw }
	},

	// unix format, emitted by eslint -f unix, oxlint -f unix, ruff, vet,
	// golangci-lint, and most others: src/foo.ts:12:5: message [rule]
	unix: (raw) => {
		const m = raw.match(/^([^:]+):(\d+):(\d+):\s*(.*)$/)
		return m ?
				{ file: m[1], line: +m[2], col: +m[3], rest: m[4], raw }
			:	{ file: '', line: 0, col: 0, rest: raw, raw }
	},

	// A bare file path. Used for formatter drift, where the unit of change is
	// the whole file and there is no line number to shift.
	file: (raw) => ({ file: raw, line: 0, col: 0, rest: raw, raw }),
}

// ── The diff ─────────────────────────────────────────────────────────────

/**
 * Compare two sorted line lists and classify every difference.
 *
 * Set `proximity` to 0 to skip shift-pairing and get a plain set difference,
 * which is what you want when the unit is a file rather than a line.
 *
 * @returns {{base:number, head:number, added:Array, resolved:Array, moved:Array}}
 */
function differential(baseLines, headLines, parse, proximity = DEFAULT_PROXIMITY) {
	const baseSet = new Set(baseLines)
	const headSet = new Set(headLines)
	const appeared = headLines.filter((l) => !baseSet.has(l)).map(parse)
	const disappeared = baseLines.filter((l) => !headSet.has(l)).map(parse)
	const counts = { base: baseLines.length, head: headLines.length }

	if (!proximity) {
		return { ...counts, added: appeared, resolved: disappeared, moved: [] }
	}

	// An unrelated edit above an issue bumps its line number, which would
	// otherwise report as one resolved plus one new. Pair those instead: same
	// file, same column, same message, within ±proximity lines. A changed
	// column means the code itself moved, so that stays a real new issue.
	const pool = [...disappeared]
	const added = []
	const moved = []
	for (const item of appeared) {
		const i = pool.findIndex(
			(r) =>
				r.file === item.file &&
				r.col === item.col &&
				r.rest === item.rest &&
				Math.abs(r.line - item.line) <= proximity
		)
		if (i >= 0) {
			moved.push({ from: pool[i], to: item })
			pool.splice(i, 1)
		} else {
			added.push(item)
		}
	}
	return { ...counts, added, resolved: pool, moved }
}

// ── Rendering ────────────────────────────────────────────────────────────

const readLines = (path) =>
	fs.existsSync(path) ?
		fs.readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)
	:	[]

const trend = (head, base) => (head < base ? '🟢' : head > base ? '🔺' : '➖')

const movedNote = (moved, proximity = DEFAULT_PROXIMITY) =>
	moved.length ? ` (${moved.length} shifted within ±${proximity} lines, not counted)` : ''

/** "**Before:** 4 error(s) → **After:** 6 error(s) (+2 new, −0 resolved)" */
function countSummary(d, noun, { showTrend = false } = {}) {
	const prefix = showTrend ? `${trend(d.head, d.base)} ` : ''
	const change =
		d.added.length || d.resolved.length ?
			` (+${d.added.length} new, −${d.resolved.length} resolved)`
		:	' (no change)'
	return `${prefix}**Before:** ${d.base} ${noun} → **After:** ${d.head} ${noun}${change}${movedNote(d.moved)}`
}

/**
 * A fenced list, capped so one bad commit cannot blow the comment size limit.
 * Returns null when there is nothing to show, so callers can drop the section
 * with `.filter((l) => l !== null)` without also dropping their blank lines.
 */
function listBlock(title, items, cap = 50) {
	if (!items.length) return null
	const shown = items.slice(0, cap).map((e) => e.raw ?? e)
	const more = items.length > cap ? `\n… and ${items.length - cap} more` : ''
	return `\n**${title} (${items.length}):**\n\`\`\`\n${shown.join('\n')}${more}\n\`\`\``
}

/** Group file paths by extension: 80 .sql files read differently from 80 .tsx. */
function byExtension(files) {
	const counts = {}
	for (const f of files) {
		const name = f.slice(f.lastIndexOf('/') + 1)
		const dot = name.lastIndexOf('.')
		const ext = dot > 0 ? name.slice(dot) : '(no ext)'
		counts[ext] = (counts[ext] || 0) + 1
	}
	return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

// ── Size reporting ───────────────────────────────────────────────────────

const formatBytes = (n) => (n / 1024).toFixed(2) + ' kB'

function deltaLabel(head, base) {
	const d = head - base
	const pct = base ? ((d / base) * 100).toFixed(2) : '0.00'
	const sign = d > 0 ? '+' : ''
	return `${trend(head, base)} ${sign}${(d / 1024).toFixed(2)} kB (${sign}${pct}%)`
}

function sizeTable(headRaw, headGz, baseRaw, baseGz) {
	return [
		'|         | Base | Head | Δ |',
		'|---------|------|------|---|',
		`| Raw | ${formatBytes(baseRaw)} | ${formatBytes(headRaw)} | ${deltaLabel(headRaw, baseRaw)} |`,
		`| Gzipped | ${formatBytes(baseGz)} | ${formatBytes(headGz)} | ${deltaLabel(headGz, baseGz)} |`,
	].join('\n')
}

// ── Self-test ────────────────────────────────────────────────────────────

function selftest() {
	const assert = require('assert')
	const p = parsers.unix

	// A pure line shift is paired, not double-counted.
	const shifted = differential(['a.ts:10:5: no-explicit-any'], ['a.ts:14:5: no-explicit-any'], p)
	assert.equal(shifted.added.length, 0, 'shift within tolerance must not count as new')
	assert.equal(shifted.resolved.length, 0, 'shift within tolerance must not count as resolved')
	assert.equal(shifted.moved.length, 1)

	// Beyond the tolerance it is a genuine change.
	const far = differential(['a.ts:10:5: no-explicit-any'], ['a.ts:99:5: no-explicit-any'], p)
	assert.equal(far.added.length, 1, 'shift beyond tolerance must count as new')
	assert.equal(far.resolved.length, 1)

	// A changed column is a real new issue even when the line barely moved.
	const recolumned = differential(['a.ts:10:5: no-explicit-any'], ['a.ts:11:9: no-explicit-any'], p)
	assert.equal(recolumned.added.length, 1, 'changed column must count as new')

	// proximity 0 is a plain set difference.
	const plain = differential(['x.ts'], ['y.ts'], parsers.file, 0)
	assert.equal(plain.added.length, 1)
	assert.equal(plain.resolved.length, 1)
	assert.equal(plain.moved.length, 0)

	// Identical input is a no-op.
	const same = differential(['a.ts:1:1: x'], ['a.ts:1:1: x'], p)
	assert.equal(same.added.length + same.resolved.length + same.moved.length, 0)

	// tsc lines parse into their parts.
	const t = parsers.tsc("src/foo.ts(12,5): error TS2339: Property 'x' does not exist.")
	assert.equal(t.file, 'src/foo.ts')
	assert.equal(t.line, 12)
	assert.equal(t.col, 5)

	// An unparseable line still round-trips instead of being dropped.
	const junk = parsers.tsc('some unstructured warning')
	assert.equal(junk.raw, 'some unstructured warning')

	console.log('delta.cjs self-test passed (7 cases)')
}

module.exports = {
	DEFAULT_PROXIMITY,
	parsers,
	differential,
	readLines,
	trend,
	movedNote,
	countSummary,
	listBlock,
	byExtension,
	formatBytes,
	deltaLabel,
	sizeTable,
}

if (require.main === module && process.argv.includes('--selftest')) selftest()
