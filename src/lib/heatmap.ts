import { calculateTimestampMetrics, emptyHeatmap } from './timestampMetrics'

export function weekdayHourPlaysForTimezone(timestamps: number[], timeZone: string): number[][] {
  return calculateTimestampMetrics(timestamps, 'all', timeZone).heatmap
}

export const emptyWeekdayHourPlays = emptyHeatmap
