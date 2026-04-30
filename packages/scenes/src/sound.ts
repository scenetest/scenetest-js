import type { ScenetestConfig, CLIOptions } from './types.js'

const BELL = ''

export function tick(): void {
  process.stderr.write(BELL)
}

export function fail(): void {
  process.stderr.write(BELL + BELL)
}

export function finish(): void {
  process.stderr.write(BELL + BELL + BELL)
}

/** Precedence: CLI flags > SCENETEST_SOUND env > config.sound.enabled. */
export function resolveSoundEnabled(config: ScenetestConfig, cli: CLIOptions): boolean {
  if (cli.noSound) return false
  if (cli.sound) return true
  const env = process.env.SCENETEST_SOUND
  if (env === '0' || env === 'false') return false
  if (env === '1' || env === 'true') return true
  return config.sound?.enabled === true
}
