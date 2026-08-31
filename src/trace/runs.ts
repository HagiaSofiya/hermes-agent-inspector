import type { NormalizedBatchItem, TraceEvent } from './types'

export interface CompletedTraceRun {
  runId: string
  sessionId: string | null
  startedAt: number
  completedAt: number
  model: string | null
  status: 'success' | 'error'
  events: TraceEvent[]
}

export interface TraceRunCollector {
  activeRuns: Map<string, ActiveTraceRun>
  completedRunIds: Set<string>
}

interface ActiveTraceRun {
  runId: string
  sessionId: string | null
  startedAt: number
  model: string | null
  events: TraceEvent[]
}

function sessionKey(sessionId: string | null): string {
  return sessionId || 'unknown'
}

function activeRunForEvent(collector: TraceRunCollector, event: TraceEvent): ActiveTraceRun | undefined {
  if (event.sessionId !== null) {
    const exactRun = collector.activeRuns.get(sessionKey(event.sessionId))

    if (exactRun) {
      return exactRun
    }

    // A startup race can produce message.start before Hermes has attached a
    // session ID. If a later event identifies that session, adopt the one
    // unresolved run rather than leaving it stranded under "unknown".
    const unresolvedRun = collector.activeRuns.get('unknown')

    if (unresolvedRun) {
      collector.activeRuns.delete('unknown')
      unresolvedRun.sessionId = event.sessionId
      unresolvedRun.runId = runIdFor(event.sessionId, unresolvedRun.startedAt)
      collector.activeRuns.set(sessionKey(event.sessionId), unresolvedRun)
      return unresolvedRun
    }

    return undefined
  }

  if (collector.activeRuns.size === 1) {
    return collector.activeRuns.values().next().value
  }

  return collector.activeRuns.get('unknown')
}

function runIdFor(sessionId: string | null, startedAt: number): string {
  return 'run:' + (sessionId || 'unknown') + ':' + startedAt
}

function applyEvent(events: TraceEvent[], item: NormalizedBatchItem): TraceEvent[] {
  const replacementIndex = item.replaceId ? events.findIndex(event => event.id === item.replaceId) : -1

  if (replacementIndex >= 0) {
    return events.map((event, index) => (index === replacementIndex ? item.event : event))
  }

  const existingIndex = events.findIndex(event => event.id === item.event.id)

  if (existingIndex >= 0) {
    return events.map((event, index) => (index === existingIndex ? item.event : event))
  }

  return [...events, item.event]
}

function isRunStart(event: TraceEvent): boolean {
  return event.eventType === 'message.start'
}

function isRunTerminal(event: TraceEvent): boolean {
  return event.eventType === 'message.complete' || event.eventType === 'error'
}

function terminalStatus(events: TraceEvent[]): 'success' | 'error' {
  return events.some(event => event.eventType === 'error' || event.status === 'error') ? 'error' : 'success'
}

export function createTraceRunCollector(): TraceRunCollector {
  return { activeRuns: new Map(), completedRunIds: new Set() }
}

export function applyRunBatch(
  collector: TraceRunCollector,
  batch: NormalizedBatchItem[],
  model: string | null
): CompletedTraceRun | null {
  for (const item of batch) {
    const event = item.event

    if (isRunStart(event)) {
      const runId = runIdFor(event.sessionId, event.timestamp)

      if (!collector.completedRunIds.has(runId)) {
        collector.activeRuns.set(sessionKey(event.sessionId), {
          runId,
          sessionId: event.sessionId,
          startedAt: event.timestamp,
          model,
          events: [event]
        })
      }

      continue
    }

    const activeRun = activeRunForEvent(collector, event)

    if (!activeRun) {
      continue
    }

    activeRun.model = model || activeRun.model
    activeRun.events = applyEvent(activeRun.events, item)
  }

  const terminal = [...batch].reverse().find(item => isRunTerminal(item.event))?.event
  const activeRun = terminal ? activeRunForEvent(collector, terminal) : undefined

  if (!terminal || !activeRun) {
    return null
  }

  const run = activeRun
  const completed: CompletedTraceRun = {
    runId: run.runId,
    sessionId: run.sessionId,
    startedAt: run.startedAt,
    completedAt: terminal.timestamp,
    model: run.model,
    status: terminalStatus(run.events),
    events: run.events
  }

  collector.completedRunIds.add(run.runId)
  collector.activeRuns.delete(sessionKey(run.sessionId))
  return completed
}
