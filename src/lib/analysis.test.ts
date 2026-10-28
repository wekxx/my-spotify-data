import { describe, expect, it } from 'vitest'
import { analyzeFiles, combineTracks } from './analysis'

const enc = new TextEncoder()
const file = (name: string, rows: unknown) => ({ name, bytes: enc.encode(typeof rows === 'string' ? rows : JSON.stringify(rows)) })
describe('analysis', () => {
  it('merges years, ignores invalid rows, resolves metadata, and deduplicates content', async () => {
    const a = [{ ms_played:30_000, spotify_track_uri:'spotify:track:A1', master_metadata_track_name:' Zèro ', master_metadata_album_artist_name:'Beta' },{ ms_played:30_000, spotify_track_uri:'spotify:track:A1', master_metadata_track_name:'Alpha', master_metadata_album_artist_name:'Able' },{ ms_played:30_000, spotify_track_uri:'spotify:track:A1', master_metadata_track_name:'Alpha', master_metadata_album_artist_name:'Able' },{ ms_played:30_000, spotify_track_uri:null }]
    const b = [{ ms_played:30_000, spotify_track_uri:'spotify:track:A1', master_metadata_track_name:'Zèro', master_metadata_album_artist_name:'Beta' },{ ms_played:30_000, spotify_track_uri:'spotify:track:B2', master_metadata_track_name:'', master_metadata_album_artist_name:null }]
    const result = await analyzeFiles([file('Streaming_History_Audio_2024.json', a), file('Streaming_History_Audio_2024_1.json', a), file('Streaming_History_Audio_2023.json', b)])
    expect(result.years).toEqual(['2024','2023']); expect(result.rankings.all[0]).toMatchObject({ uri:'spotify:track:A1', plays:4, trackName:'Alpha', artistName:'Able' })
    expect(result.rankings['2023'][1]).toMatchObject({ trackName:'Unknown track', artistName:'Unknown artist' })
    expect(result.reports[1].status).toBe('duplicate'); expect(result.ignoredRecords).toBe(1)
  })
  it('uses filename year and deterministic alphabetical tie breaks', async () => {
    const result = await analyzeFiles([file('Streaming_History_Audio_2020.json',[{ts:'2025',ms_played:30_000,spotify_track_uri:'spotify:track:Z',master_metadata_track_name:'Song',master_metadata_album_artist_name:'Zed'},{ms_played:30_000,spotify_track_uri:'spotify:track:A',master_metadata_track_name:'Song',master_metadata_album_artist_name:'Able'}])])
    expect(result.years).toEqual(['2020']); expect(result.rankings['2020'].map(x=>x.uri)).toEqual(['spotify:track:A','spotify:track:Z'])
  })
  it('counts only Spotify streams played for at least 30 seconds in rankings', async () => {
    const result = await analyzeFiles([file('Streaming_History_Audio_2024.json', [
      { ms_played:29_999, spotify_track_uri:'spotify:track:SHORT', master_metadata_track_name:'Short', master_metadata_album_artist_name:'Artist' },
      { ms_played:30_000, spotify_track_uri:'spotify:track:EXACT', master_metadata_track_name:'Exact', master_metadata_album_artist_name:'Artist' },
      { ms_played:45_000, spotify_track_uri:'spotify:track:LONG', master_metadata_track_name:'Long', master_metadata_album_artist_name:'Artist' },
    ])])
    expect(result.rankings['2024'].map((track) => track.uri)).toEqual(['spotify:track:EXACT', 'spotify:track:LONG'])
  })
  it('builds compact UTC listening-time, skip, and weekday-hour aggregates', async () => {
    const result = await analyzeFiles([file('Streaming_History_Audio_2024.json', [{ ts:'2024-02-04T23:30:00Z', ms_played:120000, skipped:false, spotify_track_uri:'spotify:track:A', master_metadata_track_name:'A', master_metadata_album_artist_name:'A' }, { ts:'invalid', ms_played:5000, skipped:true, spotify_track_uri:'spotify:track:B', master_metadata_track_name:'B', master_metadata_album_artist_name:'B' }])])
    expect(result.metrics.monthlyListeningMs).toEqual({ '2024-02': 120000 }); expect(result.metrics.monthlyPlayCounts).toEqual({ '2024-02': 1 }); expect(result.metrics.monthlyUniqueTracks).toEqual({ '2024-02': 1 }); expect(result.metrics.weekdayHourPlays[0][23]).toBe(1); expect(result.metrics.timestampedPlays).toBe(1); expect(result.metrics.timedPlays).toBe(1)
    expect(result.metrics.skipProfile).toEqual({ eligiblePlays: 2, skippedPlays: 1, quickSkips: 1 }); expect(result.metrics.skipProfileByYear['2024']).toEqual({ eligiblePlays: 2, skippedPlays: 1, quickSkips: 1 })
  })
  it('recombines selected years with deterministic metadata resolution', async () => {
    const result = await analyzeFiles([file('Streaming_History_Audio_2024.json', [{ ms_played:30_000, spotify_track_uri:'spotify:track:A', master_metadata_track_name:'New', master_metadata_album_artist_name:'Artist' }]), file('Streaming_History_Audio_2023.json', [{ ms_played:30_000, spotify_track_uri:'spotify:track:A', master_metadata_track_name:'Old', master_metadata_album_artist_name:'Artist' }, { ms_played:30_000, spotify_track_uri:'spotify:track:A', master_metadata_track_name:'Old', master_metadata_album_artist_name:'Artist' }])])
    expect(combineTracks([result.rankings['2024'][0], result.rankings['2023'][0]])[0]).toMatchObject({ trackName:'Old', plays:3 })
  })
})
