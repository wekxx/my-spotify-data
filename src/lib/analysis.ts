import type { Analysis, FileReport, InputFile, MetricsAggregate, Track } from '../types'

const AUDIO = /(?:^|\/)Streaming_History_Audio_(\d{4})(?:_\d+)?\.json$/i
const VIDEO = /(?:^|\/)Streaming_History_Video_.*\.json$/i
const TRACK_URI = /^spotify:track:([A-Za-z0-9]+)$/
const decoder = new TextDecoder('utf-8', { fatal: true })
type Pair = { trackName: string; artistName: string; count: number }
type Bucket = Map<string, Map<string, Pair>>

function clean(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'variant' })
}

function add(bucket: Bucket, uri: string, trackName: string, artistName: string, amount = 1) {
  let pairs = bucket.get(uri)
  if (!pairs) bucket.set(uri, (pairs = new Map()))
  const key = `${artistName}\u0000${trackName}`
  const existing = pairs.get(key)
  if (existing) existing.count += amount
  else pairs.set(key, { trackName, artistName, count: amount })
}

function rank(bucket: Bucket): Track[] {
  return [...bucket.entries()].map(([uri, pairs]) => {
    const choices = [...pairs.values()].sort((a, b) => b.count - a.count || compareText(a.artistName, b.artistName) || compareText(a.trackName, b.trackName))
    return { uri, trackName: choices[0].trackName, artistName: choices[0].artistName, plays: choices.reduce((n, p) => n + p.count, 0), variants: choices.map(({ trackName, artistName, count }) => ({ trackName, artistName, plays: count })) }
  }).sort((a, b) => b.plays - a.plays || compareText(a.artistName, b.artistName) || compareText(a.trackName, b.trackName))
}

export function combineTracks(tracks: Track[]): Track[] {
  const bucket: Bucket = new Map()
  for (const track of tracks) {
    for (const variant of track.variants ?? [{ trackName: track.trackName, artistName: track.artistName, plays: track.plays }]) add(bucket, track.uri, variant.trackName, variant.artistName, variant.plays)
  }
  return rank(bucket)
}

async function digest(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes)
  const value = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(value)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function analyzeFiles(files: InputFile[]): Promise<Analysis> {
  const reports: FileReport[] = []
  const years = new Map<string, Bucket>()
  const hashes = new Set<string>()
  let validRecords = 0
  let ignoredRecords = 0
  const metrics: MetricsAggregate = { monthlyListeningMs: {}, monthlyPlayCounts: {}, monthlyUniqueTracks: {}, weekdayHourPlays: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)), weekdayHourPlaysByYear: {}, timestampedPlayTimes: [], timestampedPlayTimesByYear: {}, timestampedPlays: 0, timedPlays: 0, skipProfile: { eligiblePlays: 0, skippedPlays: 0, quickSkips: 0 }, skipProfileByYear: {} }
  const monthlyTracks = new Map<string, Set<string>>()

  for (const file of files) {
    const normalized = file.name.replace(/\\/g, '/')
    if (VIDEO.test(normalized)) { reports.push({ name: file.name, status: 'ignored', reason: 'Video history is not part of this analysis.' }); continue }
    const match = normalized.match(AUDIO)
    if (!match) { reports.push({ name: file.name, status: 'ignored', reason: 'This file is not a supported Spotify Audio History JSON file.' }); continue }
    let hash: string
    try { hash = await digest(file.bytes) } catch { reports.push({ name: file.name, status: 'invalid', reason: 'This file could not be verified.' }); continue }
    if (hashes.has(hash)) { reports.push({ name: file.name, status: 'duplicate', reason: 'Identical content was already processed.' }); continue }
    hashes.add(hash)
    let parsed: unknown
    try { parsed = JSON.parse(decoder.decode(file.bytes)) } catch { reports.push({ name: file.name, status: 'invalid', reason: 'Unreadable or malformed JSON.' }); continue }
    if (!Array.isArray(parsed)) { reports.push({ name: file.name, status: 'invalid', reason: 'This JSON file does not contain a supported listening-history list.' }); continue }
    const bucket = years.get(match[1]) ?? new Map()
    let fileValid = 0
    let fileIgnored = 0
    for (const item of parsed) {
      if (!item || typeof item !== 'object') { fileIgnored++; continue }
      const row = item as Record<string, unknown>
      const uri = row.spotify_track_uri
      if (typeof uri !== 'string' || !TRACK_URI.test(uri)) { fileIgnored++; continue }
      add(bucket, uri, clean(row.master_metadata_track_name, 'Unknown track'), clean(row.master_metadata_album_artist_name, 'Unknown artist'))
      if (typeof row.skipped === 'boolean') {
        const skipProfile = metrics.skipProfileByYear[match[1]] ??= { eligiblePlays: 0, skippedPlays: 0, quickSkips: 0 }
        skipProfile.eligiblePlays++; metrics.skipProfile.eligiblePlays++
        if (row.skipped) {
          skipProfile.skippedPlays++; metrics.skipProfile.skippedPlays++
          if (typeof row.ms_played === 'number' && Number.isFinite(row.ms_played) && row.ms_played > 0 && row.ms_played < 30_000) { skipProfile.quickSkips++; metrics.skipProfile.quickSkips++ }
        }
      }
      const timestamp = typeof row.ts === 'string' ? new Date(row.ts) : undefined
      if (timestamp && !Number.isNaN(timestamp.valueOf())) {
        metrics.timestampedPlays++
        const month = timestamp.toISOString().slice(0, 7), timestampYear = month.slice(0, 4)
        metrics.monthlyPlayCounts[month] = (metrics.monthlyPlayCounts[month] ?? 0) + 1
        const tracks = monthlyTracks.get(month) ?? new Set<string>(); tracks.add(uri); monthlyTracks.set(month, tracks)
        metrics.weekdayHourPlays[timestamp.getUTCDay()][timestamp.getUTCHours()]++
        const yearHeatmap = metrics.weekdayHourPlaysByYear[timestampYear] ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)); yearHeatmap[timestamp.getUTCDay()][timestamp.getUTCHours()]++; metrics.weekdayHourPlaysByYear[timestampYear] = yearHeatmap
        const timestampMs = timestamp.valueOf()
        metrics.timestampedPlayTimes.push(timestampMs)
        ;(metrics.timestampedPlayTimesByYear[timestampYear] ??= []).push(timestampMs)
        const duration = typeof row.ms_played === 'number' && Number.isFinite(row.ms_played) && row.ms_played > 0 ? row.ms_played : 0
        if (duration) { metrics.monthlyListeningMs[month] = (metrics.monthlyListeningMs[month] ?? 0) + duration; metrics.timedPlays++ }
      }
      fileValid++
    }
    if (fileValid) years.set(match[1], bucket)
    validRecords += fileValid; ignoredRecords += fileIgnored
    reports.push({ name: file.name, status: 'processed', ignoredRecords: fileIgnored })
  }
  const all: Bucket = new Map()
  const rankings: Record<string, Track[]> = {}
  const sortedYears = [...years.keys()].sort((a, b) => Number(b) - Number(a))
  for (const year of sortedYears) {
    rankings[year] = rank(years.get(year)!)
    for (const [uri, pairs] of years.get(year)!) for (const pair of pairs.values()) add(all, uri, pair.trackName, pair.artistName, pair.count)
  }
  rankings.all = rank(all)
  for (const [month, tracks] of monthlyTracks) metrics.monthlyUniqueTracks[month] = tracks.size
  const hasIssues = reports.some((r) => r.status === 'duplicate' || r.status === 'invalid' || (r.status === 'ignored' && !VIDEO.test(r.name.replace(/\\/g, '/')))) || ignoredRecords > 0
  return { rankings, years: sortedYears, reports, validRecords, ignoredRecords, hasIssues, metrics }
}

export const supportedAudioName = (name: string) => AUDIO.test(name.replace(/\\/g, '/'))
