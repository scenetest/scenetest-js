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

// How much to detune failing notes (in Hz multiplier)
// A semitone down is roughly 0.9439, we use 0.97 for subtle dissonance
const FAIL_DETUNE_RATIO = 0.97

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
function getFrequency(description: string, passed: boolean): number {
  const noteIndex = getNoteIndex(description)
  let frequency = PENTATONIC_FREQUENCIES[noteIndex]

  // Detune failing assertions for dissonance
  if (!passed) {
    frequency *= FAIL_DETUNE_RATIO
  }

  return frequency
}

/**
 * Play a single note with envelope
 * Passing notes: clean sine wave
 * Failing notes: harsh sawtooth with pitch slide down ("sad trombone" effect)
 */
function playNote(frequency: number, passed: boolean, time?: number): void {
  if (!audioContext || muted) return

  const startTime = time ?? audioContext.currentTime

  if (passed) {
    // Clean, pleasant sine wave for passes
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
  } else {
    // OFFENSIVE failure sound: harsh sawtooth with pitch slide down
    const failDuration = 0.4 // Longer for more drama

    // Main harsh sawtooth oscillator
    const osc1 = audioContext.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.setValueAtTime(frequency, startTime)
    // Slide pitch down dramatically (sad trombone effect)
    osc1.frequency.exponentialRampToValueAtTime(frequency * 0.5, startTime + failDuration)

    // Second oscillator slightly detuned for beating/chorus effect
    const osc2 = audioContext.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(frequency * 1.02, startTime) // 2% sharp
    osc2.frequency.exponentialRampToValueAtTime(frequency * 0.51, startTime + failDuration)

    // Third oscillator for extra grit (square wave, lower octave)
    const osc3 = audioContext.createOscillator()
    osc3.type = 'square'
    osc3.frequency.setValueAtTime(frequency * 0.5, startTime) // One octave down
    osc3.frequency.exponentialRampToValueAtTime(frequency * 0.25, startTime + failDuration)

    // Gain envelope - louder attack, quick decay
    const gainNode = audioContext.createGain()
    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(volume * 1.2, startTime + 0.01) // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.8, startTime + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + failDuration)

    // Fast, aggressive vibrato
    const vibrato = audioContext.createOscillator()
    vibrato.frequency.setValueAtTime(12, startTime) // 12 Hz - faster wobble
    const vibratoGain = audioContext.createGain()
    vibratoGain.gain.setValueAtTime(frequency * 0.05, startTime) // 5% pitch modulation
    vibrato.connect(vibratoGain)
    vibratoGain.connect(osc1.frequency)
    vibratoGain.connect(osc2.frequency)

    // Connect all oscillators
    osc1.connect(gainNode)
    osc2.connect(gainNode)
    osc3.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Start all
    osc1.start(startTime)
    osc2.start(startTime)
    osc3.start(startTime)
    vibrato.start(startTime)

    // Stop all
    osc1.stop(startTime + failDuration + 0.1)
    osc2.stop(startTime + failDuration + 0.1)
    osc3.stop(startTime + failDuration + 0.1)
    vibrato.stop(startTime + failDuration + 0.1)
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

  const frequency = getFrequency(result.description, result.result)
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
    frequency: getFrequency(r.description, r.result),
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
  FAIL_DETUNE_RATIO,
}
