import type { TraceEvent } from './types'

import { isRecord, numberValue } from '../utils/serialization'

/**
 * A single `session.usage` reading.
 *
 * Hermes reports these counters per *session*, not per run: `prompt`,
 * `completion`, `total` and `calls` accumulate across every turn the session
 * has served. Per-run figures therefore come from `usageDelta`, never from a
 * snapshot read on its own.
 *
 * The context fields are the exception — they describe the current window
 * occupancy at the moment of the tick, so they are meaningful as-is.
 */
export interface UsageSnapshot {
  model: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens: number | null
  calls: number
  contextUsed: number | null
  contextMax: number | null
  contextPercent: number | null
}

export function readUsageSnapshot(event: TraceEvent): UsageSnapshot | null {
  if (event.eventType !== 'session.usage' || !isRecord(event.rawPayload)) {
    return null
  }

  const usage = event.rawPayload.usage

  if (!isRecord(usage)) {
    return null
  }

  const prompt = numberValue(usage.prompt)
  const completion = numberValue(usage.completion)
  const total = numberValue(usage.total)

  // Hermes also sends `input`/`output`, but those are provider-reported
  // counters that do not reconcile with `total` (a real tick carried
  // input 19020 alongside prompt 20108 and total 20219 = prompt + completion).
  // Reading the consistent trio keeps the arithmetic self-checking.
  if (prompt === undefined && completion === undefined && total === undefined) {
    return null
  }

  const promptTokens = prompt ?? 0
  const completionTokens = completion ?? 0
  const model = typeof usage.model === 'string' ? usage.model.trim() : ''

  return {
    model: model || null,
    promptTokens,
    completionTokens,
    totalTokens: total ?? promptTokens + completionTokens,
    reasoningTokens: numberValue(usage.reasoning) ?? null,
    calls: numberValue(usage.calls) ?? 0,
    contextUsed: numberValue(usage.context_used) ?? null,
    contextMax: numberValue(usage.context_max) ?? null,
    contextPercent: numberValue(usage.context_percent) ?? null
  }
}

function subtractOptional(latest: number | null, baseline: number | null): number | null {
  if (latest === null) {
    return null
  }

  return baseline === null ? latest : Math.max(0, latest - baseline)
}

/**
 * Convert a cumulative session reading into what a single run consumed.
 *
 * `baseline` is the last reading seen *before* the run started. Without one
 * (the first run observed in a session) the snapshot already describes only
 * that run's work, so it passes through unchanged.
 */
export function usageDelta(latest: UsageSnapshot, baseline: UsageSnapshot | null): UsageSnapshot {
  if (!baseline) {
    return latest
  }

  const promptTokens = latest.promptTokens - baseline.promptTokens
  const completionTokens = latest.completionTokens - baseline.completionTokens
  const totalTokens = latest.totalTokens - baseline.totalTokens
  const calls = latest.calls - baseline.calls

  // A negative component means the counters restarted underneath us — a new
  // gateway process reusing the session id. The baseline no longer describes
  // this session, so report the raw snapshot instead of a negative delta.
  if (promptTokens < 0 || completionTokens < 0 || totalTokens < 0 || calls < 0) {
    return latest
  }

  return {
    ...latest,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: subtractOptional(latest.reasoningTokens, baseline.reasoningTokens),
    calls
  }
}

/** The most recent usage reading in a trace, or null if it carries none. */
export function latestUsageSnapshot(events: readonly TraceEvent[]): UsageSnapshot | null {
  let latest: UsageSnapshot | null = null
  let latestTimestamp = -Infinity

  for (const event of events) {
    const snapshot = readUsageSnapshot(event)

    if (snapshot && event.timestamp >= latestTimestamp) {
      latest = snapshot
      latestTimestamp = event.timestamp
    }
  }

  return latest
}
