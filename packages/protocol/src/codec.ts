/**
 * Serialization and validation for protocol events and commands.
 *
 * Two levels of checking, for two different jobs:
 *
 * - `decodeEvent` / `decodeCommand` — strict: the type tag is known and
 *   the required fields for that type are present with the right
 *   primitive types. For consumers that act on event contents (recorders,
 *   rollups, the command queue).
 * - `isEventShaped` — minimal: an object with a string `type` and numeric
 *   `timestamp`. For relays that fan events out without interpreting them
 *   (the dev SSE hub, the Durable Object fan-out). A relay validating
 *   strictly would drop event types newer than itself, which breaks the
 *   normal version-skew case of an old plugin paired with a newer CLI.
 *
 * All validators tolerate unknown extra fields — additive fields are
 * non-breaking by design.
 */

import type { Command } from './commands.js'
import type { RunEvent } from './events.js'

type Raw = Record<string, unknown>

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(v: unknown): v is string {
  return typeof v === 'string'
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function optStr(v: unknown): boolean {
  return v === undefined || str(v)
}

function isTeamMeta(v: unknown): boolean {
  if (!isObject(v)) return false
  if (!optStr(v.name)) return false
  if (v.tags !== undefined) {
    if (!isObject(v.tags)) return false
    if (!Object.values(v.tags).every(str)) return false
  }
  return true
}

function isRunSummary(v: unknown): boolean {
  if (!isObject(v)) return false
  if (!num(v.scenes) || !num(v.completed) || !num(v.failed)) return false
  if (!num(v.warnings) || !num(v.consoleErrors)) return false
  const a = v.assertions
  return isObject(a) && num(a.total) && num(a.passed) && num(a.failed)
}

/** Per-type required-field validators. `type` and `timestamp` are pre-checked. */
const EVENT_VALIDATORS: Record<RunEvent['type'], (e: Raw) => boolean> = {
  'run:start': (e) => num(e.sceneCount),
  'scene:start': (e) =>
    str(e.name) &&
    str(e.file) &&
    Array.isArray(e.actors) &&
    e.actors.every(str) &&
    num(e.teamIndex) &&
    isTeamMeta(e.team),
  'action:start': (e) => str(e.actor) && str(e.action) && optStr(e.target),
  'action:end': (e) =>
    str(e.actor) && str(e.action) && optStr(e.target) && num(e.duration) && optStr(e.error),
  assertion: (e) => optStr(e.actor) && str(e.description) && typeof e.result === 'boolean',
  warning: (e) => str(e.actor) && str(e.selector) && str(e.message),
  'scene:end': (e) =>
    str(e.name) &&
    str(e.status) &&
    num(e.duration) &&
    optStr(e.error) &&
    num(e.teamIndex) &&
    isTeamMeta(e.team),
  'run:progress': (e) => num(e.pct) && num(e.failing) && num(e.flaky),
  'run:end': (e) => num(e.duration) && isRunSummary(e.summary),
}

const COMMAND_VALIDATORS: Record<Command['type'], (c: Raw) => boolean> = {
  'run:replay': (c) => optStr(c.file) && optStr(c.team),
  'run:stop': () => true,
  'run:pause': () => true,
  'run:resume': () => true,
}

/**
 * Minimal envelope check: an object with a string `type` and a numeric
 * `timestamp`. Use this when relaying events without interpreting them,
 * so event types newer than this package pass through instead of being
 * dropped.
 */
export function isEventShaped(value: unknown): value is { type: string; timestamp: number } {
  return isObject(value) && str(value.type) && num(value.timestamp)
}

/** Strict structural check against the known event vocabulary. */
export function isRunEvent(value: unknown): value is RunEvent {
  if (!isEventShaped(value)) return false
  const validate = EVENT_VALIDATORS[value.type as RunEvent['type']]
  return validate !== undefined && validate(value as unknown as Raw)
}

/** Strict structural check against the known command vocabulary. */
export function isCommand(value: unknown): value is Command {
  if (!isObject(value) || !str(value.type)) return false
  const validate = COMMAND_VALIDATORS[value.type as Command['type']]
  return validate !== undefined && validate(value)
}

/** Serialize an event for the wire. */
export function encodeEvent(event: RunEvent): string {
  return JSON.stringify(event)
}

/**
 * Parse and validate one wire message into an event. Returns `null` for
 * anything that is not a known, well-formed event — malformed JSON, an
 * unknown type tag, or missing required fields. Never throws.
 */
export function decodeEvent(input: string | unknown): RunEvent | null {
  const value = parse(input)
  return isRunEvent(value) ? value : null
}

/** Serialize a command for the wire. */
export function encodeCommand(command: Command): string {
  return JSON.stringify(command)
}

/**
 * Parse and validate one wire message into a command. Returns `null` for
 * anything that is not a known, well-formed command. Never throws.
 */
export function decodeCommand(input: string | unknown): Command | null {
  const value = parse(input)
  return isCommand(value) ? value : null
}

function parse(input: string | unknown): unknown {
  if (typeof input !== 'string') return input
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}
