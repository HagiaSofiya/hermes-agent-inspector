import type { TraceStatus } from '../trace/types'

export function displaySessionId(sessionId: string | null | undefined): string {
  if (!sessionId) {
    return '—'
  }

  return sessionId.length > 18 ? sessionId.slice(0, 8) + '…' + sessionId.slice(-6) : sessionId
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return ''
  }

  return durationMs >= 1000 ? (durationMs / 1000).toFixed(1) + 's' : Math.round(durationMs) + 'ms'
}

export function formatMetricDuration(durationMs: number | null | undefined): string {
  return durationMs === null || durationMs === undefined ? '—' : formatDuration(durationMs)
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) {
    return '—'
  }

  if (tokens < 1_000) {
    return String(Math.round(tokens))
  }

  if (tokens < 1_000_000) {
    return (tokens / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  }

  return (tokens / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
}

export function formatCost(costUsd: number | null | undefined): string {
  if (costUsd === null || costUsd === undefined) {
    return '—'
  }

  if (costUsd === 0) {
    return '$0.00'
  }

  // Agent runs are routinely worth a fraction of a cent. Rounding those to
  // '$0.00' would read as free rather than as cheap.
  if (costUsd < 0.0001) {
    return '<$0.0001'
  }

  return '$' + costUsd.toFixed(costUsd < 0.01 ? 4 : 2)
}

export function statusLabel(status: TraceStatus): string {
  return status === 'pending' ? 'Running' : status === 'error' ? 'Error' : 'Success'
}

export function statusTone(status: TraceStatus): 'good' | 'warn' | 'bad' {
  return status === 'pending' ? 'warn' : status === 'error' ? 'bad' : 'good'
}

export function runGroupLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

export function statusFor(
  gateway: string,
  busy: boolean,
  awaitingResponse: boolean
): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (gateway !== 'open') {
    return { label: gateway || 'unknown', tone: 'muted' }
  }

  if (busy) {
    return { label: 'running', tone: 'good' }
  }

  if (awaitingResponse) {
    return { label: 'waiting', tone: 'warn' }
  }

  return { label: 'idle', tone: 'muted' }
}
