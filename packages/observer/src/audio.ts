/**
 * Musical Assertion Audio System
 *
 * Each assertion becomes a note on a musical scale.
 * Passing assertions play their assigned note cleanly.
 * Failing assertions play a detuned version (dissonance).
 * Assertions that fire together within the grouping window form chords.
 */

import type { AssertionResult } from './types.js'

// Audio context (lazy initialized)
let audioContext: AudioContext | null = null

// State
let muted = false
let volume = 0.3
const noteAssignments = new Map<string, number>() // description -> note index

// Musical constants
// Using a pentatonic scale for natural harmony (no dissonance between notes)
// Octaves 3-5 for a pleasant range
const PENTATONIC_FREQUENCIES = [
  // C3 pentatonic
  130.81, 146.83, 164.81, 196.00, 220.00,
  // C4 pentatonic
  261.63, 293.66, 329.63, 392.00, 440.00,
  // C5 pentatonic
  523.25, 587.33, 659.25, 783.99, 880.00,
]

// A semitone (half step) ratio - 2^(1/12) ≈ 1.0595
const SEMITONE_RATIO = Math.pow(2, 1 / 12)

// Note duration in seconds
const NOTE_DURATION = 0.25
const NOTE_ATTACK = 0.02

// Symphony playback state
interface SymphonyEvent {
  timestamp: number
  notes: { frequency: number; passed: boolean }[]
}

const symphonyEvents: SymphonyEvent[] = []
let isPlayingSymphony = false
let symphonyTimeoutId: ReturnType<typeof setTimeout> | null = null

/**
 * Initialize the audio context (must be called after user interaction)
 */
export function initAudio(): AudioContext | null {
  if (audioContext) return audioContext

  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    return audioContext
  } catch (e) {
    console.warn('[scenetest] Web Audio API not available')
    return null
  }
}

/**
 * Resume audio context if suspended (browsers require user interaction)
 */
export async function resumeAudio(): Promise<void> {
  if (audioContext?.state === 'suspended') {
    await audioContext.resume()
  }
}

/**
 * Get a consistent note index for an assertion description
 */
function getNoteIndex(description: string): number {
  let existing = noteAssignments.get(description)
  if (existing !== undefined) return existing

  // Hash the description to get a note index
  let hash = 0
  for (let i = 0; i < description.length; i++) {
    hash = ((hash << 5) - hash) + description.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }

  const noteIndex = Math.abs(hash) % PENTATONIC_FREQUENCIES.length
  noteAssignments.set(description, noteIndex)
  return noteIndex
}

/**
 * Get the frequency for an assertion
 */
function getFrequency(description: string): number {
  const noteIndex = getNoteIndex(description)
  return PENTATONIC_FREQUENCIES[noteIndex]
}

/**
 * Play a single note with envelope
 * Passing notes: clean sine wave
 * Failing notes: true note + half step away (subtle dissonance)
 */
function playNote(frequency: number, passed: boolean, time?: number): void {
  if (!audioContext || muted) return

  const startTime = time ?? audioContext.currentTime

  // Clean, pleasant sine wave for the main note
  const oscillator = audioContext.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startTime)

  const gainNode = audioContext.createGain()
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(volume, startTime + NOTE_ATTACK)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + NOTE_DURATION)

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + NOTE_DURATION + 0.1)

  if (!passed) {
    // Add a second note a half step up - creates subtle "off" dissonance
    const dissonantOsc = audioContext.createOscillator()
    dissonantOsc.type = 'sine'
    dissonantOsc.frequency.setValueAtTime(frequency * SEMITONE_RATIO, startTime)

    const dissonantGain = audioContext.createGain()
    dissonantGain.gain.setValueAtTime(0, startTime)
    dissonantGain.gain.linearRampToValueAtTime(volume, startTime + NOTE_ATTACK)
    dissonantGain.gain.exponentialRampToValueAtTime(0.001, startTime + NOTE_DURATION)

    dissonantOsc.connect(dissonantGain)
    dissonantGain.connect(audioContext.destination)
    dissonantOsc.start(startTime)
    dissonantOsc.stop(startTime + NOTE_DURATION + 0.1)
  }
}

/**
 * Play a chord (multiple notes simultaneously)
 */
function playChord(notes: { frequency: number; passed: boolean }[]): void {
  if (!audioContext || muted || notes.length === 0) return

  const now = audioContext.currentTime

  // Slightly stagger notes for a more natural "strum" effect
  notes.forEach((note, i) => {
    const stagger = i * 0.015 // 15ms between notes
    playNote(note.frequency, note.passed, now + stagger)
  })
}

/**
 * Play assertion sound
 * Called for each assertion - the grouping logic handles chord formation
 */
export function playAssertionSound(result: AssertionResult): void {
  if (!audioContext) {
    initAudio()
  }

  if (!audioContext || muted) return

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }

  const frequency = getFrequency(result.description)
  playNote(frequency, result.result)
}

/**
 * Play a chord for a group of assertions
 */
export function playGroupChord(results: AssertionResult[]): void {
  if (!audioContext) {
    initAudio()
  }

  if (!audioContext || muted || results.length === 0) return

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }

  const notes = results.map(r => ({
    frequency: getFrequency(r.description),
    passed: r.result,
  }))

  // Record for symphony playback
  symphonyEvents.push({
    timestamp: Date.now(),
    notes,
  })

  playChord(notes)
}

/**
 * Play the symphony - replay all recorded assertion chords
 */
export function playSymphony(speedMultiplier = 4): void {
  if (!audioContext) {
    initAudio()
  }

  if (!audioContext || symphonyEvents.length === 0) return

  // Stop any existing playback
  stopSymphony()

  isPlayingSymphony = true

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }

  // Calculate base timestamp
  const baseTime = symphonyEvents[0].timestamp

  // Schedule all events
  symphonyEvents.forEach((event, i) => {
    const relativeTime = (event.timestamp - baseTime) / speedMultiplier

    symphonyTimeoutId = setTimeout(() => {
      if (!isPlayingSymphony) return
      playChord(event.notes)

      // Update UI to show current position
      if (typeof window !== 'undefined' && (window as any).__scenetest_symphonyProgress) {
        (window as any).__scenetest_symphonyProgress(i, symphonyEvents.length)
      }

      // Mark as done after last event
      if (i === symphonyEvents.length - 1) {
        setTimeout(() => {
          isPlayingSymphony = false
          if (typeof window !== 'undefined' && (window as any).__scenetest_symphonyComplete) {
            (window as any).__scenetest_symphonyComplete()
          }
        }, NOTE_DURATION * 1000)
      }
    }, relativeTime)
  })
}

/**
 * Stop symphony playback
 */
export function stopSymphony(): void {
  isPlayingSymphony = false
  if (symphonyTimeoutId) {
    clearTimeout(symphonyTimeoutId)
    symphonyTimeoutId = null
  }
}

/**
 * Clear symphony recording
 */
export function clearSymphony(): void {
  symphonyEvents.length = 0
}

/**
 * Get symphony info
 */
export function getSymphonyInfo(): { eventCount: number; duration: number } {
  if (symphonyEvents.length === 0) {
    return { eventCount: 0, duration: 0 }
  }

  const duration = symphonyEvents[symphonyEvents.length - 1].timestamp - symphonyEvents[0].timestamp
  return {
    eventCount: symphonyEvents.length,
    duration,
  }
}

/**
 * Toggle mute
 */
export function toggleMute(): boolean {
  muted = !muted
  return muted
}

/**
 * Set mute state
 */
export function setMuted(value: boolean): void {
  muted = value
}

/**
 * Is currently muted?
 */
export function isMuted(): boolean {
  return muted
}

/**
 * Set volume (0-1)
 */
export function setVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value))
}

/**
 * Get current volume
 */
export function getVolume(): number {
  return volume
}

/**
 * Is symphony playing?
 */
export function isPlaying(): boolean {
  return isPlayingSymphony
}

/**
 * Get note info for visualization
 */
export function getNoteInfo(description: string): { noteIndex: number; noteName: string } {
  const noteIndex = getNoteIndex(description)
  const noteNames = ['C', 'D', 'E', 'G', 'A']
  const octave = Math.floor(noteIndex / 5) + 3
  const noteName = noteNames[noteIndex % 5] + octave

  return { noteIndex, noteName }
}

// Export for testing
export const _test = {
  PENTATONIC_FREQUENCIES,
  SEMITONE_RATIO,
}
