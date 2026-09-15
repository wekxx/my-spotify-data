import { describe, expect, it } from 'vitest'
import { weekdayHourPlaysForTimezone } from './heatmap'

describe('weekdayHourPlaysForTimezone', () => {
  it('starts rows on Monday and converts timestamps to the selected timezone', () => {
    const heatmap = weekdayHourPlaysForTimezone([Date.parse('2024-02-05T01:30:00Z')], 'America/Toronto')
    expect(heatmap[6][20]).toBe(1)
    expect(heatmap[0].flat().reduce((total, plays) => total + plays, 0)).toBe(0)
  })
})
