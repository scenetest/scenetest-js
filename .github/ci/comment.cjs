'use strict'

// Assembles one PR comment from the markdown fragments each check job wrote,
// then upserts it. Keeping this separate from delta.cjs means the diff engine
// stays testable without a GitHub token.

const fs = require('fs')
const path = require('path')

// GitHub rejects an issue comment body over 65536 characters.
const MAX_BODY = 65000

/**
 * The hidden line that identifies this workflow's comment.
 *
 * Hidden rather than the visible heading: matching on displayed text means
 * rewording the heading orphans every comment already on an open PR, and the
 * next run posts a second one beside it.
 */
const marker = (id) => `<!-- ci-delta:${id} -->`

/**
 * Read every `<order>-<name>.md` fragment in a directory and join them.
 *
 * Each check job uploads its fragment as an artifact; the reporting job
 * downloads them all into one directory. The numeric filename prefix fixes the
 * section order, so jobs finishing out of order still render consistently.
 */
function assemble(dir, { id, title, header = '' }) {
	const fragments =
		fs.existsSync(dir) ?
			fs
				.readdirSync(dir, { recursive: true })
				.filter((f) => typeof f === 'string' && f.endsWith('.md'))
				.sort()
				.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim())
				.filter(Boolean)
		:	[]

	if (!fragments.length) {
		return [marker(id), title, '', '_No check produced a report. Check the job logs._'].join('\n')
	}

	const parts = [marker(id), title]
	if (header) parts.push('', header)
	parts.push('', fragments.join('\n\n---\n\n'))
	const body = parts.join('\n')
	return body.length > MAX_BODY ? body.slice(0, MAX_BODY) + '\n\n_… report truncated._' : body
}

/**
 * Create the comment, or edit the one this workflow wrote last time.
 *
 * Matching on the hidden marker is what keeps a busy PR to a single comment
 * that updates in place, instead of one comment per push.
 */
async function upsertComment(github, context, id, body) {
	const issue_number = context.issue.number
	if (!issue_number) return { skipped: 'not a pull request' }

	const { owner, repo } = context.repo
	const comments = await github.paginate(github.rest.issues.listComments, {
		owner,
		repo,
		issue_number,
		per_page: 100,
	})

	const existing = comments.find(
		(c) => c.body.includes(marker(id)) && c.user?.type === 'Bot'
	)

	if (existing) {
		await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
		return { updated: existing.id }
	}
	const { data } = await github.rest.issues.createComment({ owner, repo, issue_number, body })
	return { created: data.id }
}

/**
 * Delete comments left by markers this workflow no longer writes.
 *
 * Use it when you merge two checks into one section, or when you adopt this
 * workflow in a repo whose old CI posted its own comments — pass the leading
 * text of each retired comment, so the stale ones do not linger on open PRs.
 */
async function retireComments(github, context, markers) {
	const issue_number = context.issue.number
	if (!issue_number || !markers.length) return { deleted: 0 }

	const { owner, repo } = context.repo
	const comments = await github.paginate(github.rest.issues.listComments, {
		owner,
		repo,
		issue_number,
		per_page: 100,
	})

	let deleted = 0
	for (const c of comments) {
		if (!markers.some((m) => c.body.startsWith(m))) continue
		try {
			await github.rest.issues.deleteComment({ owner, repo, comment_id: c.id })
			deleted++
		} catch {
			// Best-effort: a comment someone already deleted is not an error.
		}
	}
	return { deleted }
}

module.exports = { MAX_BODY, marker, assemble, upsertComment, retireComments }
