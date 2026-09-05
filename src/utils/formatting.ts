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
