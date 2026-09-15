export type TraceCategory = 'user' | 'model' | 'tool' | 'response' | 'system' | 'error'

export type TraceStatus = 'pending' | 'success' | 'error'

export interface TraceEvent {
  id: string
  timestamp: number
  category: TraceCategory
  eventType: string
  sessionId: string | null
  title: string
  summary: string
  status: TraceStatus
  toolName?: string
  durationMs?: number
  input?: unknown
  output?: unknown
  rawPayload: unknown
}

export interface NormalizedBatchItem {
  event: TraceEvent
  replaceId?: string
}

export interface PendingTool {
  id: string
  sessionId: string | null
  name: string
  startedAt: number
  input: unknown
}

/**
 * Token accounting for a trace. The `run*` fields are this run's own
 * consumption; `session*` is the lifetime total of the session it belongs to.
 * Any field is null when the trace carried no usage tick to derive it from —
 * ticks are interval-emitted, so short runs legitimately report nothing.
 */
export interface TraceUsage {
  model: string | null
  runPromptTokens: number | null
  runCompletionTokens: number | null
  runTotalTokens: number | null
  sessionTotalTokens: number | null
  calls: number | null
  contextUsed: number | null
  contextMax: number | null
  contextPercent: number | null
}

export interface TraceMetrics {
  totalExecutionDurationMs: number | null
  totalToolCalls: number
  successfulToolCalls: number
  failedToolCalls: number
  averageToolDurationMs: number | null
  slowestTool: { toolName: string; durationMs: number } | null
  modelGenerationDurationMs: number | null
  isActive: boolean
  usage: TraceUsage | null
}
