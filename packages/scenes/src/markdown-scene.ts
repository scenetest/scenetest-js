/**
 * Markdown scene parser and loader.
 *
 * Parses `.spec.md` files into reactive flow registrations.  The format is
 * natural markdown — human-readable, GitHub-renderable, and executable:
 *
 * ```markdown
 * # User friend requests
 * ## new user signs up and gets a friend request
 * new-user:
 * - openTo /
 * - see welcome-box
 * - click continue-button
 *
 * primary-user:
 * - openTo /friends
 * - click main-navbar search
 * - typeInto search-input [new-user.username]
 * - see search-results-section
 * - click friend-request-button
 *
 * new-user:
 * - seeToast friend-request
 * - see navbar notifications-badge
 * - click
 * - see notifications-menu-expanded new-friend-request
 * - click
 *
 * ## old user re-activates account
 * returning-user:
 * - openTo /login
 * - see login-form
 * - typeInto email [self.email]
 * - click submit
 * ```
 *
 * ## Format rules
 *
 * - `#` headings are **group names** (optional hierarchy/context)
 * - `##` headings are **scene names** (each becomes a `flow()` registration)
 * - If no `##` headings exist, `#` headings are promoted to scene names
 * - `role-name:` switches the active actor for subsequent lines (like a screenplay cue)
 * - `role-name: action args` is inline shorthand for a one-line actor block
 * - Action lines map to the standard text DSL (see `dsl.ts`)
 * - Lines may start with `- ` or `1. ` (markdown lists) for readability (stripped)
 * - `// comment` lines become `console.log` during execution
 * - Blank lines are ignored
 * - `[namespace.field]` interpolation:
 *   - `[self.field]` — current actor's own fields
 *   - `[role-name.field]` — another actor's fields
 *   - `[team.field]` — team metadata
 *   - `[alias.field]` — aliased role (from macro args)
 * - `if <selector>` followed by indented lines creates a conditional monitor
 * - `macro-name` or `macro-name alias=role` invokes a registered macro
 * - `waitFor <message>` blocks the actor until a bus message arrives
 * - Bare `click` (no selector) clicks the current scope
 */

import path from 'path'
import type { ConcurrentActorHandle } from './types.js'
import { parseAction, applyDslAction, getMacro } from './dsl.js'
import { flow } from './reactive.js'
import { sceneRegistry, setCurrentFile } from './scene.js'

// ---------------------------------------------------------------------------
// Intermediate representation
// ---------------------------------------------------------------------------

export interface MarkdownScene {
  name: string
  group?: string
  /** Pre-cleanup expression from `cleanup:` directive */
  cleanup?: string
  blocks: ActorBlock[]
}

export interface ActorBlock {
  role: string
  alias?: string
  actions: SceneAction[]
}

/**
 * Macro argument types.
 *
 * - `mapping`: alias=role mapping, e.g., `target=new-user` makes `[target.field]` resolve to new-user's fields
 * - `literal`: plain string value for backward compatibility
 */
export type MacroArg =
  | { type: 'mapping'; alias: string; role: string }
  | { type: 'literal'; value: string }

export type SceneAction =
  | { type: 'action'; line: string }
  | { type: 'comment'; text: string }
  | { type: 'if'; selector: string; actions: string[] }
  | { type: 'macro'; name: string; args: MacroArg[] }

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

    // ── Cleanup directive ─────────────────────────────────────────────
    // `cleanup: <expression>` — one per scene, before actor cues

    const cleanupMatch = trimmed.match(/^cleanup:\s+(.+)$/)
    if (cleanupMatch && currentScene && !currentBlock) {
      currentScene.cleanup = cleanupMatch[1]
      continue
    }

    // ── Content lines (need an active scene) ──────────────────────────

    // Auto-create scene if content appears before any heading
    const earlyDecl = parseActorDeclaration(trimmed)
    if (!currentScene && (earlyDecl || isActionLine(trimmed))) {
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
    // Format: `role-name:` or `role-name: action args`
    // The first token before `:` is the role name (must not be a known action).

    const actorDecl = earlyDecl ?? parseActorDeclaration(trimmed)
    if (actorDecl) {
      currentBlock = { role: actorDecl.role, actions: [] }
      currentScene.blocks.push(currentBlock)
      // If there's inline content after the colon, parse it as an action
      if (actorDecl.rest) {
        const actionLine = stripListPrefix(actorDecl.rest)
        currentBlock.actions.push({ type: 'action', line: actionLine })
      }
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

    // ── Macro invocation ────────────────────────────────────────────────
    // A macro is any word that isn't a known DSL action, followed by
    // optional `role <name>` or `team <name>` arguments:
    //   send-friend-request role best-friend-1
    //   signup-to-language team language-focus

    const actionLine = stripListPrefix(trimmed)
    const words = actionLine.split(/\s+/)
    const firstWord = words[0]

    if (firstWord && !KNOWN_ACTIONS.includes(firstWord)) {
      const macroArgs = parseMacroArgs(words.slice(1))
      currentBlock.actions.push({ type: 'macro', name: firstWord, args: macroArgs })
      continue
    }

    // ── Regular action line ───────────────────────────────────────────

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

/** Known DSL action verbs — used to distinguish actions from actor declarations */
const KNOWN_ACTIONS = [
  'openTo', 'see', 'seeInView', 'notSee', 'seeText', 'seeToast', 'click',
  'typeInto', 'check', 'select', 'wait', 'emit', 'waitFor',
  'warnIf', 'up', 'prev', 'scrollToBottom', 'if',
]

/** Check if a line looks like a DSL action or macro invocation */
function isActionLine(line: string): boolean {
  const stripped = stripListPrefix(line)
  const first = stripped.split(/\s/)[0]
  // Any word could be either a known action or a macro name
  return first !== undefined && first.length > 0
}

/**
 * Parse a line as an actor declaration.
 *
 * Actor declarations look like screenplay cues:
 * - `role-name:`           — block declaration (actions follow on subsequent lines)
 * - `role-name: see foo`   — inline declaration with first action on same line
 *
 * Returns null if the line is not an actor declaration (e.g. it's an action
 * line or doesn't contain a colon in the right position).
 */
function parseActorDeclaration(line: string): { role: string; rest: string } | null {
  // Match: word-chars (including hyphens) followed by a colon
  const match = line.match(/^([\w][\w-]*):\s*(.*)$/)
  if (!match) return null
  const [, word, rest] = match
  // Don't treat known action verbs as actor declarations
  if (KNOWN_ACTIONS.includes(word)) return null
  return { role: word, rest: rest.trim() }
}

/**
 * Parse macro arguments into typed MacroArg objects.
 *
 * Supports `alias=role` mappings that make `[alias.field]` resolve to the role's fields.
 * Plain values without `=` are treated as literals for backward compatibility.
 *
 * @example
 * parseMacroArgs(['target=new-user'])
 * // => [{ type: 'mapping', alias: 'target', role: 'new-user' }]
 *
 * parseMacroArgs(['target=new-user', 'other=alice'])
 * // => [{ type: 'mapping', alias: 'target', role: 'new-user' }, { type: 'mapping', alias: 'other', role: 'alice' }]
 */
function parseMacroArgs(words: string[]): MacroArg[] {
  const args: MacroArg[] = []

  for (const word of words) {
    if (word.includes('=')) {
      const eqIndex = word.indexOf('=')
      const alias = word.slice(0, eqIndex)
      const role = word.slice(eqIndex + 1)
      if (alias && role) {
        args.push({ type: 'mapping', alias, role })
      } else {
        // Malformed mapping — treat as literal
        args.push({ type: 'literal', value: word })
      }
    } else {
      args.push({ type: 'literal', value: word })
    }
  }

  return args
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolation context for resolving `[namespace.field]` references.
 */
interface InterpolationContext {
  /** All actors in the scene, keyed by role name */
  actors: Map<string, ConcurrentActorHandle>
  /** Current actor executing this line (for `[self.field]`) */
  self?: ConcurrentActorHandle
  /** Team metadata (for `[team.field]`) */
  team?: Record<string, string>
  /** Alias mappings from macros (alias -> role name) */
  aliases?: Map<string, string>
}

/**
 * Interpolate `[namespace.field]` references in an action line.
 *
 * Supported namespaces:
 * - `[self.field]` — current actor's own fields
 * - `[team.field]` — team metadata
 * - `[role-name.field]` — another actor's fields
 * - `[alias.field]` — aliased role (from macro args)
 *
 * @example
 * // In an action line:
 * interpolate('see user-card-[target.key]', { actors, self, aliases: new Map([['target', 'new-user']]) })
 * // => 'see user-card-12345'
 */
function interpolate(line: string, ctx: InterpolationContext): string {
  return line.replace(
    /\[([\w][\w-]*)\.([\w]+)\]/g,
    (match, namespace: string, field: string) => {
      // [self.field] — current actor's fields
      if (namespace === 'self') {
        if (!ctx.self) {
          throw new Error(`Cannot use [self.${field}] — no current actor context`)
        }
        const value = (ctx.self as Record<string, unknown>)[field]
        if (value === undefined) {
          throw new Error(`[self.${field}] — actor has no field "${field}"`)
        }
        return String(value)
      }

      // [team.field] — team metadata
      if (namespace === 'team') {
        if (!ctx.team) {
          throw new Error(`Cannot use [team.${field}] — no team context`)
        }
        const value = ctx.team[field]
        if (value === undefined) {
          throw new Error(`[team.${field}] — team has no field "${field}"`)
        }
        return String(value)
      }

      // Check for alias mapping first
      const resolvedRole = ctx.aliases?.get(namespace) ?? namespace

      // Look up the actor
      const actor = ctx.actors.get(resolvedRole)
      if (!actor) {
        const available = [...ctx.actors.keys()].join(', ')
        const aliasNote = ctx.aliases?.has(namespace)
          ? ` (alias "${namespace}" -> "${resolvedRole}")`
          : ''
        throw new Error(
          `Unknown actor "${namespace}"${aliasNote} in [${namespace}.${field}] — available: ${available}`
        )
      }

      const value = (actor as Record<string, unknown>)[field]
      if (value === undefined) {
        throw new Error(
          `Actor "${resolvedRole}" has no field "${field}" (available: id, username, email, password, ...)`
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
  for (const mdScene of scenes) {
    // Extract unique roles from actor blocks for team matching
    const roles = [...new Set(mdScene.blocks.map(b => b.role))]

    flow(mdScene.name, { roles }, ({ actor, team: teamMeta }) => {
      // ── Phase 1: collect all unique roles and create actors ──────────
      const actors = new Map<string, ConcurrentActorHandle>()

      for (const block of mdScene.blocks) {
        if (!actors.has(block.role)) {
          const a = actor(block.role)
          actors.set(block.role, a)
        }
        if (block.alias && !actors.has(block.alias)) {
          actors.set(block.alias, actors.get(block.role)!)
        }
      }

      // ── Phase 2: apply actions to each actor block ──────────────────
      for (const block of mdScene.blocks) {
        const a = actors.get(block.alias || block.role)!

        // Base interpolation context for this actor block
        // Build team interpolation map from tags + name
        const teamInterpolation: Record<string, string> = {
          ...(teamMeta.tags ?? {}),
          ...(teamMeta.name ? { name: teamMeta.name } : {}),
        }
        const baseCtx: InterpolationContext = {
          actors,
          self: a,
          team: Object.keys(teamInterpolation).length > 0 ? teamInterpolation : undefined,
        }

        for (const action of block.actions) {
          switch (action.type) {
            case 'comment':
              // Queue a console.log that executes during drain
              a.do(async () => {
                console.log(`  // ${action.text}`)
              })
              break

            case 'action': {
              const interpolated = interpolate(action.line, baseCtx)
              const parsed = parseAction(interpolated)
              applyDslAction(a, parsed)
              break
            }

            case 'if': {
              const interpolatedSelector = interpolate(action.selector, baseCtx)
              ;(a as ConcurrentActorHandle).if(
                interpolatedSelector,
                (actor: ConcurrentActorHandle) => {
                  for (const subLine of action.actions) {
                    const interpolated = interpolate(subLine, {
                      ...baseCtx,
                      self: actor,
                    })
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
                  `Macro not found: ${action.name} — define it with defineMacro('${action.name}', [...]) in a .ts file`
                )
              }

              // Build alias mappings from macro args
              const aliases = new Map<string, string>()

              for (const arg of action.args) {
                if (arg.type === 'mapping') {
                  // Verify the role exists
                  if (!actors.has(arg.role)) {
                    throw new Error(
                      `Macro ${action.name}: unknown role "${arg.role}" in mapping "${arg.alias}=${arg.role}" — actors in this scene: ${[...actors.keys()].join(', ')}`
                    )
                  }
                  aliases.set(arg.alias, arg.role)
                }
                // Literals are ignored for now — macros use [alias.field] syntax
              }

              // Context for macro interpolation includes aliases
              const macroCtx: InterpolationContext = {
                ...baseCtx,
                aliases,
              }

              // Apply macro actions inline (no await — flow model)
              // Uses unified [namespace.field] syntax — no {{var}} substitution
              for (const actionLine of macro) {
                const interpolated = interpolate(actionLine, macroCtx)
                const parsed = parseAction(interpolated)
                applyDslAction(a, parsed)
              }
              break
            }
          }
        }
      }
    })

    // Propagate cleanup expression to the registered scene
    if (mdScene.cleanup && sceneRegistry.length > 0) {
      sceneRegistry[sceneRegistry.length - 1].cleanup = mdScene.cleanup
    }
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
