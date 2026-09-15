/// <reference lib="webworker" />
import { analyzeFiles } from './lib/analysis'
import { calculateTimestampMetrics } from './lib/timestampMetrics'
import { extractZip } from './lib/zip'
import type { InputFile, WorkerRequest, WorkerResponse } from './types'

let timestamps: { all: number[]; byYear: Record<string, number[]> } | undefined
const metricsCache = new Map<string, ReturnType<typeof calculateTimestampMetrics>>()
const MAX_METRIC_CACHE_ENTRIES = 12

function cacheMetrics(key: string, metrics: ReturnType<typeof calculateTimestampMetrics>) {
  metricsCache.delete(key)
  metricsCache.set(key, metrics)
  if (metricsCache.size > MAX_METRIC_CACHE_ENTRIES) metricsCache.delete(metricsCache.keys().next().value!)
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const send = (message: WorkerResponse) => self.postMessage(message)
  try {
    if (data.type === 'metrics') {
      if (!timestamps) throw new Error('Your imported history is no longer available. Import it again to view metrics.')
      const key = `${data.period}\u0000${data.timeZone}`
      const metrics = metricsCache.get(key) ?? calculateTimestampMetrics(data.period === 'all' ? timestamps.all : timestamps.byYear[data.period] ?? [], data.period, data.timeZone)
      cacheMetrics(key, metrics)
      send({ id: data.id, type: 'metrics-result', metrics })
      return
    }
    send({ id: data.id, type: 'stage', stage: 'Reading files' })
    let inputs: InputFile[]
    if (data.files.length === 1 && data.files[0].name.toLowerCase().endsWith('.zip')) {
      inputs = extractZip(new Uint8Array(await data.files[0].arrayBuffer()))
    } else {
      inputs = await Promise.all(data.files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
    }
    send({ id: data.id, type: 'stage', stage: 'Validating history' })
    const result = await analyzeFiles(inputs)
    timestamps = { all: result.metrics.timestampedPlayTimes, byYear: result.metrics.timestampedPlayTimesByYear }
    metricsCache.clear()
    send({ id: data.id, type: 'stage', stage: 'Building rankings' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    send({ id: data.id, type: 'stage', stage: 'Preparing results' })
    send({ id: data.id, type: 'result', result: { ...result, metrics: { ...result.metrics, timestampedPlayTimes: [], timestampedPlayTimesByYear: {} } } })
  } catch (error) {
    send({ id: data.id, type: 'error', message: error instanceof Error ? error.message : 'Processing could not be completed.' })
  }
}
