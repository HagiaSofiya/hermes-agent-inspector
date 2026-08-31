export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

export function firstDefined(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }

  return undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function summarizeObject(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return 'Unserializable value'
  }
}

export function shortSummary(value: unknown, maxLength = 180): string {
  if (value === undefined || value === null) {
    return ''
  }

  const compact = summarizeObject(value).replace(/\s+/g, ' ').trim()

  return compact.length > maxLength ? compact.slice(0, maxLength - 1) + '…' : compact
}

export function summarizePayload(payload: unknown): string {
  if (payload === undefined || payload === null) {
    return 'No payload'
  }

  if (typeof payload === 'string') {
    return shortSummary(payload, 220) || 'Empty payload'
  }

  try {
    const serialized = JSON.stringify(payload)

    return serialized ? shortSummary(serialized, 220) : 'Empty payload'
  } catch {
    return 'Unserializable payload'
  }
}

export function prettyPrintValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    const serialized = JSON.stringify(value, null, 2)

    return serialized === undefined ? String(value) : serialized
  } catch {
    return '[Unserializable value]'
  }
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export function toJsonSafe(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value !== 'object') {
    return String(value)
  }

  if (seen.has(value)) {
    return '[Circular value]'
  }

  seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map(item => toJsonSafe(item, seen))
    }

    const record: { [key: string]: JsonValue } = {}

    for (const [key, item] of Object.entries(value)) {
      try {
        record[key] = toJsonSafe(item, seen)
      } catch {
        record[key] = '[Unserializable value]'
      }
    }

    return record
  } finally {
    seen.delete(value)
  }
}
