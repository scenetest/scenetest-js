#!/usr/bin/env node

/**
 * Codemod: see → scope
 *
 * Converts `see` to `scope` in .spec.md files where `see` was being used
 * to narrow scope (i.e., followed by actions that depend on being inside
 * that element).
 *
 * Heuristic: a `see X` line becomes `scope X` when followed — in the same
 * actor block — by any scope-dependent action before a scope-resetting one:
 *
 *   Scope-dependent (triggers conversion):
 *     typeInto, check, select     — strict scope resolution, no fallback
 *     bare click (no selector)    — clicks the current scope element
 *     prev                        — pops scope stack (implies see pushed)
 *     up <selector>               — navigates to ancestor of current scope
 *     scope                       — narrows further within current scope
 *
 *   Scope-resetting (clears pending sees):
 *     openTo, reload, goBack, goForward, switchDevice
 *     bare up (no selector)       — resets to page root
 *
 * Usage:
 *   node scripts/codemod-see-to-scope.mjs [--write] [paths...]
 *
 *   --write    Modify files in place (default: dry-run, prints diff)
 *   paths...   Specific .spec.md files or directories to scan
 *              (default: current working directory, recursive)
 *
 * Examples:
 *   node scripts/codemod-see-to-scope.mjs                    # dry-run, scan cwd
 *   node scripts/codemod-see-to-scope.mjs --write             # apply changes
 *   node scripts/codemod-see-to-scope.mjs scenes/             # scan specific dir
 *   node scripts/codemod-see-to-scope.mjs my-test.spec.md     # scan specific file
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function findSpecFiles(dir) {
  const results = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findSpecFiles(fullPath))
    } else if (entry.name.endsWith('.spec.md')) {
      results.push(fullPath)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

/** Strip markdown list prefix (- or 1.) from a line */
function stripListPrefix(line) {
  return line.replace(/^(\s*)([-*]\s+|\d+\.\s+)/, '$1')
}

/** Extract action name and remaining text from a stripped action line */
function parseAction(rawLine) {
  const stripped = stripListPrefix(rawLine).trim()
  const firstSpace = stripped.indexOf(' ')
  if (firstSpace === -1) return { action: stripped, rest: '' }
  return {
    action: stripped.slice(0, firstSpace),
    rest: stripped.slice(firstSpace + 1).trim(),
  }
}

/** Is this line an actor cue? e.g. `alice:` or `primary-user:` */
function isActorCue(line) {
  const trimmed = line.trim()
  if (/^(cleanup|setup|if)\s*:/.test(trimmed)) return false
  return /^[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(trimmed)
}

/** Is this a heading (scene/group boundary)? */
function isHeading(line) {
  return /^\s*#{1,6}\s/.test(line)
}

/** Should this line be skipped during analysis? */
function isSkippable(line) {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.startsWith('#')) return true
  if (/^(cleanup|setup)\s*:/.test(trimmed)) return true
  return false
}

function isScopeDependent(action, rest) {
  // Form interactions — strict scope, no fallback
  if (action === 'typeInto' || action === 'check' || action === 'select') return true
  // Bare click — clicks the current scope element
  if (action === 'click' && !rest) return true
  // prev — pops scope stack, implies something pushed
  if (action === 'prev') return true
  // up with selector — navigates to ancestor of current scope
  if (action === 'up' && rest) return true
  // scope — narrows further within current scope
  if (action === 'scope') return true
  return false
}

function isScopeResetting(action, rest) {
  if (action === 'openTo' || action === 'reload' || action === 'goBack' ||
      action === 'goForward' || action === 'switchDevice') return true
  // Bare up — resets to page root
  if (action === 'up' && !rest) return true
  return false
}

// ---------------------------------------------------------------------------
// Core transform
// ---------------------------------------------------------------------------

/**
 * Process a file's content and return { newContent, conversions } or null
 * if no changes are needed.
 *
 * conversions is an array of { line, before, after } for reporting.
 */
function processContent(content, filePath) {
  const lines = content.split('\n')
  const toConvert = new Set()

  // Forward pass through the file.
  // pendingSees: indices of `see` lines that might need conversion.
  // When we hit a scope-dependent action, ALL pending sees get converted.
  // When we hit a scope-resetting action or block boundary, pending sees are cleared.
  let pendingSees = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Block boundaries (headings, actor cues) reset pending sees
    if (isHeading(line) || isActorCue(line)) {
      pendingSees = []
      continue
    }

    if (isSkippable(line)) continue

    const { action, rest } = parseAction(line)

    if (action === 'see' && rest) {
      // A `see <selector>` — might need conversion
      pendingSees.push(i)
    } else if (isScopeDependent(action, rest)) {
      // Convert all pending sees — they were narrowing scope for this action
      for (const idx of pendingSees) {
        toConvert.add(idx)
      }
      // Keep pending sees (a later action might also depend on the same scope chain)
    } else if (isScopeResetting(action, rest)) {
      // Scope is being reset — pending sees were just assertions
      pendingSees = []
    }
  }

  if (toConvert.size === 0) return null

  const conversions = []
  const newLines = lines.map((line, i) => {
    if (!toConvert.has(i)) return line
    // Replace the first standalone `see` with `scope`
    const newLine = line.replace(/\bsee\b/, 'scope')
    conversions.push({
      line: i + 1,
      before: line.trimStart(),
      after: newLine.trimStart(),
    })
    return newLine
  })

  return { newContent: newLines.join('\n'), conversions }
}

// ---------------------------------------------------------------------------
// Diff display
// ---------------------------------------------------------------------------

function printDiff(filePath, conversions, cwd) {
  const rel = relative(cwd, filePath)
  console.log(`\n\x1b[1m${rel}\x1b[0m`)
  for (const c of conversions) {
    console.log(`  line ${c.line}:`)
    console.log(`    \x1b[31m- ${c.before}\x1b[0m`)
    console.log(`    \x1b[32m+ ${c.after}\x1b[0m`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const paths = args.filter((a) => a !== '--write')
  const cwd = process.cwd()

  // Discover files
  let files = []
  if (paths.length === 0) {
    files = findSpecFiles(cwd)
  } else {
    for (const p of paths) {
      const abs = resolve(cwd, p)
      try {
        const stat = statSync(abs)
        if (stat.isDirectory()) {
          files.push(...findSpecFiles(abs))
        } else if (abs.endsWith('.spec.md')) {
          files.push(abs)
        }
      } catch {
        console.error(`Warning: ${p} not found, skipping`)
      }
    }
  }

  if (files.length === 0) {
    console.log('No .spec.md files found.')
    return
  }

  let totalConversions = 0
  let filesChanged = 0

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const result = processContent(content, file)
    if (!result) continue

    filesChanged++
    totalConversions += result.conversions.length

    if (write) {
      writeFileSync(file, result.newContent, 'utf-8')
      const rel = relative(cwd, file)
      console.log(`  \x1b[32m✓\x1b[0m ${rel} (${result.conversions.length} conversions)`)
    } else {
      printDiff(file, result.conversions, cwd)
    }
  }

  console.log('')
  if (write) {
    console.log(`Done. ${totalConversions} see → scope conversions across ${filesChanged} file(s).`)
  } else {
    if (totalConversions === 0) {
      console.log('No conversions needed.')
    } else {
      console.log(`Found ${totalConversions} see → scope conversion(s) across ${filesChanged} file(s).`)
      console.log('Run with --write to apply.')
    }
  }
}

main()
