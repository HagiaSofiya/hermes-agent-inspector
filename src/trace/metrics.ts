import type { TraceEvent, TraceMetrics } from './types'

import { numberValue } from '../utils/serialization'

const TOOL_EXECUTION_EVENT_TYPES = new Set(['tool.start', 'tool.progress', 'tool.complete'])

function isToolExecutionEvent(event: TraceEvent): boolean {
  return TOOL_EXECUTION_EVENT_TYPES.has(event.eventType) && Boolean(event.toolName)
}

function isMeaningfulExecutionStart(event: TraceEvent): boolean {
  return (
    event.eventType === 'message.start' ||
    event.eventType === 'tool.start' ||
    event.eventType === 'tool.progress' ||
    (event.category === 'model' && event.eventType !== 'message.complete')
  )
}

function isTerminalExecutionEvent(event: TraceEvent): boolean {
  return event.eventType === 'message.complete' || event.eventType === 'error'
}

export function deriveTraceMetrics(events: readonly TraceEvent[]): TraceMetrics {
  const finalEvents = new Map<string, TraceEvent>()

  for (const [index, event] of events.entries()) {
    if (event) {
      finalEvents.set(event.id || 'event-' + index, event)
    }
  }

  const trace = [...finalEvents.values()]
  const toolEvents = trace.filter(isToolExecutionEvent)
  const completedTools = toolEvents.filter(event => event.eventType === 'tool.complete' && event.status !== 'pending')
  const completedToolDurations = completedTools
    .map(event => ({ event, durationMs: numberValue(event.durationMs) }))
    .filter((item): item is { event: TraceEvent; durationMs: number } => item.durationMs !== undefined)
  const durationTotal = completedToolDurations.reduce((total, item) => total + item.durationMs, 0)
  const slowestTool = completedToolDurations.reduce<{ toolName: string; durationMs: number } | null>((current, item) => {
    if (!current || item.durationMs > current.durationMs) {
      return { toolName: item.event.toolName || 'tool', durationMs: item.durationMs }
    }

    return current
  }, null)
  const modelCompletions = trace
    .map((event, index) => ({ event, index, durationMs: numberValue(event.durationMs), timestamp: numberValue(event.timestamp) }))
    .filter(
      (item): item is { event: TraceEvent; index: number; durationMs: number; timestamp: number | undefined } =>
        item.event.category === 'model' &&
        item.event.eventType === 'message.complete' &&
        item.durationMs !== undefined
    )
  const latestModelCompletion = modelCompletions.reduce<(typeof modelCompletions)[number] | null>((current, item) => {
    if (!current || (item.timestamp ?? item.index) >= (current.timestamp ?? current.index)) {
      return item
    }

    return current
  }, null)
  const executionStarts = trace
    .filter(isMeaningfulExecutionStart)
    .map(event => numberValue(event.timestamp))
    .filter((timestamp): timestamp is number => timestamp !== undefined)
  const terminalEvents = trace
    .filter(isTerminalExecutionEvent)
    .map(event => numberValue(event.timestamp))
    .filter((timestamp): timestamp is number => timestamp !== undefined)
  const earliestStart = executionStarts.length ? Math.min(...executionStarts) : undefined
  const latestTerminal = terminalEvents.length ? Math.max(...terminalEvents) : undefined
  const pendingExecution = trace.find(
    event =>
      event.status === 'pending' &&
      (event.category === 'model' || event.category === 'tool' || isToolExecutionEvent(event))
  )
  const pendingTimestamp = pendingExecution ? numberValue(pendingExecution.timestamp) : undefined
  const isActive =
    Boolean(pendingExecution) &&
    (latestTerminal === undefined || pendingTimestamp === undefined || pendingTimestamp > latestTerminal)
  let totalExecutionDurationMs: number | null = null

  if (earliestStart !== undefined && latestTerminal !== undefined) {
    totalExecutionDurationMs = Math.max(0, latestTerminal - earliestStart)
  } else if (earliestStart !== undefined && isActive) {
    totalExecutionDurationMs = Math.max(0, Date.now() - earliestStart)
  }

  return {
    totalExecutionDurationMs,
    totalToolCalls: toolEvents.length,
    successfulToolCalls: completedTools.filter(event => event.status === 'success').length,
    failedToolCalls: completedTools.filter(event => event.status === 'error').length,
    averageToolDurationMs: completedToolDurations.length ? durationTotal / completedToolDurations.length : null,
    slowestTool,
    modelGenerationDurationMs: latestModelCompletion?.durationMs ?? null,
    isActive
  }
}
