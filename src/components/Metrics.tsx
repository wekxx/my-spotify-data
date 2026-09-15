import { Clock3, FastForward, Flame, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Analysis, ComputedMetrics, SkipProfile } from '../types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const months = (year: string) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
const labelMonth = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })
const formatHours = (ms: number) => `${(ms / 3_600_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours`
const formatSessionHours = (ms: number) => {
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60
  return minutes ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`
}
const MAX_METRIC_CACHE_ENTRIES = 12
const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const timeZones = (() => {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([detectedTimeZone, 'UTC', ...supported])].sort((a, b) => a.localeCompare(b))
})()

function PeriodChart({ labels, tracks, plays, title }: { labels: string[]; tracks: number[]; plays: number[]; title: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number>()
  const [hoveredIndex, setHoveredIndex] = useState<number>()
  const lastPointerType = useRef<string>()
  const maxValue = Math.max(1, ...plays, ...tracks)
  const points = labels.map((_, index) => { const step = 654 / labels.length, x = 46 + step * index + step / 2, y = 216 - 166 * tracks[index] / maxValue; return `${x},${y}` }).join(' ')
  const selectBar = (index: number) => setSelectedIndex((current) => current === index ? undefined : index)
  return <section className="metric-card metric-period-chart"><div className="metric-heading"><div><h2>{title}</h2><p>Bars show total plays; the line shows unique tracks on the same scale.</p></div><div className="chart-legend"><span><i className="plays-key"/>Total plays</span><span><i className="tracks-key"/>Unique tracks</span></div></div><svg className="year-chart" viewBox="0 0 720 260" role="img" aria-label={`${title}: total plays and unique tracks on a shared scale`}><line x1="46" y1="216" x2="700" y2="216" className="chart-axis"/>{labels.map((label, index) => { const step = 654 / labels.length, x = 46 + step * index + step / 2, barHeight = 166 * plays[index] / maxValue, selected = selectedIndex === index, active = hoveredIndex === index || selected; const tooltipWidth = 136, tooltipX = Math.max(46, Math.min(700 - tooltipWidth, x - tooltipWidth / 2)); return <g key={label} className="chart-bar-group" role="button" tabIndex={0} aria-label={`${label}: ${plays[index].toLocaleString()} total plays`} aria-pressed={selected} onPointerDown={(event) => { lastPointerType.current = event.pointerType }} onPointerEnter={(event) => { if (event.pointerType !== 'touch' && event.pointerType !== 'pen') setHoveredIndex(index) }} onPointerLeave={(event) => { if (event.pointerType !== 'touch' && event.pointerType !== 'pen') setHoveredIndex(undefined) }} onClick={() => { if (lastPointerType.current !== 'mouse' && lastPointerType.current !== 'keyboard') selectBar(index) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); lastPointerType.current = 'keyboard'; selectBar(index) } }}><rect x={x - step / 2} y="20" width={step} height="196" className="chart-bar-hit"/><rect x={x - Math.min(24, step * .27)} y={216 - barHeight} width={Math.min(48, step * .54)} height={barHeight} rx="4" className="track-bar"/>{active && <g className="chart-tooltip" pointerEvents="none"><rect x={tooltipX} y="28" width={tooltipWidth} height="30" rx="6"/><text x={tooltipX + tooltipWidth / 2} y="48" textAnchor="middle">{plays[index].toLocaleString()} total plays</text></g>}<text x={x} y="239" textAnchor="middle">{label}</text></g>})}<polyline className="play-line" points={points}/></svg><p className="sr-only" aria-live="polite">{hoveredIndex === undefined && selectedIndex === undefined ? 'Hover over or tap a bar to show its total plays.' : `${labels[hoveredIndex ?? selectedIndex!]}: ${plays[hoveredIndex ?? selectedIndex!].toLocaleString()} total plays`}</p></section>
}

function ListeningTime({ labels, values, title }: { labels: string[]; values: number[]; title: string }) {
  const max = Math.max(1, ...values)
  return <section className="metric-card metric-listening-time"><div className="metric-heading"><div><h2>{title}</h2><p>Time played from timestamped Audio history records.</p></div></div><ol className="month-chart">{labels.map((label, index) => <li key={label}><span>{label}</span><i><b style={{ width: `${values[index] / max * 100}%` }}/></i><em>{formatHours(values[index])}</em></li>)}</ol></section>
}

function Heatmap({ values, hasData, timeZone, onTimeZoneChange }: { values: number[][]; hasData: boolean; timeZone: string; onTimeZoneChange: (timeZone: string) => void }) {
  const max = Math.max(1, ...values.flat())
  const heatColor = (plays: number) => !plays ? '#06170c' : plays / max < .15 ? '#125229' : plays / max < .35 ? '#18783a' : plays / max < .6 ? '#1aa34b' : plays / max < .85 ? '#24c85c' : '#6df49b'
  return <section className="metric-card heatmap-card"><div className="metric-heading"><div><h2>When you listen</h2><p>Play count by local weekday and hour.</p></div><label className="heatmap-timezone">Time zone<select value={timeZone} onChange={(event) => onTimeZoneChange(event.target.value)} aria-label="Heatmap time zone">{timeZones.map((zone) => <option key={zone} value={zone}>{zone === detectedTimeZone ? `Your time zone (${zone})` : zone}</option>)}</select></label></div>{hasData ? <div className="heatmap" role="img" aria-label={`Listening play counts by weekday and hour in ${timeZone}`}><div className="heatmap-hours"><span aria-hidden="true" />{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{String(hour).padStart(2, '0')}</span>)}</div>{values.map((day, dayIndex) => <div className="heatmap-row" key={DAYS[dayIndex]}><b>{DAYS[dayIndex]}</b>{day.map((plays, hour) => <i key={hour} style={{ backgroundColor: heatColor(plays) }}><span className="sr-only">{`${DAYS[dayIndex]} hour ${String(hour).padStart(2, '0')}: ${plays} plays`}</span></i>)}</div>)}</div> : <p className="metric-empty">No timestamped listening data was found for this period.</p>}</section>
}

function EmptyInsight({ title, icon: Icon }: { title: string; icon: typeof Clock3 }) {
  return <section className="metric-card metric-insight"><div className="insight-title"><Icon aria-hidden="true"/><h2>{title}</h2></div><p className="metric-empty insight-empty">No compatible listening data was found for this period.</p></section>
}

function SkipProfileCard({ profile }: { profile: SkipProfile }) {
  if (!profile.eligiblePlays) return <EmptyInsight title="Skip profile" icon={FastForward}/>
  const rate = profile.skippedPlays / profile.eligiblePlays * 100
  return <section className="metric-card metric-insight metric-skip-profile"><div className="insight-title"><FastForward aria-hidden="true"/><h2>Skip profile</h2></div><p className="insight-copy">How often a track gets cut short.</p><strong className="insight-value">{rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</strong><span className="insight-label">skip rate</span></section>
}

function StreakCard({ longestStreak }: { longestStreak?: number }) {
  if (!longestStreak) return <EmptyInsight title="Listening streaks" icon={Flame}/>
  return <section className="metric-card metric-insight"><div className="insight-title"><Flame aria-hidden="true"/><h2>Listening streaks</h2></div><p className="insight-copy">Your longest daily listening run.</p><strong className="insight-value">{longestStreak.toLocaleString()}</strong><span className="insight-label">{longestStreak === 1 ? 'day in a row' : 'days in a row'}</span></section>
}

function BingeSessionsCard({ longestSessionDurationMs }: { longestSessionDurationMs?: number }) {
  if (longestSessionDurationMs === undefined) return <EmptyInsight title="Binge sessions" icon={Clock3}/>
  return <section className="metric-card metric-insight"><div className="insight-title"><Clock3 aria-hidden="true"/><h2>Binge sessions</h2></div><p className="insight-copy">A new session starts after a pause longer than 30 minutes.</p><strong className="insight-value">{formatSessionHours(longestSessionDurationMs)}</strong><span className="insight-label">longest listening span</span></section>
}

function PersonalityCard({ heatmap, hasData }: { heatmap: number[][]; hasData: boolean }) {
  if (!hasData) return <EmptyInsight title="Time-of-day personality" icon={Sparkles}/>
  const periods = [
    { name: 'Night owl', description: 'Your listening comes alive after dark.', hours: [22, 23, 0, 1, 2, 3, 4] },
    { name: 'Morning tune-in', description: 'You like to start the day with music.', hours: [5, 6, 7, 8, 9] },
    { name: 'Daytime dreamer', description: 'Music keeps you company through the middle of the day.', hours: [10, 11, 12, 13] },
    { name: 'Afternoon listener', description: 'Music carries you through the afternoon.', hours: [14, 15, 16, 17] },
    { name: 'Evening selector', description: 'Your listening peaks as the day winds down.', hours: [18, 19, 20, 21] },
  ].map((period) => ({ ...period, plays: heatmap.reduce((total, day) => total + period.hours.reduce((count, hour) => count + day[hour], 0), 0) }))
  const favourite = [...periods].sort((a, b) => b.plays - a.plays)[0]
  const total = heatmap.flat().reduce((sum, plays) => sum + plays, 0)
  return <section className="metric-card metric-insight metric-personality"><div className="insight-title"><Sparkles aria-hidden="true"/><h2>Time-of-day personality</h2></div><p className="insight-copy">{favourite.description}</p><strong className="insight-value insight-value-word">{favourite.name}</strong><span className="insight-label">{(favourite.plays / total * 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}% of timestamped plays</span></section>
}

export function MetricsLoading() {
  return <section className="metrics-loading" role="status"><i className="metrics-spinner" aria-hidden="true"/><div><strong>Preparing your listening insights</strong><span>Analysing patterns in your local history...</span></div></section>
}

export function Metrics({ result, requestMetrics }: { result: Analysis; requestMetrics: (period: string, timeZone: string) => Promise<ComputedMetrics> }) {
  const [tab, setTab] = useState('all')
  const [timeZone, setTimeZone] = useState(detectedTimeZone)
  const [storedComputed, setComputed] = useState<ComputedMetrics>()
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [pendingLabel, setPendingLabel] = useState('your insights')
  const cache = useRef(new Map<string, ComputedMetrics>())
  const allYears = [...result.years].reverse()
  const isAll = tab === 'all'
  const periodMonths = isAll ? Object.keys(result.metrics.monthlyPlayCounts).sort() : months(tab)
  const chartLabels = isAll ? allYears : periodMonths.map(labelMonth)
  const chartTracks = isAll ? allYears.map((year) => result.rankings[year].length) : periodMonths.map((month) => result.metrics.monthlyUniqueTracks[month] ?? 0)
  const chartPlays = isAll ? allYears.map((year) => result.rankings[year].reduce((total, track) => total + track.plays, 0)) : periodMonths.map((month) => result.metrics.monthlyPlayCounts[month] ?? 0)
  const timeLabels = isAll ? allYears : periodMonths.map(labelMonth)
  const timeValues = isAll ? allYears.map((year) => Object.entries(result.metrics.monthlyListeningMs).filter(([month]) => month.startsWith(year)).reduce((total, [, ms]) => total + ms, 0)) : periodMonths.map((month) => result.metrics.monthlyListeningMs[month] ?? 0)
  const artistListHeight = Math.max(110, timeLabels.length * 28 - 10)
  const profile = isAll ? result.metrics.skipProfile : result.metrics.skipProfileByYear[tab] ?? { eligiblePlays: 0, skippedPlays: 0, quickSkips: 0 }
  const periodTracks = useMemo(() => isAll ? result.rankings.all : result.rankings[tab] ?? [], [isAll, result.rankings, tab])
  const topArtists = useMemo(() => { const artists = new Map<string, number>(); for (const track of periodTracks) artists.set(track.artistName, (artists.get(track.artistName) ?? 0) + track.plays); return [...artists.entries()].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name)).slice(0, 50) }, [periodTracks])
  const metricKey = `${tab}\u0000${timeZone}`
  useEffect(() => {
    let current = true
    const cached = cache.current.get(metricKey)
    if (cached) { setComputed(cached); setIsRefreshing(false); return () => { current = false } }
    setIsRefreshing(true)
    requestMetrics(tab, timeZone).then((next) => {
      if (next.period !== tab || next.timeZone !== timeZone) return
      cache.current.delete(metricKey)
      cache.current.set(metricKey, next)
      if (cache.current.size > MAX_METRIC_CACHE_ENTRIES) cache.current.delete(cache.current.keys().next().value!)
      if (current) { setComputed(next); setIsRefreshing(false) }
    }).catch(() => { if (current) setIsRefreshing(false) })
    return () => { current = false }
  }, [metricKey, requestMetrics, tab, timeZone])
  const currentMetrics = storedComputed?.period === tab && storedComputed.timeZone === timeZone ? storedComputed : undefined
  const computed = currentMetrics
  const heatmap = currentMetrics?.heatmap ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  const hasData = currentMetrics?.hasTimestampData ?? false
  const changePeriod = (period: string) => { setPendingLabel(period === 'all' ? 'your insights' : `${period} insights`); setIsRefreshing(true); setTab(period) }
  const changeTimeZone = (next: string) => { setPendingLabel('time zone insights'); setIsRefreshing(true); setTimeZone(next) }

  return <><div className="tabs metrics-tabs" role="tablist" aria-label="Metrics period"><button role="tab" aria-selected={isAll} onClick={() => changePeriod('all')}>All years</button>{result.years.map((year) => <button key={year} role="tab" aria-selected={tab === year} onClick={() => changePeriod(year)}>{year}</button>)}</div>{!computed && isRefreshing ? <MetricsLoading/> : <div className="metrics-content" aria-busy={isRefreshing}><div className="metrics"><PeriodChart labels={chartLabels} tracks={chartTracks} plays={chartPlays} title={isAll ? 'Listening by year' : `Listening by month - ${tab}`}/><SkipProfileCard profile={profile}/><StreakCard longestStreak={computed?.longestStreak}/><BingeSessionsCard longestSessionDurationMs={computed?.longestSessionDurationMs}/><PersonalityCard heatmap={heatmap} hasData={hasData}/><ListeningTime labels={timeLabels} values={timeValues} title={isAll ? 'Listening time by year' : `Listening time by month - ${tab}`}/><section className="metric-card metric-top-artists" style={{ '--artist-list-height': `${artistListHeight}px` } as CSSProperties}><div className="metric-heading"><div><h2>Top 50 artists</h2><p>Ranked by play count for this period.</p></div></div><ol className="artist-list">{topArtists.map((artist, index) => <li key={artist.name}><span>{index + 1}</span><b>{artist.name}</b><em>{artist.plays.toLocaleString()} plays</em></li>)}</ol></section><Heatmap values={heatmap} hasData={hasData} timeZone={timeZone} onTimeZoneChange={changeTimeZone}/></div>{isRefreshing && <div className="metrics-refresh" role="status"><i className="metrics-spinner" aria-hidden="true"/>Updating {pendingLabel}...</div>}</div>}</>
}

