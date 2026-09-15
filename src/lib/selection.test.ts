import { describe, expect, it } from 'vitest'
import { updateTrackSelection } from './selection'

const rows = [{ uri: 'spotify:track:one' }, { uri: 'spotify:track:two' }, { uri: 'spotify:track:three' }, { uri: 'spotify:track:four' }]

describe('updateTrackSelection', () => {
  it('toggles one track when no range anchor is used', () => {
    expect(updateTrackSelection(rows, new Set(), 1, null, false)).toEqual(new Set(['spotify:track:two']))
  })

  it('selects every track in an inclusive range', () => {
    expect(updateTrackSelection(rows, new Set(['spotify:track:one']), 3, 0, true)).toEqual(new Set(rows.map((row) => row.uri)))
  })

  it('removes an inclusive range when the range endpoint is already selected', () => {
    expect(updateTrackSelection(rows, new Set(rows.map((row) => row.uri)), 1, 3, true)).toEqual(new Set(['spotify:track:one']))
  })

  it('falls back to a single-track selection when no anchor exists', () => {
    expect(updateTrackSelection(rows, new Set(), 2, null, true)).toEqual(new Set(['spotify:track:three']))
  })
})
