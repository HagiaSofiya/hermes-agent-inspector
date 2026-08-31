import { host } from '@hermes/plugin-sdk'

import { createTraceNormalizer } from './normalizer'
import { applyRunBatch, createTraceRunCollector, type CompletedTraceRun } from './runs'
import type { NormalizedBatchItem, TraceEvent } from './types'

export const MAX_TRACE_EVENTS = 250

export type TraceStoreListener = (events: TraceEvent[], error: string) => void

interface TraceStore {
  events: TraceEvent[]
  error: string
  started: boolean
  stopListening: (() => void) | null
  listeners: Set<TraceStoreListener>
  normalizer: ReturnType<typeof createTraceNormalizer>
  runCollector: ReturnType<typeof createTraceRunCollector>
}

export const traceStore: TraceStore = {
  events: [],
  error: '',
  started: false,
  stopListening: null,
  listeners: new Set(),
  normalizer: createTraceNormalizer(),
  runCollector: createTraceRunCollector()
}

export function applyBatch(previous: TraceEvent[], batch: NormalizedBatchItem[]): TraceEvent[] {
  let next = previous

  for (const item of batch) {
    const replacementIndex = item.replaceId ? next.findIndex(event => event.id === item.replaceId) : -1

    if (replacementIndex >= 0) {
      next = next.map((event, index) => (index === replacementIndex ? item.event : event))
    } else {
      next = [...next, item.event]
    }
  }

  return next.slice(-MAX_TRACE_EVENTS)
}

function readAtom<T>(atom: { get(): T } | undefined): T | null {
  return atom && typeof atom.get === 'function' ? atom.get() : null
}

function currentRuntimeSessionId(): string | null {
  return readAtom(host.state.focusedSessionId) || readAtom(host.state.activeSessionId)
}

function publishTraceStore(): void {
  for (const listener of traceStore.listeners) {
    listener(traceStore.events, traceStore.error)
  }
}

export function startTraceCollection(
  onDispose: (disposer: () => void) => void,
  onRunCompleted?: (run: CompletedTraceRun) => void | Promise<void>
): void {
  if (traceStore.started) {
    return
  }

  traceStore.started = true

  try {
    traceStore.stopListening = host.onEvent('*', gatewayEvent => {
      try {
        const batch = traceStore.normalizer.normalize(gatewayEvent, currentRuntimeSessionId())
        traceStore.events = applyBatch(traceStore.events, batch)
        const completedRun = applyRunBatch(traceStore.runCollector, batch, readAtom(host.state.model))
        publishTraceStore()

        if (completedRun && onRunCompleted) {
          Promise.resolve(onRunCompleted(completedRun)).catch(error => {
            console.warn('Agent Inspector could not persist completed run', error)
          })
        }
      } catch (error) {
        traceStore.error = error instanceof Error ? error.message : 'Unable to normalize gateway event'
        publishTraceStore()
      }
    })

    onDispose(() => {
      traceStore.stopListening?.()
      traceStore.stopListening = null
      traceStore.started = false
      traceStore.runCollector = createTraceRunCollector()
      traceStore.listeners.clear()
    })
  } catch (error) {
    traceStore.error = error instanceof Error ? error.message : 'Unable to subscribe to gateway events'
    publishTraceStore()
  }
}

export function subscribeTraceStore(listener: TraceStoreListener): () => void {
  traceStore.listeners.add(listener)
  listener(traceStore.events, traceStore.error)

  return () => {
    traceStore.listeners.delete(listener)
  }
}
