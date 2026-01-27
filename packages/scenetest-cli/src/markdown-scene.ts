/**
 * Markdown scene parser and loader.
 *
 * Parses `.spec.md` files into reactive flow registrations.  The format is
 * natural markdown — human-readable, GitHub-renderable, and executable:
 *
 * ```markdown
 * # User friend requests
 *
 * ## new user signs up and gets a friend request
 *
 * actor new-user
 * openTo /
 * see welcome-box
 * click continue-button
 *
 * actor primary-user
 * openTo /friends
 * click main-navbar search
 * typeInto search-input [new-user.username]
 * see search-results-section
 * click friend-request-button
 *
 * actor new-user
 * seeToast friend-request
 * see navbar notifications-badge
 * click
 * see notifications-menu-expanded new-friend-request
 * click
 *
 * ## old user re-activates account
 *
 * actor returning-user
 * openTo /login
 * see login-form
 * typeInto email [returning-user.email]
 * click submit
 * ```
 *
 * ## Format rules
 *
 * - `#` headings are **group names** (optional hierarchy/context)
 * - `##` headings are **scene names** (each becomes a `flow()` registration)
 * - If no `##` headings exist, `#` headings are promoted to scene names
 * - `actor <role> [alias]` switches the active actor for subsequent lines
 * - Action lines map to the standard text DSL (see `dsl.ts`)
 * - Lines may start with `- ` or `1. ` (markdown lists) for readability (stripped)
 * - `// comment` lines become `console.log` during execution
 * - Blank lines are ignored
 * - `[actor.field]` interpolates actor config values (id, username, email, etc.)
 * - `if <selector>` followed by indented lines creates a conditional monitor
 * - `name()` or `name() <args>` invokes a registered macro
 * - `waitFor <message>` blocks the actor until a bus message arrives
 * - Bare `click` (no selector) clicks the current scope
 */

import path from 'path'
import type { ReactiveActor } from './types.js'
import { parseAction, applyDslAction, getMacro } from './dsl.js'
import { flow } from './reactive.js'
import { setCurrentFile } from './scene.js'

// ---------------------------------------------------------------------------
// Intermediate representation
// ---------------------------------------------------------------------------

export interface MarkdownScene {
  name: string
  group?: string
  blocks: ActorBlock[]
}

export interface ActorBlock {
  role: string
  alias?: string
  actions: SceneAction[]
}

export type SceneAction =
  | { type: 'action'; line: string }
  | { type: 'comment'; text: string }
  | { type: 'if'; selector: string; actions: string[] }
  | { type: 'macro'; name: string; args: string[] }

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a `.spec.md` file into scene definitions.
 *
 * Handles both formats:
 * - `#` groups + `##` scenes (recommended for multi-scene files)
 * - `#` scenes only (for single-scene files or flat lists)
 */
export function parseMarkdownScenes(
  content: string,
  filePath: string
): MarkdownScene[] {
  const lines = content.split('\n')

  // First pass: determine heading strategy.
  // If any ## heading exists, use # = group, ## = scene.
  // Otherwise, # = scene (no groups).
  const hasH2 = lines.some((l) => /^##\s/.test(l.trim()))

  const scenes: MarkdownScene[] = []
  let currentGroup: string | undefined
  let currentScene: MarkdownScene | null = null
  let currentBlock: ActorBlock | null = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    // Skip blank lines
    if (!trimmed) continue

    // ── Heading handling ──────────────────────────────────────────────

    if (hasH2) {
      // # = group, ## = scene
      if (/^## /.test(trimmed)) {
        const name = trimmed.slice(3).trim()
        currentScene = { name, group: currentGroup, blocks: [] }
        scenes.push(currentScene)
        currentBlock = null
        continue
      }
      if (/^# /.test(trimmed)) {
        currentGroup = trimmed.slice(2).trim()
        continue
      }
    } else {
      // No ## headings — # = scene
      if (/^# /.test(trimmed)) {
        const name = trimmed.slice(2).trim()
        currentScene = { name, group: undefined, blocks: [] }
        scenes.push(currentScene)
        currentBlock = null
        continue
      }
    }

    // ── Content lines (need an active scene) ──────────────────────────

    // Auto-create scene if content appears before any heading
    if (!currentScene && (trimmed.startsWith('actor ') || isActionLine(trimmed))) {
      currentScene = {
        name: path.basename(filePath, '.spec.md'),
        group: undefined,
        blocks: [],
      }
      scenes.push(currentScene)
      // Fall through to process this line
    }

    if (!currentScene) continue

    // ── Actor declaration ─────────────────────────────────────────────

    if (trimmed.startsWith('actor ')) {
      const parts = trimmed.slice(6).trim().split(/\s+/)
      const role = parts[0]
      const alias = parts.length > 1 ? parts[1] : undefined
      currentBlock = { role, alias, actions: [] }
      currentScene.blocks.push(currentBlock)
      continue
    }

    // Must have an actor block to add actions
    if (!currentBlock) continue

    // ── Comment ───────────────────────────────────────────────────────

    if (trimmed.startsWith('//')) {
      const text = trimmed.slice(2).trim()
      if (text) {
        currentBlock.actions.push({ type: 'comment', text })
      }
      continue
    }

    // ── Conditional monitor (if <selector> + indented block) ──────────

    if (trimmed.startsWith('if ') && !trimmed.startsWith('if(')) {
      const selector = trimmed.slice(3).trim()
      const subActions: string[] = []

      // Collect indented sub-actions
      while (i + 1 < lines.length) {
        const nextRaw = lines[i + 1]
        const nextTrimmed = nextRaw.trim()

        // Blank lines inside if block — skip but continue collecting
        if (!nextTrimmed) {
          i++
          continue
        }

        // Indented line (2+ spaces from start of raw line) = sub-action
        if (/^\s{2,}/.test(nextRaw) && nextTrimmed) {
          const actionLine = stripListPrefix(nextTrimmed)
          subActions.push(actionLine)
          i++
        } else {
          break
        }
      }

      currentBlock.actions.push({ type: 'if', selector, actions: subActions })
      continue
    }

    // ── Macro invocation: name() or name() arg1 arg2 ──────────────────

    const macroMatch = trimmed.match(/^([\w][\w-]*)\(\)\s*(.*)$/)
    if (macroMatch) {
      const name = macroMatch[1]
      const argsStr = macroMatch[2].trim()
      const args = argsStr ? argsStr.split(/\s+/) : []
      currentBlock.actions.push({ type: 'macro', name, args })
      continue
    }

    // ── Regular action line ───────────────────────────────────────────

    const actionLine = stripListPrefix(trimmed)
    currentBlock.actions.push({ type: 'action', line: actionLine })
  }

  return scenes
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip optional markdown list prefix from an action line.
 * Supports unordered (`- `), ordered (`1. `, `2. `, etc.), and plain lines.
 */
function stripListPrefix(line: string): string {
  // Unordered: - action
  if (line.startsWith('- ')) return line.slice(2)
  // Ordered: 1. action, 2. action, 10. action, etc.
  const orderedMatch = line.match(/^\d+\.\s+/)
  if (orderedMatch) return line.slice(orderedMatch[0].length)
  return line
}

/** Check if a line looks like a DSL action or macro invocation */
function isActionLine(line: string): boolean {
  const actions = [
    'openTo', 'see', 'seeInView', 'notSee', 'seeText', 'seeToast', 'click',
    'typeInto', 'check', 'select', 'wait', 'emit', 'waitFor',
    'warnIf', 'up', 'prev', 'scrollToBottom', 'if',
  ]
  const stripped = stripListPrefix(line)
  const first = stripped.split(/\s/)[0]
  return actions.includes(first) || /^[\w][\w-]*\(\)/.test(stripped)
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolate `[actor.field]` references in an action line.
 *
 * Replaces tokens like `[new-user.username]` with the actual value from
 * the actor's config.  Actors must have been created before interpolation.
 */
function interpolate(
  line: string,
  actors: Map<string, ReactiveActor>
): string {
  return line.replace(
    /\[([\w][\w-]*)\.([\w]+)\]/g,
    (match, actorRef: string, field: string) => {
      const actor = actors.get(actorRef)
      if (!actor) {
        throw new Error(
          `Unknown actor "${actorRef}" in interpolation: ${match}`
        )
      }
      const value = (actor as Record<string, unknown>)[field]
      if (value === undefined) {
        throw new Error(
          `Actor "${actorRef}" has no field "${field}" (available: id, username, email, password, ...)`
        )
      }
      return String(value)
    }
  )
}

// ---------------------------------------------------------------------------
// Registration — convert parsed scenes into flow() registrations
// ---------------------------------------------------------------------------

/**
 * Register parsed markdown scenes as reactive flows.
 *
 * Each scene becomes a `flow()` call.  Actors are created upfront so
 * `[actor.field]` interpolation can reference any actor regardless of
 * declaration order.
 */
export function registerMarkdownScenes(
  scenes: MarkdownScene[],
  filePath: string
): void {
  for (const scene of scenes) {
    flow(scene.name, ({ actor }) => {
      // ── Phase 1: collect all unique roles and create actors ──────────
      const actors = new Map<string, ReactiveActor>()

      for (const block of scene.blocks) {
        if (!actors.has(block.role)) {
          const a = actor(block.role)
          actors.set(block.role, a)
        }
        if (block.alias && !actors.has(block.alias)) {
          actors.set(block.alias, actors.get(block.role)!)
        }
      }

      // ── Phase 2: apply actions to each actor block ──────────────────
      for (const block of scene.blocks) {
        const a = actors.get(block.alias || block.role)!

        for (const action of block.actions) {
          switch (action.type) {
            case 'comment':
              // Queue a console.log that executes during drain
              a.do(async () => {
                console.log(`  // ${action.text}`)
              })
              break

            case 'action': {
              const interpolated = interpolate(action.line, actors)
              const parsed = parseAction(interpolated)
              applyDslAction(a, parsed)
              break
            }

            case 'if': {
              const interpolatedSelector = interpolate(
                action.selector,
                actors
              )
              ;(a as ReactiveActor).if(
                interpolatedSelector,
                (actor: ReactiveActor) => {
                  for (const subLine of action.actions) {
                    const interpolated = interpolate(subLine, actors)
                    const parsed = parseAction(interpolated)
                    applyDslAction(actor as any, parsed)
                  }
                }
              )
              break
            }

            case 'macro': {
              const macro = getMacro(action.name)
              if (!macro) {
                throw new Error(
                  `Macro not found: ${action.name}() — define it with defineMacro('${action.name}', [...]) in a .ts file`
                )
              }

              // Build template vars from actor args
              const vars: Record<string, string> = {}
              for (const arg of action.args) {
                const argActor = actors.get(arg)
                if (argActor) {
                  // Make all actor fields available as {{arg.field}} vars
                  for (const [key, value] of Object.entries(argActor)) {
                    if (typeof value === 'string') {
                      vars[`${arg}.${key}`] = value
                    }
                  }
                } else {
                  // Non-actor arg — pass as positional
                  vars[`arg${Object.keys(vars).length}`] = arg
                }
              }

              // Apply macro actions inline (no await — flow model)
              for (const actionLine of macro) {
                let resolved = actionLine
                for (const [key, value] of Object.entries(vars)) {
                  resolved = resolved.replace(
                    new RegExp(
                      `\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
                      'g'
                    ),
                    value
                  )
                }
                const interpolated = interpolate(resolved, actors)
                const parsed = parseAction(interpolated)
                applyDslAction(a, parsed)
              }
              break
            }
          }
        }
      }
    })
  }
}

// ---------------------------------------------------------------------------
// File loader — top-level entry point
// ---------------------------------------------------------------------------

/**
 * Load a `.spec.md` file: parse it and register all scenes as flows.
 *
 * Called by the runner when it discovers `.spec.md` files alongside
 * `.spec.ts` files.
 */
export async function loadMarkdownScene(filePath: string): Promise<void> {
  const fs = await import('fs/promises')
  const content = await fs.readFile(filePath, 'utf-8')

  setCurrentFile(filePath)
  const scenes = parseMarkdownScenes(content, filePath)
  registerMarkdownScenes(scenes, filePath)
}
