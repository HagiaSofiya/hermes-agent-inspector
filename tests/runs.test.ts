import { describe, expect, it } from 'vitest'

import { createRunPayload } from '../src/api/runs'
import { applyRunBatch, createTraceRunCollector } from '../src/trace/runs'
import type { NormalizedBatchItem } from '../src/trace/types'

function event(overrides: Partial<NormalizedBatchItem['event']>): NormalizedBatchItem['event'] {
  return {
    id: 'event',
    timestamp: 1000,
    category: 'system',
    eventType: 'system.event',
    sessionId: 'session-1',
    title: 'Event',
    summary: 'Event',
    status: 'success',
    rawPayload: {},
    ...overrides
  }
}

describe('TraceRunCollector', () => {
  it('starts at message.start and emits one completed normalized run', () => {
    const collector = createTraceRunCollector()

    expect(applyRunBatch(collector, [{ event: event({ id: 'turn-1', eventType: 'message.start', category: 'model', status: 'pending' }) }], 'model-a')).toBeNull()

    const completed = applyRunBatch(
      collector,
      [
        { event: event({ id: 'tool-1', eventType: 'tool.start', category: 'tool', status: 'pending', toolName: 'read_file' }) },
        { event: event({ id: 'tool-1', eventType: 'tool.complete', category: 'tool', status: 'success', toolName: 'read_file', durationMs: 120 }), replaceId: 'tool-1' },
        { event: event({ id: 'turn-1', eventType: 'message.complete', category: 'model', status: 'success' }), replaceId: 'turn-1' },
        { event: event({ id: 'response-1', eventType: 'message.complete', category: 'response', status: 'success' }) }
      ],
      'model-a'
    )

    expect(completed?.status).toBe('success')
    expect(completed?.events).toHaveLength(3)
    expect(completed?.model).toBe('model-a')
    expect(applyRunBatch(collector, [{ event: event({ eventType: 'message.complete', category: 'response' }) }], 'model-a')).toBeNull()
  })

  it('replaces progress with complete instead of persisting duplicate tool events', () => {
    const collector = createTraceRunCollector()
    applyRunBatch(collector, [{ event: event({ id: 'turn-1', eventType: 'message.start', category: 'model', status: 'pending' }) }], null)

    const completed = applyRunBatch(
      collector,
      [
        { event: event({ id: 'tool-1', eventType: 'tool.start', category: 'tool', status: 'pending', toolName: 'write_file' }) },
        { event: event({ id: 'tool-1', eventType: 'tool.progress', category: 'tool', status: 'pending', toolName: 'write_file' }), replaceId: 'tool-1' },
        { event: event({ id: 'tool-1', eventType: 'tool.complete', category: 'tool', status: 'success', toolName: 'write_file', durationMs: 220 }), replaceId: 'tool-1' },
        { event: event({ id: 'turn-1', eventType: 'message.complete', category: 'model', status: 'success' }), replaceId: 'turn-1' }
      ],
      null
    )

    expect(completed?.events.filter(item => item.toolName)).toHaveLength(1)
    expect(completed?.events.find(item => item.toolName)?.eventType).toBe('tool.complete')
  })

  it('keeps concurrent session runs isolated until each terminal event arrives', () => {
    const collector = createTraceRunCollector()
    const sessionAStart = event({ id: 'turn-a', sessionId: 'session-a', timestamp: 1000, eventType: 'message.start', category: 'model', status: 'pending' })
    const sessionBStart = event({ id: 'turn-b', sessionId: 'session-b', timestamp: 1100, eventType: 'message.start', category: 'model', status: 'pending' })

    applyRunBatch(collector, [{ event: sessionAStart }], 'model-a')
    applyRunBatch(collector, [{ event: sessionBStart }], 'model-b')

    const completedB = applyRunBatch(
      collector,
      [{ event: event({ id: 'turn-b', sessionId: 'session-b', timestamp: 1200, eventType: 'message.complete', category: 'model', status: 'success' }), replaceId: 'turn-b' }],
      'model-b'
    )
    const completedA = applyRunBatch(
      collector,
      [{ event: event({ id: 'turn-a', sessionId: 'session-a', timestamp: 1300, eventType: 'message.complete', category: 'model', status: 'success' }), replaceId: 'turn-a' }],
      'model-a'
    )

    expect(completedB?.sessionId).toBe('session-b')
    expect(completedA?.sessionId).toBe('session-a')
    expect(collector.activeRuns.size).toBe(0)
  })

  it('adopts an unresolved startup run when a later event identifies its session', () => {
    const collector = createTraceRunCollector()

    applyRunBatch(collector, [{ event: event({ id: 'turn-unknown', sessionId: null, timestamp: 1000, eventType: 'message.start', category: 'model', status: 'pending' }) }], 'model-a')
    const completed = applyRunBatch(
      collector,
      [{ event: event({ id: 'turn-unknown', sessionId: 'session-a', timestamp: 1300, eventType: 'message.complete', category: 'model', status: 'success' }), replaceId: 'turn-unknown' }],
      'model-a'
    )

    expect(completed?.sessionId).toBe('session-a')
    expect(completed?.runId).toBe('run:session-a:1000')
    expect(collector.activeRuns.size).toBe(0)
  })

  it('makes trace values JSON-safe before crossing the Python boundary', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const run = {
      runId: 'run:session-1:1000',
      sessionId: 'session-1',
      startedAt: 1000,
      completedAt: 1100,
      model: null,
      status: 'success' as const,
      events: [event({ eventType: 'message.complete', category: 'response', output: circular, rawPayload: { circular } })]
    }

    const payload = createRunPayload(run)

    expect(payload.events[0]?.output).toEqual({ self: '[Circular value]' })
    expect(payload.events[0]?.rawPayload).toEqual({ circular: { self: '[Circular value]' } })
  })
})
