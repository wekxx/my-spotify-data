import { describe, expect, it } from 'vitest'
import { calculateTimestampMetrics } from './timestampMetrics'

describe('calculateTimestampMetrics', () => {
  it('builds timezone-aware heatmap and streak data in one summary', () => {
    const metrics = calculateTimestampMetrics([
      Date.parse('2024-02-05T01:30:00Z'),
      Date.parse('2024-02-06T01:30:00Z'),
    ], 'all', 'America/Toronto')
    expect(metrics.heatmap[6][20]).toBe(1)
    expect(metrics.heatmap[0][20]).toBe(1)
    expect(metrics.longestStreak).toBe(2)
  })

  it('finds the longest session span without creating session arrays', () => {
    const metrics = calculateTimestampMetrics([
      Date.parse('2024-02-01T10:00:00Z'),
      Date.parse('2024-02-01T10:20:00Z'),
      Date.parse('2024-02-01T11:05:00Z'),
      Date.parse('2024-02-01T11:35:00Z'),
      Date.parse('2024-02-01T12:00:00Z'),
    ], 'all', 'UTC')
    expect(metrics.longestSessionDurationMs).toBe(55 * 60 * 1000)
  })

  it('returns a compact empty summary when no timestamps are available', () => {
    const metrics = calculateTimestampMetrics([], '2024', 'UTC')
    expect(metrics.hasTimestampData).toBe(false)
    expect(metrics.heatmap.flat().every((value) => value === 0)).toBe(true)
  })
})
