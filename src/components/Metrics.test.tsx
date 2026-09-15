import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Metrics, MetricsLoading } from './Metrics'
import type { Analysis, ComputedMetrics } from '../types'

const heatmap = (hour: number) => Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, currentHour) => day === 0 && currentHour === hour ? 1 : 0))
const result: Analysis = {
  years: ['2024', '2023'], validRecords: 2, ignoredRecords: 0, hasIssues: false, reports: [],
  rankings: { all: [], '2024': [], '2023': [] },
  metrics: { monthlyListeningMs: {}, monthlyPlayCounts: {}, monthlyUniqueTracks: {}, weekdayHourPlays: heatmap(15), weekdayHourPlaysByYear: {}, timestampedPlayTimes: [], timestampedPlayTimesByYear: {}, timestampedPlays: 2, timedPlays: 2, skipProfile: { eligiblePlays: 0, skippedPlays: 0, quickSkips: 0 }, skipProfileByYear: {} },
}
const summary = (period: string, hour: number, timeZone: string): ComputedMetrics => ({ period, timeZone, heatmap: heatmap(hour), longestStreak: 1, longestSessionDurationMs: 0, hasTimestampData: true })

afterEach(cleanup)

describe('Metrics', () => {
  it('uses a plain ellipsis in the loading message', () => {
    render(<MetricsLoading/>)

    expect(screen.getByText('Analysing patterns in your local history...')).toBeInTheDocument()
    expect(screen.queryByText(/\u00e2\u20ac\u00a6/)).not.toBeInTheDocument()
  })

  it('shows binge-session minutes without a trailing m', async () => {
    const requestMetrics = vi.fn((period: string, timeZone: string) => Promise.resolve({
      ...summary(period, 15, timeZone),
      longestSessionDurationMs: (7 * 60 + 2) * 60_000,
    }))
    render(<Metrics result={result} requestMetrics={requestMetrics}/>)

    await screen.findByText('7h02')
    expect(screen.queryByText('7h02m')).not.toBeInTheDocument()
  })

  it('reveals a total-play tooltip when a chart bar is tapped', async () => {
    const requestMetrics = vi.fn((period: string, timeZone: string) => Promise.resolve(summary(period, 15, timeZone)))
    render(<Metrics result={result} requestMetrics={requestMetrics}/>)

    await screen.findByText('Afternoon listener')
    fireEvent.click(screen.getByRole('button', { name: '2024: 0 total plays' }))
    expect(screen.getByText('0 total plays')).toBeInTheDocument()
  })

  it('reveals a total-play tooltip while a chart bar is hovered', async () => {
    const requestMetrics = vi.fn((period: string, timeZone: string) => Promise.resolve(summary(period, 15, timeZone)))
    render(<Metrics result={result} requestMetrics={requestMetrics}/>)

    await screen.findByText('Afternoon listener')
    const bar = screen.getByRole('button', { name: '2024: 0 total plays' })
    fireEvent.pointerEnter(bar, { pointerType: 'mouse' })
    expect(screen.getByText('0 total plays')).toBeInTheDocument()
    fireEvent.pointerLeave(bar, { pointerType: 'mouse' })
    expect(screen.queryByText('0 total plays')).not.toBeInTheDocument()
  })

  it('does not render a previous period’s personality while its replacement is loading', async () => {
    let resolveYear: ((metrics: ComputedMetrics) => void) | undefined
    const requestMetrics = vi.fn((period: string, timeZone: string) => period === 'all'
      ? Promise.resolve(summary('all', 15, timeZone))
      : new Promise<ComputedMetrics>((resolve) => { resolveYear = resolve }))
    render(<Metrics result={result} requestMetrics={requestMetrics}/>)

    await screen.findByText('Afternoon listener')
    fireEvent.click(screen.getByRole('tab', { name: '2023' }))
    expect(screen.getByText('Preparing your listening insights')).toBeInTheDocument()

    resolveYear!(summary('2023', 23, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))
    await waitFor(() => expect(screen.getByText('Night owl')).toBeInTheDocument())
    expect(screen.queryByText('Afternoon listener')).not.toBeInTheDocument()
  })
})

