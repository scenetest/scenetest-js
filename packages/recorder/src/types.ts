/**
 * Types for the scene recorder
 */

export interface DslLine {
  /** Unique id for this line */
  id: number
  /** The DSL action text (e.g., "click submit-button") */
  text: string
  /** Timestamp when the action was recorded */
  timestamp: number
  /** Whether this line has been "played" / confirmed */
  played: boolean
}

export interface AssertionAnnotation {
  /** Which DSL line this annotation is attached to (by id) */
  afterLineId: number
  /** Pass or fail */
  type: 'pass' | 'fail'
  /** The assertion description */
  description: string
  /** Timestamp */
  timestamp: number
}

export interface RecorderState {
  /** Whether we're currently recording */
  recording: boolean
  /** Accumulated DSL lines */
  lines: DslLine[]
  /** Assertion annotations between lines */
  annotations: AssertionAnnotation[]
  /** Next line id counter */
  nextId: number
  /** Whether an input is currently being typed into (debounce) */
  pendingInput: PendingInput | null
}

export interface PendingInput {
  /** The target element */
  element: HTMLElement
  /** The resolved selector */
  selector: string
  /** Current value */
  value: string
  /** Debounce timer */
  timer: ReturnType<typeof setTimeout>
}

/**
 * Selector attribute in priority order
 */
export const SELECTOR_ATTRIBUTES = [
  'aria-label',
  'id',
  'data-testid',
  'data-name',
  'data-key',
  'name',
] as const

export type SelectorAttribute = typeof SELECTOR_ATTRIBUTES[number]
