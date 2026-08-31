import type { RpcEvent } from '@hermes/plugin-sdk'

import type { NormalizedBatchItem, PendingTool, TraceEvent, TraceStatus } from './types'
import {
  firstDefined,
  firstString,
  isRecord,
  numberValue,
  shortSummary,
  summarizePayload
} from '../utils/serialization'

const UNSCOPED_STREAM_EVENT_TYPES = new Set([
  'approval.request',
  'clarify.request',
  'error',
  'message.complete',
  'message.delta',
  'message.interim',
  'message.start',
  'reasoning.available',
  'reasoning.delta',
  'secret.request',
  'status.update',
  'sudo.request',
  'thinking.delta',
  'tool.complete',
  'tool.generating',
  'tool.progress',
  'tool.start'
])

const MODEL_ACTIVITY_EVENT_TYPES = new Set([
  'message.delta',
  'thinking.delta',
  'reasoning.delta',
  'reasoning.available'
])

const REQUEST_EVENT_TYPES = new Set([
  'approval.request',
  'clarify.request',
  'mcp.setup.request',
  'secret.request',
  'sudo.request',
  'terminal.read.request',
  'preview.read.request',
  'preview.act.request',
  'window.read.request'
])

interface Turn {
  id: string
  sessionId: string | null
  startedAt: number
  text: string
}

interface MakeEventInput {
  category: TraceEvent['category']
  eventType: string
  id?: string
  input?: unknown
  output?: unknown
  rawPayload: unknown
  sessionId: string | null
  status: TraceStatus
  summary: string
  title: string
  timestamp: number
  toolName?: string
  durationMs?: number
}

export function createTraceNormalizer() {
  let unscopedSessionId: string | null = null
  let sequence = 0
  let turnSequence = 0
  const turns = new Map<string, Turn>()
  const pendingTools = new Map<string, PendingTool>()
  const pendingToolsByName = new Map<string, string[]>()

  function nextId(prefix: string): string {
    sequence += 1
    return prefix + ':' + Date.now() + ':' + sequence
  }

  function nextTurnId(sessionId: string | null): string {
    turnSequence += 1
    return 'turn:' + (sessionId || 'unknown') + ':' + turnSequence
  }

  function payloadRecord(payload: unknown): Record<string, unknown> {
    return isRecord(payload) ? payload : {}
  }

  function resolveSessionId(
    eventType: string,
    gatewayEvent: RpcEvent<unknown>,
    currentSessionId: string | null
  ): string | null {
    const explicitSessionId = typeof gatewayEvent.session_id === 'string' && gatewayEvent.session_id ? gatewayEvent.session_id : null

    if (explicitSessionId) {
      return explicitSessionId
    }

    if (eventType === 'message.start') {
      unscopedSessionId = currentSessionId || unscopedSessionId
      return unscopedSessionId || currentSessionId || null
    }

    if (UNSCOPED_STREAM_EVENT_TYPES.has(eventType)) {
      return unscopedSessionId || currentSessionId || null
    }

    return currentSessionId || null
  }

  function turnKey(sessionId: string | null): string {
    return sessionId || 'unknown'
  }

  function ensureTurn(sessionId: string | null, timestamp: number): Turn {
    const key = turnKey(sessionId)
    let turn = turns.get(key)

    if (!turn) {
      turn = { id: nextTurnId(sessionId), sessionId, startedAt: timestamp, text: '' }
      turns.set(key, turn)
    }

    return turn
  }

  function toolCorrelationId(payload: Record<string, unknown>): string | null {
    return firstString(payload, ['tool_id', 'tool_call_id', 'id']) || null
  }

  function toolKey(sessionId: string | null, correlationId: string): string {
    return (sessionId || 'unknown') + ':' + correlationId
  }

  function toolName(payload: Record<string, unknown>): string {
    return firstString(payload, ['name', 'tool_name', 'tool']) || 'tool'
  }

  function toolInput(payload: Record<string, unknown>): unknown {
    return firstDefined(payload, ['args', 'arguments', 'input', 'context'])
  }

  function queueTool(name: string, rowId: string): void {
    const queue = pendingToolsByName.get(name) || []
    queue.push(rowId)
    pendingToolsByName.set(name, queue)
  }

  function removeQueuedTool(name: string, rowId: string): void {
    const queue = pendingToolsByName.get(name)

    if (!queue) {
      return
    }

    const nextQueue = queue.filter(id => id !== rowId)

    if (nextQueue.length) {
      pendingToolsByName.set(name, nextQueue)
    } else {
      pendingToolsByName.delete(name)
    }
  }

  function findPendingTool(sessionId: string | null, payload: Record<string, unknown>): PendingTool | undefined {
    const correlationId = toolCorrelationId(payload)

    if (correlationId) {
      const exact = pendingTools.get('tool:' + toolKey(sessionId, correlationId))

      if (exact) {
        return exact
      }
    }

    const queue = pendingToolsByName.get(toolName(payload)) || []

    for (const rowId of queue) {
      const pending = pendingTools.get(rowId)

      if (pending && pending.sessionId === sessionId) {
        return pending
      }
    }

    return undefined
  }

  function registerTool(sessionId: string | null, payload: Record<string, unknown>, timestamp: number): PendingTool {
    const name = toolName(payload)
    const correlationId = toolCorrelationId(payload)
    const rowId = correlationId
      ? 'tool:' + toolKey(sessionId, correlationId)
      : nextId('tool:' + (sessionId || 'unknown') + ':' + name)
    const existing = pendingTools.get(rowId)

    if (existing) {
      return existing
    }

    const pending: PendingTool = {
      id: rowId,
      sessionId,
      name,
      startedAt: timestamp,
      input: toolInput(payload)
    }

    pendingTools.set(rowId, pending)
    queueTool(name, rowId)

    return pending
  }

  function makeEvent({
    category,
    eventType,
    id,
    input,
    output,
    rawPayload,
    sessionId,
    status,
    summary,
    title,
    timestamp,
    toolName: eventToolName,
    durationMs
  }: MakeEventInput): TraceEvent {
    return {
      id: id || nextId(eventType),
      timestamp,
      category,
      eventType,
      sessionId,
      title,
      summary,
      status,
      ...(eventToolName ? { toolName: eventToolName } : {}),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(input === undefined ? {} : { input }),
      ...(output === undefined ? {} : { output }),
      rawPayload
    }
  }

  function modelEvent(
    turn: Turn,
    eventType: string,
    payload: unknown,
    timestamp: number,
    status: TraceStatus,
    title: string,
    summary: string
  ): TraceEvent {
    return makeEvent({
      category: 'model',
      eventType,
      id: turn.id,
      output: turn.text || undefined,
      rawPayload: payload,
      sessionId: turn.sessionId,
      status,
      summary,
      title,
      timestamp,
      durationMs: status === 'pending' ? undefined : Math.max(0, timestamp - turn.startedAt)
    })
  }

  function normalize(gatewayEvent: RpcEvent<unknown>, currentSessionId: string | null): NormalizedBatchItem[] {
    const eventType = typeof gatewayEvent.type === 'string' && gatewayEvent.type ? gatewayEvent.type : 'unknown'
    const payload = gatewayEvent.payload
    const payloadObject = payloadRecord(payload)
    const timestamp = eventTimestamp(payloadObject)
    const sessionId = resolveSessionId(eventType, gatewayEvent, currentSessionId)
    const items: NormalizedBatchItem[] = []
    const add = (event: TraceEvent, replaceId?: string): void => {
      items.push({ event, ...(replaceId ? { replaceId } : {}) })
    }

    if (eventType === 'message.start') {
      const turn: Turn = { id: nextTurnId(sessionId), sessionId, startedAt: timestamp, text: '' }
      turns.set(turnKey(sessionId), turn)
      add(modelEvent(turn, eventType, payload, timestamp, 'pending', 'Generating response…', 'Turn accepted by Hermes'))
      return items
    }

    if (MODEL_ACTIVITY_EVENT_TYPES.has(eventType)) {
      const turn = ensureTurn(sessionId, timestamp)
      const text = firstString(payloadObject, ['text'])

      if (text && eventType === 'message.delta') {
        turn.text += text
      }

      const activityTitle =
        eventType === 'thinking.delta'
          ? 'Thinking…'
          : eventType === 'reasoning.delta' || eventType === 'reasoning.available'
            ? 'Reasoning…'
            : 'Generating response…'
      const activitySummary =
        eventType === 'message.delta'
          ? text
            ? 'Streaming response · ' + shortSummary(text, 132)
            : 'Streaming response…'
          : eventType === 'thinking.delta'
            ? 'Provider wait / thinking signal'
            : 'Reasoning signal received'

      add(modelEvent(turn, eventType, payload, timestamp, 'pending', activityTitle, activitySummary), turn.id)
      return items
    }

    if (eventType === 'message.complete') {
      const turn = ensureTurn(sessionId, timestamp)
      const finalText = firstString(payloadObject, ['text', 'rendered'])
      const failed = isFailure(payloadObject)

      if (finalText) {
        turn.text = finalText
      }

      add(
        modelEvent(
          turn,
          eventType,
          payload,
          timestamp,
          failed ? 'error' : 'success',
          failed ? 'Generation failed' : 'Generation complete',
          failed ? 'The model turn ended with an error' : 'Model generation finished'
        ),
        turn.id
      )
      add(
        makeEvent({
          category: 'response',
          eventType,
          id: nextId('response:' + (sessionId || 'unknown')),
          output: finalText || undefined,
          rawPayload: payload,
          sessionId,
          status: failed ? 'error' : 'success',
          summary: failed
            ? firstString(payloadObject, ['error', 'message']) || 'The assistant response failed'
            : shortSummary(finalText, 180) || 'Complete',
          title: failed ? 'Assistant response failed' : 'Complete',
          timestamp,
          durationMs: Math.max(0, timestamp - turn.startedAt)
        })
      )
      turns.delete(turnKey(sessionId))

      if (!gatewayEvent.session_id) {
        unscopedSessionId = null
      }

      return items
    }

    if (eventType === 'tool.start' || eventType === 'tool.progress') {
      const pending =
        eventType === 'tool.progress'
          ? findPendingTool(sessionId, payloadObject) || registerTool(sessionId, payloadObject, timestamp)
          : registerTool(sessionId, payloadObject, timestamp)
      const input = toolInput(payloadObject) ?? pending.input
      const preview = firstString(payloadObject, ['preview', 'summary'])

      add(
        makeEvent({
          category: 'tool',
          eventType,
          id: pending.id,
          input,
          rawPayload: payload,
          sessionId,
          status: 'pending',
          summary: preview || shortSummary(input, 160) || 'Waiting for tool result…',
          title: eventType === 'tool.progress' ? 'Running' : 'Tool call',
          timestamp,
          toolName: pending.name
        }),
        pending.id
      )
      return items
    }

    if (eventType === 'tool.complete') {
      const pending = findPendingTool(sessionId, payloadObject)
      const name = toolName(payloadObject)
      const resolved = pending || registerTool(sessionId, payloadObject, timestamp)
      const failed = isFailure(payloadObject)
      const output = firstDefined(payloadObject, ['result', 'output'])
      const durationSeconds = numberValue(payloadObject.duration_s)
      const durationMs =
        durationSeconds === undefined
          ? Math.max(0, timestamp - resolved.startedAt)
          : Math.max(0, Math.round(durationSeconds * 1000))

      pendingTools.delete(resolved.id)
      removeQueuedTool(resolved.name, resolved.id)

      add(
        makeEvent({
          category: failed ? 'error' : 'tool',
          eventType,
          id: resolved.id,
          input: resolved.input,
          output,
          rawPayload: payload,
          sessionId,
          status: failed ? 'error' : 'success',
          summary: failed
            ? firstString(payloadObject, ['error', 'message']) || 'Tool execution failed'
            : shortSummary(output, 180) || 'Success',
          title: failed ? 'Tool execution failed' : 'Success',
          timestamp,
          toolName: name || resolved.name,
          durationMs
        }),
        resolved.id
      )
      return items
    }

    if (eventType === 'tool.generating') {
      const name = toolName(payloadObject)

      add(
        makeEvent({
          category: 'model',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'pending',
          summary: 'Model is preparing a tool call',
          title: 'Preparing tool call',
          timestamp,
          toolName: name
        })
      )
      return items
    }

    if (eventType === 'error') {
      const turn = turns.get(turnKey(sessionId))

      if (turn) {
        add(modelEvent(turn, eventType, payload, timestamp, 'error', 'Generation failed', 'The active turn ended with an error'), turn.id)
      }

      add(
        makeEvent({
          category: 'error',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'error',
          summary: firstString(payloadObject, ['message', 'error']) || 'Hermes reported an error',
          title: 'Execution error',
          timestamp
        })
      )

      if (!gatewayEvent.session_id) {
        unscopedSessionId = null
      }

      return items
    }

    if (eventType === 'gateway.ready') {
      add(
        makeEvent({
          category: 'system',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'success',
          summary: 'Desktop gateway is ready',
          title: 'Gateway ready',
          timestamp
        })
      )
      return items
    }

    if (eventType === 'session.info') {
      const model = firstString(payloadObject, ['model'])
      const provider = firstString(payloadObject, ['provider'])
      const running = payloadObject.running === true

      add(
        makeEvent({
          category: 'system',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'success',
          summary: [running ? 'Agent running' : 'Agent idle', model || provider].filter(Boolean).join(' · '),
          title: running ? 'Agent running' : 'Session idle',
          timestamp
        })
      )
      return items
    }

    if (eventType === 'message.interim') {
      const text = firstString(payloadObject, ['text', 'rendered'])

      add(
        makeEvent({
          category: 'response',
          eventType,
          output: text || undefined,
          rawPayload: payload,
          sessionId,
          status: 'success',
          summary: shortSummary(text, 180) || 'Interim response',
          title: 'Interim response',
          timestamp
        })
      )
      return items
    }

    if (REQUEST_EVENT_TYPES.has(eventType)) {
      add(
        makeEvent({
          category: 'system',
          eventType,
          input: firstDefined(payloadObject, ['input', 'args', 'arguments']),
          rawPayload: payload,
          sessionId,
          status: 'pending',
          summary: firstString(payloadObject, ['message', 'summary', 'preview']) || 'Awaiting input',
          title: eventType.replace('.request', '').replaceAll('.', ' '),
          timestamp
        })
      )
      return items
    }

    if (eventType === 'status.update') {
      const kind = firstString(payloadObject, ['kind'])

      add(
        makeEvent({
          category: 'system',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'pending',
          summary: firstString(payloadObject, ['message', 'summary']) || kind || 'Status update received',
          title: kind ? kind.replaceAll('_', ' ') : 'Status update',
          timestamp
        })
      )
      return items
    }

    if (eventType === 'session.usage' || eventType === 'session.title' || eventType === 'session.reclaimed') {
      add(
        makeEvent({
          category: 'system',
          eventType,
          rawPayload: payload,
          sessionId,
          status: 'success',
          summary: shortSummary(payload, 180) || 'Session lifecycle update',
          title: eventType.replaceAll('.', ' '),
          timestamp
        })
      )
      return items
    }

    add(
      makeEvent({
        category: 'system',
        eventType,
        rawPayload: payload,
        sessionId,
        status: 'success',
        summary: summarizePayload(payload),
        title: eventType === 'unknown' ? 'Gateway event' : eventType.replaceAll('.', ' '),
        timestamp
      })
    )

    return items
  }

  return { normalize }
}

function eventTimestamp(payload: Record<string, unknown>): number {
  const timestamp = numberValue(payload.timestamp)

  return timestamp === undefined ? Date.now() : Math.round(timestamp * 1000)
}

function isFailure(payload: Record<string, unknown>): boolean {
  const errorValue = payload.error
  const hasError =
    errorValue === true ||
    (typeof errorValue === 'string' && errorValue.trim().length > 0) ||
    (isRecord(errorValue) && Object.keys(errorValue).length > 0)

  return hasError || payload.is_error === true || payload.status === 'error' || payload.status === 'failed'
}
