import type { ComputedMetrics } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_GAP_MS = 30 * 60 * 1000
const weekdayIndexes = new Map([['Sun', 6], ['Mon', 0], ['Tue', 1], ['Wed', 2], ['Thu', 3], ['Fri', 4], ['Sat', 5]])

export const emptyHeatmap = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

export function calculateTimestampMetrics(timestamps: number[], period: string, timeZone: string): ComputedMetrics {
  const heatmap = emptyHeatmap()
  if (!timestamps.length) return { period, timeZone, heatmap, hasTimestampData: false }

  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' })
  const days = new Set<number>()
  for (const timestamp of timestamps) {
    let weekday = '', year = '', month = '', day = '', hour = ''
    for (const part of formatter.formatToParts(timestamp)) {
      if (part.type === 'weekday') weekday = part.value
      else if (part.type === 'year') year = part.value
      else if (part.type === 'month') month = part.value
      else if (part.type === 'day') day = part.value
      else if (part.type === 'hour') hour = part.value
    }
    const dayIndex = weekdayIndexes.get(weekday), hourValue = Number(hour)
    if (dayIndex !== undefined && Number.isInteger(hourValue) && hourValue >= 0 && hourValue < 24) heatmap[dayIndex][hourValue]++
    const dayValue = Date.UTC(Number(year), Number(month) - 1, Number(day))
    if (Number.isFinite(dayValue)) days.add(dayValue / DAY_MS)
  }

  const orderedDays = [...days].sort((a, b) => a - b)
  let longestStreak = orderedDays.length ? 1 : undefined
  let currentStreak = 1
  for (let index = 1; index < orderedDays.length; index++) {
    currentStreak = orderedDays[index] === orderedDays[index - 1] + 1 ? currentStreak + 1 : 1
    longestStreak = Math.max(longestStreak!, currentStreak)
  }

  const orderedTimestamps = [...timestamps].sort((a, b) => a - b)
  let sessionStart = orderedTimestamps[0], previous = orderedTimestamps[0], longestSessionDurationMs = 0
  for (const timestamp of orderedTimestamps.slice(1)) {
    if (timestamp - previous > SESSION_GAP_MS) {
      longestSessionDurationMs = Math.max(longestSessionDurationMs, previous - sessionStart)
      sessionStart = timestamp
    }
    previous = timestamp
  }
  longestSessionDurationMs = Math.max(longestSessionDurationMs, previous - sessionStart)

  return { period, timeZone, heatmap, longestStreak, longestSessionDurationMs, hasTimestampData: true }
}
