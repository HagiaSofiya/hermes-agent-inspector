import { describe, expect, it } from 'vitest'

import { latestUsageSnapshot, readUsageSnapshot, usageDelta } from '../../src/trace/usage'
import type { TraceEvent } from '../../src/trace/types'

// Shape copied from a real session.usage event recorded by the plugin.
function usageEvent(usage: Record<string, unknown>, overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: 'usage',
    timestamp: 1000,
    category: 'system',
    eventType: 'session.usage',
    sessionId: 'session-1',
    title: 'session usage',
    summary: '',
    status: 'success',
    rawPayload: { usage },
    ...overrides
  }
}

const REAL_TICK = {
  model: 'upstage/solar-pro4:free',
  input: 19020,
  output: 111,
  reasoning: 56,
  prompt: 20108,
  completion: 111,
  total: 20219,
  calls: 1,
  context_used: 20108,
  context_max: 524288,
  context_percent: 4,
  compressions: 0,
  active_subagents: 0
}

describe('readUsageSnapshot', () => {
  it('reads the counters Hermes actually reports', () => {
    expect(readUsageSnapshot(usageEvent(REAL_TICK))).toEqual({
      model: 'upstage/solar-pro4:free',
      promptTokens: 20108,
      completionTokens: 111,
      totalTokens: 20219,
      reasoningTokens: 56,
      calls: 1,
      contextUsed: 20108,
      contextMax: 524288,
      contextPercent: 4
    })
  })

  it('prefers the self-consistent prompt/completion pair over input/output', () => {
    // The real tick above carries input 19020 alongside prompt 20108, and only
    // prompt + completion reconciles with the reported total.
    const snapshot = readUsageSnapshot(usageEvent(REAL_TICK))

    expect(snapshot?.promptTokens).not.toBe(REAL_TICK.input)
    expect((snapshot?.promptTokens ?? 0) + (snapshot?.completionTokens ?? 0)).toBe(snapshot?.totalTokens)
  })

  it('derives a missing total from its parts', () => {
    expect(readUsageSnapshot(usageEvent({ prompt: 10, completion: 5 }))?.totalTokens).toBe(15)
  })

  it('ignores events that are not usage ticks', () => {
    expect(readUsageSnapshot(usageEvent(REAL_TICK, { eventType: 'message.complete' }))).toBeNull()
    expect(readUsageSnapshot(usageEvent({}))).toBeNull()
    expect(readUsageSnapshot({ ...usageEvent(REAL_TICK), rawPayload: { usage: 'nope' } })).toBeNull()
  })
})

describe('usageDelta', () => {
  it('passes a snapshot through when there is no baseline', () => {
    const snapshot = readUsageSnapshot(usageEvent(REAL_TICK))!

    expect(usageDelta(snapshot, null)).toBe(snapshot)
  })

  it('reports only what happened after the baseline', () => {
    const baseline = readUsageSnapshot(usageEvent(REAL_TICK))!
    const latest = readUsageSnapshot(usageEvent({ ...REAL_TICK, prompt: 40425, completion: 149, total: 40574, calls: 2 }))!
    const delta = usageDelta(latest, baseline)

    expect(delta.promptTokens).toBe(20317)
    expect(delta.completionTokens).toBe(38)
    expect(delta.totalTokens).toBe(20355)
    expect(delta.calls).toBe(1)
  })

  it('keeps the context reading point-in-time rather than differencing it', () => {
    const baseline = readUsageSnapshot(usageEvent(REAL_TICK))!
    const latest = readUsageSnapshot(usageEvent({ ...REAL_TICK, total: 40574, context_used: 24546, context_percent: 5 }))!

    expect(usageDelta(latest, baseline).contextUsed).toBe(24546)
    expect(usageDelta(latest, baseline).contextPercent).toBe(5)
  })

  it('falls back to the raw snapshot when the counters restarted', () => {
    const baseline = readUsageSnapshot(usageEvent({ ...REAL_TICK, prompt: 40425, total: 40574, calls: 9 }))!
    const latest = readUsageSnapshot(usageEvent(REAL_TICK))!

    expect(usageDelta(latest, baseline)).toBe(latest)
  })
})

describe('latestUsageSnapshot', () => {
  it('takes the newest tick in a trace', () => {
    const snapshot = latestUsageSnapshot([
      usageEvent(REAL_TICK, { id: 'a', timestamp: 1000 }),
      usageEvent({ ...REAL_TICK, total: 65246 }, { id: 'b', timestamp: 3000 }),
      usageEvent({ ...REAL_TICK, total: 40574 }, { id: 'c', timestamp: 2000 })
    ])

    expect(snapshot?.totalTokens).toBe(65246)
  })

  it('returns null for a trace with no usage ticks', () => {
    expect(latestUsageSnapshot([usageEvent(REAL_TICK, { eventType: 'message.complete' })])).toBeNull()
  })
})
