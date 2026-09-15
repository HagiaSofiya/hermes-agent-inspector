import type { NormalizedBatchItem, TraceEvent } from './types'
import { readUsageSnapshot, usageDelta, type UsageSnapshot } from './usage'

export interface CompletedTraceRun {
  runId: string
  sessionId: string | null
  startedAt: number
  completedAt: number
  model: string | null
  status: 'success' | 'error'
  events: TraceEvent[]
  /** This run's own token consumption, or null if no usage tick arrived. */
  usage: UsageSnapshot | null
  /** The session's cumulative counters as of this run's last tick. */
  sessionUsage: UsageSnapshot | null
}

/**
 * Token bookkeeping that has to outlive an individual run.
 *
 * `latest` is the newest cumulative reading seen for a session; the next run
 * in that session differences against it. `lastRun` is the delta computed for
 * the most recently completed run, so the live view keeps showing a figure
 * after a run ends instead of blanking.
 */
interface SessionUsageState {
  latest: UsageSnapshot | null
  lastRun: UsageSnapshot | null
}

export interface TraceRunCollector {
  activeRuns: Map<string, ActiveTraceRun>
  completedRunIds: Set<string>
  sessionUsage: Map<string, SessionUsageState>
}

interface ActiveTraceRun {
  runId: string
  sessionId: string | null
  startedAt: number
  model: string | null
  events: TraceEvent[]
  baselineUsage: UsageSnapshot | null
  latestUsage: UsageSnapshot | null
}

function sessionKey(sessionId: string | null): string {
  return sessionId || 'unknown'
}

function usageStateFor(collector: TraceRunCollector, key: string): SessionUsageState {
  const existing = collector.sessionUsage.get(key)

  if (existing) {
    return existing
  }

  const created: SessionUsageState = { latest: null, lastRun: null }
  collector.sessionUsage.set(key, created)
  return created
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
      // The baseline was read under "unknown" at run start. Now that the real
      // session is known, adopt its baseline — otherwise this run would be
      // differenced against nothing and report the session's whole lifetime
      // total as its own consumption.
      if (unresolvedRun.latestUsage === null) {
        unresolvedRun.baselineUsage = usageStateFor(collector, sessionKey(event.sessionId)).latest
      }
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
  return { activeRuns: new Map(), completedRunIds: new Set(), sessionUsage: new Map() }
}

/**
 * This run's token consumption so far, or the last completed run's if none is
 * in flight. Returns null when the session has produced no usage tick — ticks
 * are interval-emitted, so a short run genuinely has no figure to report.
 */
export function currentRunUsage(collector: TraceRunCollector, sessionId: string | null): UsageSnapshot | null {
  const key = sessionKey(sessionId)
  const activeRun = collector.activeRuns.get(key)

  if (activeRun) {
    return activeRun.latestUsage ? usageDelta(activeRun.latestUsage, activeRun.baselineUsage) : null
  }

  return collector.sessionUsage.get(key)?.lastRun ?? null
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
          events: [event],
          baselineUsage: usageStateFor(collector, sessionKey(event.sessionId)).latest,
          latestUsage: null
        })
      }

      continue
    }

    const activeRun = activeRunForEvent(collector, event)
    const snapshot = readUsageSnapshot(event)

    if (snapshot) {
      // Recorded whether or not a run is in flight: a tick that lands between
      // runs is still the baseline the next run must be measured against.
      usageStateFor(collector, sessionKey(event.sessionId || activeRun?.sessionId || null)).latest = snapshot
    }

    if (!activeRun) {
      continue
    }

    if (snapshot) {
      activeRun.latestUsage = snapshot
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
  const runUsage = run.latestUsage ? usageDelta(run.latestUsage, run.baselineUsage) : null
  const completed: CompletedTraceRun = {
    runId: run.runId,
    sessionId: run.sessionId,
    startedAt: run.startedAt,
    completedAt: terminal.timestamp,
    model: run.model,
    status: terminalStatus(run.events),
    events: run.events,
    usage: runUsage,
    sessionUsage: run.latestUsage
  }

  collector.completedRunIds.add(run.runId)
  // Note: the session's usage state deliberately survives this delete — its
  // `latest` reading is the baseline for the next run in the same session.
  collector.activeRuns.delete(sessionKey(run.sessionId))
  usageStateFor(collector, sessionKey(run.sessionId)).lastRun = runUsage
  return completed
}
