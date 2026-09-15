import type { PluginRestOptions } from '@hermes/plugin-sdk'

import { deriveTraceMetrics } from '../trace/metrics'
import type { CompletedTraceRun } from '../trace/runs'
import type { TraceEvent } from '../trace/types'
import type { UsageSnapshot } from '../trace/usage'
import { toJsonSafe } from '../utils/serialization'

export type RunStatus = 'success' | 'error'

export interface RunSummary {
  runId: string
  sessionId: string | null
  startedAt: number
  completedAt: number
  model: string | null
  status: RunStatus
  runtimeMs: number | null
  toolCallCount: number
  failedToolCount: number
  // Token accounting. Null on runs recorded before these were captured, and on
  // runs too short to have produced a usage tick.
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  sessionTotalTokens?: number | null
  apiCalls?: number | null
  contextPercent?: number | null
  costUsd?: number | null
}

export interface PersistedRun extends RunSummary {
  events: TraceEvent[]
}

export interface CreateRunPayload extends PersistedRun {}

export type PluginRest = <T = unknown>(path: string, options?: PluginRestOptions) => Promise<T>

function jsonSafeEvent(event: TraceEvent): TraceEvent {
  return {
    ...event,
    input: event.input === undefined ? undefined : toJsonSafe(event.input),
    output: event.output === undefined ? undefined : toJsonSafe(event.output),
    rawPayload: toJsonSafe(event.rawPayload)
  }
}

export function createRunPayload(run: CompletedTraceRun, costUsd: number | null = null): CreateRunPayload {
  const metrics = deriveTraceMetrics(run.events, run.usage)

  return {
    runId: run.runId,
    sessionId: run.sessionId,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    model: run.model,
    status: run.status,
    runtimeMs: metrics.totalExecutionDurationMs,
    toolCallCount: metrics.totalToolCalls,
    failedToolCount: metrics.failedToolCalls,
    promptTokens: run.usage?.promptTokens ?? null,
    completionTokens: run.usage?.completionTokens ?? null,
    totalTokens: run.usage?.totalTokens ?? null,
    sessionTotalTokens: run.sessionUsage?.totalTokens ?? null,
    apiCalls: run.usage?.calls ?? null,
    contextPercent: run.sessionUsage?.contextPercent ?? null,
    costUsd,
    events: run.events.map(jsonSafeEvent)
  }
}

/**
 * Rebuild a run's token figures from its stored summary.
 *
 * History cannot re-derive these from the run's events: the counters are
 * session-cumulative and the baseline they must be differenced against
 * predates the run, so it was never part of the run's own event list.
 */
export function usageFromSummary(summary: RunSummary | null | undefined): UsageSnapshot | null {
  if (!summary || summary.totalTokens === null || summary.totalTokens === undefined) {
    return null
  }

  return {
    model: summary.model,
    promptTokens: summary.promptTokens ?? 0,
    completionTokens: summary.completionTokens ?? 0,
    totalTokens: summary.totalTokens,
    reasoningTokens: null,
    calls: summary.apiCalls ?? 0,
    contextUsed: null,
    contextMax: null,
    contextPercent: summary.contextPercent ?? null
  }
}

export function loadRuns(rest: PluginRest): Promise<RunSummary[]> {
  return rest<RunSummary[]>('/runs')
}

export function loadRun(rest: PluginRest, runId: string): Promise<PersistedRun> {
  return rest<PersistedRun>('/runs/' + encodeURIComponent(runId))
}

export function persistRun(rest: PluginRest, payload: CreateRunPayload): Promise<PersistedRun> {
  return rest<PersistedRun>('/runs', { method: 'POST', body: payload })
}
