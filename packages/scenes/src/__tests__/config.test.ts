import { describe, it, expect } from 'vitest'
import { filterTeamsByName } from '../config.js'
import type { ResolvedTeam } from '../types.js'

function team(name: string | undefined): ResolvedTeam {
  return { actors: {}, meta: name === undefined ? {} : { name } }
}

describe('filterTeamsByName', () => {
  const pool = [team('French'), team('English'), team('Spanish')]

  it('returns only the matching team', () => {
    const result = filterTeamsByName(pool, 'English')
    expect(result).toHaveLength(1)
    expect(result[0].meta.name).toBe('English')
  })

  it('throws listing available team names when no match', () => {
    expect(() => filterTeamsByName(pool, 'Klingon')).toThrowError(
      /--team "Klingon" not found.*French.*English.*Spanish/
    )
  })

  it('labels unnamed teams as "(unnamed)" in the available list', () => {
    expect(() => filterTeamsByName([team(undefined), team('A')], 'B')).toThrowError(
      /\(unnamed\).*A/
    )
  })
})
