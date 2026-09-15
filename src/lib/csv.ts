import type { Track } from '../types'

const safe = (value: string) => /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
export function makeCsv(rows: Track[]) {
  return '\uFEFF' + ['track_name,artist_name,plays,spotify_uri', ...rows.map((r) => [safe(r.trackName), safe(r.artistName), r.plays, safe(r.uri)].map(quote).join(','))].join('\r\n')
}
export function downloadCsv(rows: Track[], tab: string) {
  const url = URL.createObjectURL(new Blob([makeCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `my-spotify-data-${tab === 'all' ? 'all-years' : tab}.csv`; link.click(); URL.revokeObjectURL(url)
}
