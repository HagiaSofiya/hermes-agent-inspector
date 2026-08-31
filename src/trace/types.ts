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

export interface TraceMetrics {
  totalExecutionDurationMs: number | null
  totalToolCalls: number
  successfulToolCalls: number
  failedToolCalls: number
  averageToolDurationMs: number | null
  slowestTool: { toolName: string; durationMs: number } | null
  modelGenerationDurationMs: number | null
  isActive: boolean
}
