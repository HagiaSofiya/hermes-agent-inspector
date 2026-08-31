import { describe, expect, it } from 'vitest'

import { createTraceNormalizer } from '../src/trace/normalizer'

function gatewayEvent(type: string, payload: Record<string, unknown>, session_id = 'session-1') {
  return { type, payload, session_id }
}

function first<T>(items: T[]): T {
  const item = items[0]

  if (!item) {
    throw new Error('Expected a normalized event')
  }

  return item
}

describe('createTraceNormalizer', () => {
  it('normalizes message.start and message.complete into a replaced model row plus response', () => {
    const normalizer = createTraceNormalizer()
    const start = normalizer.normalize(gatewayEvent('message.start', { timestamp: 1 }), 'session-1')
    const complete = normalizer.normalize(gatewayEvent('message.complete', { timestamp: 1.5, text: 'Done' }), 'session-1')
    const startEvent = first(start)
    const completeModel = first(complete)
    const completeResponse = complete[1]

    expect(start).toHaveLength(1)
    expect(startEvent.event.category).toBe('model')
    expect(startEvent.event.status).toBe('pending')
    expect(complete).toHaveLength(2)
    expect(completeModel.replaceId).toBe(startEvent.event.id)
    expect(completeModel.event.status).toBe('success')
    expect(completeModel.event.durationMs).toBe(500)
    expect(completeResponse?.event.category).toBe('response')
    expect(completeResponse?.event.output).toBe('Done')
  })

  it('correlates tool.start and tool.complete by tool_id', () => {
    const normalizer = createTraceNormalizer()
    const start = normalizer.normalize(
      gatewayEvent('tool.start', { timestamp: 2, tool_id: 'call-1', name: 'read_file', args: { path: 'package.json' } }),
      'session-1'
    )
    const complete = normalizer.normalize(
      gatewayEvent('tool.complete', { timestamp: 2.114, tool_id: 'call-1', name: 'read_file', result: 'ok' }),
      'session-1'
    )
    const startEvent = first(start)
    const completeEvent = first(complete)

    expect(completeEvent.replaceId).toBe(startEvent.event.id)
    expect(completeEvent.event.input).toEqual({ path: 'package.json' })
    expect(completeEvent.event.output).toBe('ok')
    expect(completeEvent.event.durationMs).toBe(114)
  })

  it('normalizes tool failures as error events', () => {
    const normalizer = createTraceNormalizer()
    const result = normalizer.normalize(
      gatewayEvent('tool.complete', { timestamp: 3, tool_id: 'call-2', name: 'write_file', error: 'permission denied' }),
      'session-1'
    )
    const resultEvent = first(result)

    expect(resultEvent.event.category).toBe('error')
    expect(resultEvent.event.status).toBe('error')
    expect(resultEvent.event.summary).toBe('permission denied')
  })

  it('falls back to the generic system event for unknown gateway events', () => {
    const normalizer = createTraceNormalizer()
    const result = normalizer.normalize(gatewayEvent('future.event', { timestamp: 4, value: 42 }), 'session-1')
    const resultEvent = first(result)

    expect(resultEvent.event.category).toBe('system')
    expect(resultEvent.event.eventType).toBe('future.event')
    expect(resultEvent.event.summary).toContain('42')
  })
})
