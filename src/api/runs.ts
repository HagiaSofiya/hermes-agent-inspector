import type { PluginRestOptions } from '@hermes/plugin-sdk'

import { deriveTraceMetrics } from '../trace/metrics'
import type { CompletedTraceRun } from '../trace/runs'
import type { TraceEvent } from '../trace/types'
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

export function createRunPayload(run: CompletedTraceRun): CreateRunPayload {
  const metrics = deriveTraceMetrics(run.events)

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
    events: run.events.map(jsonSafeEvent)
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
