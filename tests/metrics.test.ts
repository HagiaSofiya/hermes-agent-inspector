import { describe, expect, it } from 'vitest'

import { deriveTraceMetrics } from '../src/trace/metrics'
import type { TraceEvent } from '../src/trace/types'

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    id: 'event-' + Math.random(),
    timestamp: 0,
    category: 'system',
    eventType: 'system.event',
    sessionId: 'session-1',
    title: 'Event',
    summary: '',
    status: 'success',
    rawPayload: null,
    ...overrides
  }
}

describe('deriveTraceMetrics', () => {
  it('returns empty values for an empty trace', () => {
    expect(deriveTraceMetrics([])).toEqual({
      totalExecutionDurationMs: null,
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      averageToolDurationMs: null,
      slowestTool: null,
      modelGenerationDurationMs: null,
      isActive: false
    })
  })

  it('calculates runtime and successful tool metrics', () => {
    const metrics = deriveTraceMetrics([
      event({ id: 'message', timestamp: 1000, category: 'model', eventType: 'message.start', status: 'pending' }),
      event({ id: 'tool-1', timestamp: 1100, category: 'tool', eventType: 'tool.complete', toolName: 'read_file', durationMs: 114 }),
      event({ id: 'response', timestamp: 2200, category: 'response', eventType: 'message.complete' })
    ])

    expect(metrics.totalExecutionDurationMs).toBe(1200)
    expect(metrics.totalToolCalls).toBe(1)
    expect(metrics.successfulToolCalls).toBe(1)
    expect(metrics.failedToolCalls).toBe(0)
    expect(metrics.averageToolDurationMs).toBe(114)
  })

  it('counts failed and pending tools while ignoring pending tools for duration metrics', () => {
    const metrics = deriveTraceMetrics([
      event({ id: 'tool-1', category: 'tool', eventType: 'tool.complete', toolName: 'read_file', status: 'success', durationMs: 100 }),
      event({ id: 'tool-2', category: 'error', eventType: 'tool.complete', toolName: 'write_file', status: 'error', durationMs: 500 }),
      event({ id: 'tool-3', category: 'tool', eventType: 'tool.start', toolName: 'search', status: 'pending' }),
      event({ id: 'tool-4', category: 'tool', eventType: 'tool.complete', toolName: 'unknown_duration', status: 'success' })
    ])

    expect(metrics.totalToolCalls).toBe(4)
    expect(metrics.successfulToolCalls).toBe(2)
    expect(metrics.failedToolCalls).toBe(1)
    expect(metrics.averageToolDurationMs).toBe(300)
    expect(metrics.slowestTool).toEqual({ toolName: 'write_file', durationMs: 500 })
  })

  it('uses the normalized model completion duration', () => {
    const metrics = deriveTraceMetrics([
      event({ id: 'model', category: 'model', eventType: 'message.complete', durationMs: 800 })
    ])

    expect(metrics.modelGenerationDurationMs).toBe(800)
  })

  it('does not double count a tool start replaced by its completion', () => {
    const metrics = deriveTraceMetrics([
      event({ id: 'tool-1', category: 'tool', eventType: 'tool.start', toolName: 'read_file', status: 'pending' }),
      event({ id: 'tool-1', category: 'tool', eventType: 'tool.complete', toolName: 'read_file', status: 'success', durationMs: 114 })
    ])

    expect(metrics.totalToolCalls).toBe(1)
    expect(metrics.successfulToolCalls).toBe(1)
    expect(metrics.averageToolDurationMs).toBe(114)
  })
})
