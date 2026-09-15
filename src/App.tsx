import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, Check, Download, ExternalLink, FileArchive, FileJson, ListPlus, RotateCcw, Upload, X } from 'lucide-react'
import { AppHeader } from './components/AppHeader'
import { Metrics } from './components/Metrics'
import { downloadCsv } from './lib/csv'
import { updateTrackSelection } from './lib/selection'
import { calculateTimestampMetrics } from './lib/timestampMetrics'
import { connectAndCreate, finishSpotifyCallback, hasSpotifyCallback, listenForSpotifyNativeCallback, spotifyRedirectUri, type CreatedPlaylist, type PlaylistFailure } from './lib/spotify'
import type { Analysis, ComputedMetrics, WorkerResponse } from './types'

const Header = AppHeader

type View = 'landing' | 'processing' | 'summary' | 'results' | 'error' | 'spotify'
const ZIP_WARN = 100 * 1024 * 1024, ZIP_MAX = 200 * 1024 * 1024, JSON_WARN = 250 * 1024 * 1024
const previewResult: Analysis | undefined = import.meta.env.DEV && new URLSearchParams(location.search).has('synthetic-preview') ? {
  years: ['2024', '2023'], validRecords: 12, ignoredRecords: 0, hasIssues: false, reports: [], rankings: {
    all: [
      { uri: 'spotify:track:SYNTH001', trackName: 'Northern Light', artistName: 'The Test Signals', plays: 5 },
      { uri: 'spotify:track:SYNTH002', trackName: 'Café électrique', artistName: 'Renée Example', plays: 4 },
      { uri: 'spotify:track:SYNTH003', trackName: 'Quiet Geometry', artistName: 'Fixture Ensemble', plays: 3 },
    ],
    '2024': [{ uri: 'spotify:track:SYNTH001', trackName: 'Northern Light', artistName: 'The Test Signals', plays: 3 }, { uri: 'spotify:track:SYNTH003', trackName: 'Quiet Geometry', artistName: 'Fixture Ensemble', plays: 3 }],
    '2023': [{ uri: 'spotify:track:SYNTH002', trackName: 'Café électrique', artistName: 'Renée Example', plays: 4 }, { uri: 'spotify:track:SYNTH001', trackName: 'Northern Light', artistName: 'The Test Signals', plays: 2 }],
  },
  metrics: { monthlyListeningMs: { '2023-01': 5_400_000, '2024-02': 7_200_000 }, monthlyPlayCounts: { '2023-01': 5, '2024-02': 7 }, monthlyUniqueTracks: { '2023-01': 3, '2024-02': 4 }, weekdayHourPlays: Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => (day === 5 && hour === 20 ? 8 : day === 0 && hour === 11 ? 4 : 0))), weekdayHourPlaysByYear: {}, timestampedPlayTimes: ['2023-01-02T20:00:00Z', '2023-01-02T20:04:00Z', '2023-01-03T20:10:00Z', '2023-01-03T20:14:00Z', '2023-01-04T20:19:00Z', '2024-02-01T21:00:00Z', '2024-02-02T21:03:00Z', '2024-02-03T21:08:00Z', '2024-02-04T21:10:00Z', '2024-02-10T22:00:00Z', '2024-02-10T22:04:00Z', '2024-02-10T22:09:00Z'].map(Date.parse), timestampedPlayTimesByYear: { '2023': ['2023-01-02T20:00:00Z', '2023-01-02T20:04:00Z', '2023-01-03T20:10:00Z', '2023-01-03T20:14:00Z', '2023-01-04T20:19:00Z'].map(Date.parse), '2024': ['2024-02-01T21:00:00Z', '2024-02-02T21:03:00Z', '2024-02-03T21:08:00Z', '2024-02-04T21:10:00Z', '2024-02-10T22:00:00Z', '2024-02-10T22:04:00Z', '2024-02-10T22:09:00Z'].map(Date.parse) }, timestampedPlays: 12, timedPlays: 12, skipProfile: { eligiblePlays: 12, skippedPlays: 2, quickSkips: 1 }, skipProfileByYear: { '2023': { eligiblePlays: 5, skippedPlays: 1, quickSkips: 0 }, '2024': { eligiblePlays: 7, skippedPlays: 1, quickSkips: 1 } } },
} : undefined

function Landing({ onFiles, error }: { onFiles: (files: File[]) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const redirectUri = spotifyRedirectUri()
  const accept = useCallback((list: FileList | null) => list && onFiles([...list]), [onFiles])
  return <main className="landing">
    <section className="hero"><h1><span className="hero-title-line">Your Spotify history,</span><br/><em>decoded.</em></h1><p className="lede">Discover your all-time top tracks and artists, listening patterns, and create playlists.</p></section>
    <section className="upload-card" role="button" tabIndex={0} aria-label="Import Spotify data files" aria-describedby={error ? 'upload-help upload-error' : 'upload-help'} onClick={(event) => { if (event.target !== input.current) input.current?.click() }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click() } }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); accept(e.dataTransfer.files) }}>
      <input ref={input} className="sr-only" type="file" accept=".zip,.json,application/json,application/zip" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => accept(e.target.files)}/>
      <div className="upload-icon"><Upload/></div><h2>Import your Spotify data</h2><p id="upload-help">Drop files here, or tap/click to browse</p>
      {error && <p className="form-error" id="upload-error" role="alert">{error}</p>}
      <div className="formats"><span><FileArchive size={15}/>ZIP file</span><i/> <span><FileJson size={15}/>Audio JSON files</span></div>
    </section>
    <section className="how"><span>GET THE RIGHT FILES</span><h2>Request your extended history</h2><p>Spotify Account <b>→</b> Privacy <b>→</b> Download your data <b>→</b> Your Extended streaming history</p><small>Request Extended Streaming History, not the standard account-data download. This app uses the Audio JSON files in that download.</small></section>
    <section className="client-id-guide"><span>OPTIONAL: PLAYLISTS</span><h2>Get your Spotify Client ID</h2><p>You only need this if you want to create a playlist from your selected tracks.</p><ol className="client-id-steps"><li><b>1</b><span>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard <ExternalLink size={13}/></a>.</span></li><li><b>2</b><span>Select <strong>Create an app</strong>, give it a name and description, accept Spotify’s terms, then create it.</span></li><li><b>3</b><span>Open the app’s settings and add this exact Redirect URI: <code>{redirectUri}</code>.</span></li><li><b>4</b><span>Copy its <strong>Client ID</strong> and enter it when you create a playlist. Never use or share the Client Secret.</span></li></ol></section>
  </main>
}

function Processing({ stage, cancel }: { stage: string; cancel: () => void }) {
  const stages = ['Reading files', 'Validating history', 'Building rankings', 'Preparing results']
  const index = stages.indexOf(stage)
  return <main className="state-page"><section className="process-card"><div className="spinner" aria-hidden="true"/><h1>{stage}</h1><p>Your files never leave this device.</p><ol className="steps">{stages.map((s, i) => <li key={s} className={i < index ? 'done' : i === index ? 'active' : ''}><span>{i < index ? <Check size={14}/> : i + 1}</span>{s}</li>)}</ol><button className="secondary" onClick={cancel}>Cancel</button></section></main>
}

function Summary({ result, proceed, reset, fatal }: { result?: Analysis; proceed: () => void; reset: () => void; fatal?: string }) {
  return <main className="state-page"><section className="summary-card"><h1>{fatal || !result?.validRecords ? 'We couldn’t build rankings' : 'Your history is ready'}</h1><p>{fatal ?? (!result?.validRecords ? 'No valid Audio track records were found. Try a supported Spotify ZIP or Audio JSON files.' : `${result.validRecords.toLocaleString()} plays imported`)}</p>
    {result && <ul className="report-list">{result.reports.map((r, i) => <li key={`${r.name}-${i}`}><span className={`status ${r.status}`}>{r.status === 'processed' ? <Check/> : <X/>}</span><div><b>{r.name.split(/[\\/]/).pop()}</b><small>{r.reason ?? `Processed${r.ignoredRecords ? ` · ${r.ignoredRecords} invalid records ignored` : ''}`}</small></div></li>)}</ul>}
    <div className="actions">{result && result.validRecords > 0 && <button className="primary" onClick={proceed}>View results</button>}<button className="secondary" onClick={reset}>Choose different files</button></div>
  </section></main>
}

function Results({ result, reset, requestMetrics, playlist, playlistError }: { result: Analysis; reset: () => void; requestMetrics: (period: string, timeZone: string) => Promise<ComputedMetrics>; playlist?: CreatedPlaylist; playlistError?: string }) {
  const [tab, setTab] = useState('all'), [section, setSection] = useState<'rankings' | 'metrics'>('rankings'), [selected, setSelected] = useState<Set<string>>(new Set()), [showAll, setShowAll] = useState(false), rows = result.rankings[tab] ?? []
  const selectionAnchor = useRef<number | null>(null)
  const rangePress = useRef<{ index: number; timer?: ReturnType<typeof setTimeout>; triggered: boolean }>()
  useEffect(() => {
    const tabLists = document.querySelectorAll<HTMLElement>('.results [role="tablist"]')
    const moveFocus = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const tabs = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
      if (current < 0) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      tabs[next].focus()
      tabs[next].click()
    }
    tabLists.forEach((list) => list.addEventListener('keydown', moveFocus))
    return () => tabLists.forEach((list) => list.removeEventListener('keydown', moveFocus))
  }, [])
  const tabs = ['all', ...result.years]
  const visibleRows = showAll ? rows : rows.slice(0, 1000)
  const toggle = (index: number, shiftKey: boolean) => {
    const anchor = selectionAnchor.current
    setSelected((current) => updateTrackSelection(visibleRows, current, index, anchor, shiftKey))
    selectionAnchor.current = index
  }
  const startRangePress = (event: React.PointerEvent<HTMLTableCellElement>, index: number) => {
    if (event.pointerType !== 'touch' || selectionAnchor.current === null || selectionAnchor.current === index) return
    const press: { index: number; timer?: ReturnType<typeof setTimeout>; triggered: boolean } = { index, triggered: false }
    press.timer = setTimeout(() => { press.triggered = true; toggle(index, true) }, 500)
    rangePress.current = press
  }
  const clearRangePress = (cancelled = false) => {
    const press = rangePress.current
    if (!press) return
    if (press.timer) clearTimeout(press.timer)
    if (cancelled || !press.triggered) rangePress.current = undefined
  }
  const handleCheckboxClick = (event: React.MouseEvent<HTMLInputElement>, index: number) => {
    const press = rangePress.current
    if (press?.index === index && press.triggered) { event.preventDefault(); rangePress.current = undefined; return }
    rangePress.current = undefined
    toggle(index, event.shiftKey)
  }
  const selectedRows = visibleRows.filter((row) => selected.has(row.uri))
  return <main className="results"><div className="results-top"><div><h1>{section === 'rankings' ? 'Your top tracks' : 'Your listening metrics'}</h1><p>{section === 'rankings' ? `${tab === 'all' ? 'All years' : tab} · ${rows.length.toLocaleString()} tracks` : 'A local view of your listening over time'}</p></div><div className="actions">{section === 'rankings' && <button className="secondary" onClick={() => downloadCsv(rows, tab)}><Download size={17}/>Export CSV</button>}<ResetDialog onReset={reset}/></div></div>
    <div className="view-tabs" role="tablist" aria-label="Results view"><button role="tab" aria-selected={section === 'rankings'} onClick={() => setSection('rankings')}>Rankings</button><button role="tab" aria-selected={section === 'metrics'} onClick={() => setSection('metrics')}>Metrics</button></div>
    {section === 'metrics' ? <Metrics result={result} requestMetrics={requestMetrics}/> : <>
    <div className="results-tools"><div className="tabs" role="tablist" aria-label="Ranking period">{tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={(e) => { setTab(t); setSelected(new Set()); setShowAll(false); selectionAnchor.current = null; e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }}>{t === 'all' ? 'All years' : t}</button>)}</div><div className="selection-actions"><button className="ghost compact" onClick={() => { setSelected(new Set(visibleRows.map((row) => row.uri))); selectionAnchor.current = null }}>Select all</button>{selected.size > 0 && <button className="ghost compact" onClick={() => { setSelected(new Set()); selectionAnchor.current = null }}>Clear</button>}</div></div>
    <p className="selection-hint">Select a checkbox, then hold Shift while selecting another—or touch and hold another checkbox—to select a range.</p>
    {!showAll && rows.length > 1000 && <div className="result-limit"><span>Showing the first 1,000 ranked tracks to keep this view fast.</span><button className="ghost compact" onClick={() => setShowAll(true)}>Show all {rows.length.toLocaleString()} tracks</button></div>}
    <div className="table-wrap"><table><thead><tr><th className="select-cell"><span className="sr-only">Select</span></th><th>#</th><th>Track name</th><th>Artist name</th><th className="number">Plays</th><th>URI</th></tr></thead><tbody>{visibleRows.map((r, i) => <tr key={r.uri} className={selected.has(r.uri) ? 'selected-row' : ''}><td className="select-cell" onPointerDown={(event) => startRangePress(event, i)} onPointerUp={() => clearRangePress()} onPointerLeave={() => clearRangePress()} onPointerCancel={() => clearRangePress(true)} onContextMenu={(event) => { if (rangePress.current?.triggered) event.preventDefault() }}><input type="checkbox" checked={selected.has(r.uri)} readOnly onClick={(event) => handleCheckboxClick(event, i)} aria-label={`Select ${r.trackName}`}/></td><td className="rank">{i + 1}</td><td data-label="Track"><strong>{r.trackName}</strong></td><td data-label="Artist">{r.artistName}</td><td data-label="Plays" className="number">{r.plays.toLocaleString()}</td><td className="link-cell"><a href={`https://open.spotify.com/track/${r.uri.slice(14)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open in Spotify ${r.trackName}`}>Open in Spotify <ArrowUpRight size={14}/></a></td></tr>)}</tbody></table></div>
    {selectedRows.length > 0 && <div className="playlist-bar"><span><b>{selectedRows.length.toLocaleString()}</b> selected</span><PlaylistDialog uris={selectedRows.map((row) => row.uri)} period={tab} playlist={playlist} playlistError={playlistError}/></div>}
    </>}
  </main>
}

export function LegacyMetrics({ result }: { result: Analysis }) {
  const annual = [...result.years].reverse().map((year) => ({ year, plays: result.rankings[year].reduce((total, track) => total + track.plays, 0), tracks: result.rankings[year].length }))
  const maxTracks = Math.max(1, ...annual.map((item) => item.tracks)), maxPlays = Math.max(1, ...annual.map((item) => item.plays))
  const artists = new Map<string, number>()
  for (const track of result.rankings.all) artists.set(track.artistName, (artists.get(track.artistName) ?? 0) + track.plays)
  const topArtists = [...artists.entries()].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name)).slice(0, 50)
  return <div className="metrics"><section className="metric-card"><div className="metric-heading"><div><h2>Listening by year</h2><p>Unique tracks and total plays, using the year in each imported filename.</p></div><div className="chart-legend"><span><i className="tracks-key"/>Unique tracks</span><span><i className="plays-key"/>Total plays</span></div></div>{annual.length ? <svg className="year-chart" viewBox="0 0 720 260" role="img" aria-label="Unique tracks and total plays by year"><line x1="46" y1="216" x2="700" y2="216" className="chart-axis"/>{annual.map((item, index) => { const step = 654 / annual.length, x = 46 + step * index + step / 2, barHeight = 166 * item.tracks / maxTracks, lineY = 204 - 166 * item.plays / maxPlays; return <g key={item.year}><rect x={x - Math.min(24, step * .27)} y={216 - barHeight} width={Math.min(48, step * .54)} height={barHeight} rx="4" className="track-bar"><title>{`${item.year}: ${item.tracks.toLocaleString()} unique tracks`}</title></rect><circle cx={x} cy={lineY} r="4" className="play-point"><title>{`${item.year}: ${item.plays.toLocaleString()} plays`}</title></circle><text x={x} y="239" textAnchor="middle">{item.year}</text></g>})}<polyline className="play-line" points={annual.map((item, index) => { const step = 654 / annual.length, x = 46 + step * index + step / 2, y = 204 - 166 * item.plays / maxPlays; return `${x},${y}` }).join(' ')}/></svg> : <p className="metric-empty">Import at least one supported Audio history file to see annual trends.</p>}</section><section className="metric-card"><div className="metric-heading"><div><h2>Top 50 artists</h2><p>Ranked by complete play count across all imported years.</p></div></div><ol className="artist-list">{topArtists.map((artist, index) => <li key={artist.name}><span>{index + 1}</span><b>{artist.name}</b><em>{artist.plays.toLocaleString()} plays</em></li>)}</ol></section></div>
}

function PlaylistDialog({ uris, period, playlist, playlistError }: { uris: string[]; period: string; playlist?: CreatedPlaylist; playlistError?: string }) {
  const [name, setName] = useState(`My top tracks${period === 'all' ? '' : ` — ${period}`}`), [isPublic, setIsPublic] = useState(false), [clientId, setClientId] = useState(''), [error, setError] = useState<string>(), [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [created, setCreated] = useState<CreatedPlaylist>()
  const receivedPlaylist = useRef(playlist)
  useEffect(() => {
    if (playlistError) { setError(playlistError); setBusy(false) }
    if (playlist && playlist !== receivedPlaylist.current) { setCreated(playlist); setBusy(false); setError(playlistError) }
    receivedPlaylist.current = playlist
  }, [playlist, playlistError])
  useEffect(() => {
    const showFailure = (event: Event) => {
      const failure = (event as CustomEvent<PlaylistFailure>).detail
      if (failure.playlist) setCreated({ ...failure.playlist, name: `${failure.playlist.name} (partially filled)` })
      setError(failure.message)
      setBusy(false)
    }
    window.addEventListener('my-spotify-data-playlist-failure', showFailure)
    return () => window.removeEventListener('my-spotify-data-playlist-failure', showFailure)
  }, [])
  const submit = async () => {
    setError(undefined); setBusy(true)
    try { await connectAndCreate({ name: name.trim(), isPublic, uris }, clientId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Spotify connection failed.'); setBusy(false) }
  }
  return <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) { setCreated(undefined); setError(undefined) } }}><Dialog.Trigger asChild><button className="spotify-button"><ListPlus size={17}/>Create playlist</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog"><Dialog.Title>{created ? 'Playlist created' : 'Create Spotify playlist'}</Dialog.Title>{created ? <><Dialog.Description><b>{created.name}</b> created with {created.tracks.toLocaleString()} tracks.</Dialog.Description><a className="spotify-button dialog-spotify-link" href={created.url} target="_blank" rel="noopener noreferrer">Open in Spotify <ExternalLink size={16}/></a><div className="actions"><Dialog.Close asChild><button className="secondary">Close</button></Dialog.Close></div></> : <><Dialog.Description>Spotify receives your playlist name, visibility setting, and these {uris.length.toLocaleString()} selected track URIs. Your imported history stays on this device.</Dialog.Description><label className="field"><span>Playlist name</span><input value={name} maxLength={100} onChange={(event) => setName(event.target.value)}/></label><label className="field"><span>Spotify Client ID</span><input value={clientId} autoComplete="off" spellCheck={false} placeholder="From your Spotify Developer Dashboard" onChange={(event) => setClientId(event.target.value)}/><small>Register this app's exact URL as a redirect URI in your Spotify app settings. This ID is kept only for the current connection.</small></label><label className="check-field"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)}/><span>Make this playlist public</span></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="actions"><Dialog.Close asChild><button className="ghost">Cancel</button></Dialog.Close><button className="spotify-button" disabled={busy || !name.trim() || !clientId.trim()} onClick={submit}>{busy ? 'Connecting…' : 'Connect Spotify'}</button></div></>}</Dialog.Content></Dialog.Portal></Dialog.Root>
}

function SpotifyStatus({ result, error }: { result?: CreatedPlaylist; error?: string }) {
  return <main className="state-page"><section className="summary-card">{result ? <><span className="success-icon"><Check/></span><p className="eyebrow">PLAYLIST CREATED</p><h1>{result.name}</h1><p>{result.tracks.toLocaleString()} tracks were added in ranking order.</p><a className="spotify-button" href={result.url} target="_blank" rel="noopener noreferrer">Open in Spotify <ExternalLink size={16}/></a></> : error ? <><span className="error-icon"><X/></span><h1>Playlist not created</h1><p>{error}</p><a className="secondary" href={location.pathname}>Return to import</a></> : <><div className="spinner"/><h1>Creating your playlist</h1><p>Finishing the connection with Spotify…</p></>}</section></main>
}

function ResetDialog({ onReset }: { onReset: () => void }) {
  return <Dialog.Root><Dialog.Trigger asChild><button className="ghost"><RotateCcw size={16}/>Start over</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog"><Dialog.Title>Clear this analysis?</Dialog.Title><Dialog.Description>Your in-memory rankings will be permanently cleared. Download any CSVs you want to keep first.</Dialog.Description><div className="actions"><Dialog.Close asChild><button className="secondary">Keep results</button></Dialog.Close><button className="danger" onClick={onReset}>Clear and start over</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
}

export function App() {
  const callback = hasSpotifyCallback(), isAuthPopup = callback && Boolean(window.opener)
  const [view, setView] = useState<View>(isAuthPopup ? 'spotify' : previewResult ? 'results' : 'landing'), [stage, setStage] = useState('Reading files'), [error, setError] = useState<string>(), [result, setResult] = useState<Analysis | undefined>(previewResult), [spotifyResult, setSpotifyResult] = useState<CreatedPlaylist>()
  const worker = useRef<Worker>(), request = useRef(0), metricRequest = useRef(0), pendingMetrics = useRef(new Map<number, { resolve: (metrics: ComputedMetrics) => void; reject: (reason: Error) => void }>())
  const rejectPendingMetrics = (message: string) => {
    for (const pending of pendingMetrics.current.values()) pending.reject(new Error(message))
    pendingMetrics.current.clear()
  }
  const reset = useCallback(() => { rejectPendingMetrics('Your imported history was cleared.'); worker.current?.terminate(); worker.current = undefined; request.current++; setResult(undefined); setError(undefined); setView('landing') }, [])
  useEffect(() => {
    if (isAuthPopup) {
      window.opener?.postMessage({ type: 'my-spotify-data-oauth', search: location.search }, location.origin)
      window.close()
      return () => worker.current?.terminate()
    }
    const receive = (event: MessageEvent<{ type?: string; search?: string }>) => {
      if (event.origin !== location.origin || event.data?.type !== 'my-spotify-data-oauth' || !event.data.search) return
      finishSpotifyCallback(event.data.search).then(setSpotifyResult).catch((reason) => setError(reason instanceof Error ? reason.message : 'Spotify connection failed.'))
    }
    let disposed = false
    let removeNativeCallback = () => {}
    void listenForSpotifyNativeCallback((search) => {
      finishSpotifyCallback(search).then(setSpotifyResult).catch((reason) => setError(reason instanceof Error ? reason.message : 'Spotify connection failed.'))
    }).then((remove) => {
      if (disposed) remove()
      else removeNativeCallback = remove
    })
    window.addEventListener('message', receive)
    return () => { disposed = true; window.removeEventListener('message', receive); removeNativeCallback(); worker.current?.terminate() }
  }, [isAuthPopup])
  const onFiles = useCallback((files: File[]) => {
    setError(undefined)
    const zip = files.filter((f) => f.name.toLowerCase().endsWith('.zip')), json = files.filter((f) => f.name.toLowerCase().endsWith('.json'))
    if (!files.length) return
    if ((zip.length && (json.length || files.length > 1)) || (!zip.length && json.length !== files.length)) { setError('Choose either one ZIP or one or more JSON files—not a mixture.'); return }
    if (zip[0]?.size > ZIP_MAX) { setError('That ZIP is larger than the 200 MB safety limit.'); return }
    const total = files.reduce((n, f) => n + f.size, 0)
    if ((zip.length && total > ZIP_WARN) || (!zip.length && total > JSON_WARN)) if (!confirm('This is a large import and may take longer or exceed your browser’s memory. Continue?')) return
    if (!globalThis.Worker || !crypto?.subtle) { setError('This browser is missing required local file-processing capabilities. Try a current Chrome, Edge, Firefox, or Safari release.'); return }
    setView('processing'); setStage('Reading files'); const id = ++request.current
    const next = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker.current = next
    next.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'metrics-result') {
        const pending = pendingMetrics.current.get(data.id)
        if (pending) { pendingMetrics.current.delete(data.id); pending.resolve(data.metrics) }
        return
      }
      if (data.type === 'error' && pendingMetrics.current.has(data.id)) {
        const pending = pendingMetrics.current.get(data.id)!
        pendingMetrics.current.delete(data.id); pending.reject(new Error(data.message))
        return
      }
      if (data.id !== request.current) return
      if (data.type === 'stage') setStage(data.stage)
      else if (data.type === 'error') { next.terminate(); worker.current = undefined; setError(data.message); setView('error') }
      else { setResult(data.result); setView(!data.result.validRecords || data.result.hasIssues ? 'summary' : 'results') }
    }
    next.onerror = () => { rejectPendingMetrics('Metric calculations stopped unexpectedly.'); next.terminate(); worker.current = undefined; setError('Processing stopped unexpectedly. Try smaller JSON batches in a new analysis.'); setView('error') }
    next.postMessage({ type: 'analyze', id, files })
  }, [])
  const requestMetrics = useCallback((period: string, timeZone: string) => new Promise<ComputedMetrics>((resolve, reject) => {
    const activeWorker = worker.current
    if (activeWorker) {
      const id = ++metricRequest.current
      pendingMetrics.current.set(id, { resolve, reject })
      activeWorker.postMessage({ type: 'metrics', id, period, timeZone })
      return
    }
    if (import.meta.env.DEV && result) {
      const timestamps = period === 'all' ? result.metrics.timestampedPlayTimes : result.metrics.timestampedPlayTimesByYear[period] ?? []
      resolve(calculateTimestampMetrics(timestamps, period, timeZone))
      return
    }
    reject(new Error('Your imported history is no longer available.'))
  }), [result])
  return <div className={`app app-${view}`}><Header/>{view === 'landing' && <Landing onFiles={onFiles} error={error}/>} {view === 'processing' && <Processing stage={stage} cancel={reset}/>} {view === 'summary' && <Summary result={result} proceed={() => setView('results')} reset={reset}/>} {view === 'error' && <Summary fatal={error} proceed={() => {}} reset={reset}/>} {view === 'results' && result && <Results result={result} reset={reset} requestMetrics={requestMetrics} playlist={spotifyResult} playlistError={error}/>} {view === 'spotify' && <SpotifyStatus result={spotifyResult} error={error}/>} <footer className="site-footer"><p>My Spotify Data is an independent project. It is not affiliated with or endorsed by Spotify.</p><a className="kofi-link" href="https://ko-fi.com/G8M824WD19" target="_blank" rel="noopener noreferrer"><img src="https://storage.ko-fi.com/cdn/kofi1.png?v=6" height="36" alt="Buy Me a Coffee at ko-fi.com"/></a></footer></div>
}
