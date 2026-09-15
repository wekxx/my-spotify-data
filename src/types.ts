export type TrackVariant = { trackName: string; artistName: string; plays: number }
export type Track = { uri: string; trackName: string; artistName: string; plays: number; variants?: TrackVariant[] }
export type FileStatus = 'processed' | 'ignored' | 'duplicate' | 'invalid'
export type FileReport = { name: string; status: FileStatus; reason?: string; ignoredRecords?: number }
export type SkipProfile = { eligiblePlays: number; skippedPlays: number; quickSkips: number }
export type MetricsAggregate = { monthlyListeningMs: Record<string, number>; monthlyPlayCounts: Record<string, number>; monthlyUniqueTracks: Record<string, number>; weekdayHourPlays: number[][]; weekdayHourPlaysByYear: Record<string, number[][]>; timestampedPlayTimes: number[]; timestampedPlayTimesByYear: Record<string, number[]>; timestampedPlays: number; timedPlays: number; skipProfile: SkipProfile; skipProfileByYear: Record<string, SkipProfile> }
export type Analysis = { rankings: Record<string, Track[]>; years: string[]; reports: FileReport[]; validRecords: number; ignoredRecords: number; hasIssues: boolean; metrics: MetricsAggregate }
export type InputFile = { name: string; bytes: Uint8Array }
export type ComputedMetrics = { period: string; timeZone: string; heatmap: number[][]; longestStreak?: number; longestSessionDurationMs?: number; hasTimestampData: boolean }
export type WorkerRequest =
  | { type: 'analyze'; id: number; files: File[] }
  | { type: 'metrics'; id: number; period: string; timeZone: string }
export type WorkerResponse =
  | { id: number; type: 'stage'; stage: string }
  | { id: number; type: 'result'; result: Analysis }
  | { id: number; type: 'metrics-result'; metrics: ComputedMetrics }
  | { id: number; type: 'error'; message: string }
