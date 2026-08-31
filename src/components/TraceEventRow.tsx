import { Badge, StatusDot } from '@hermes/plugin-sdk'

import type { TraceEvent } from '../trace/types'
import { displaySessionId, formatDuration, formatTime, statusLabel, statusTone } from '../utils/formatting'
import { shortSummary, summarizeObject } from '../utils/serialization'

interface TraceEventRowProps {
  event: TraceEvent
  onSelect?: (eventId: string) => void
  selected?: boolean
}

function EventDetail({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-[0.68rem]">
      <span className="pt-px font-medium uppercase tracking-[0.1em] text-(--ui-text-tertiary)">{label}</span>
      <code
        className="min-w-0 truncate rounded-[3px] bg-(--ui-bg-tertiary) px-1.5 py-1 font-mono text-(--ui-text-secondary)"
        title={summarizeObject(value)}
      >
        {shortSummary(value, 180)}
      </code>
    </div>
  )
}

export function TraceEventRow({ event, onSelect, selected = false }: TraceEventRowProps) {
  const isTool = event.category === 'tool' || Boolean(event.toolName)
  const category = event.category.toUpperCase()
  const baseCardClass = 'min-w-0 rounded-md border px-3 py-2.5 shadow-none'
  const cardClass = selected
    ? 'border-primary/50 bg-primary/[0.055] ring-1 ring-primary/20'
    : event.status === 'error'
      ? 'border-destructive/35 bg-destructive/[0.035]'
      : event.status === 'pending'
        ? 'border-amber-500/30 bg-amber-500/[0.025]'
        : 'border-(--ui-stroke-secondary) bg-background/40'

  const cardContent = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge size="xs" variant={event.status === 'error' ? 'destructive' : event.status === 'pending' ? 'warn' : 'muted'}>
              {category}
            </Badge>
            <span className="font-mono text-[0.62rem] text-(--ui-text-tertiary)">{event.eventType}</span>
          </div>
          <h3 className={isTool ? 'truncate font-mono text-sm font-semibold text-foreground' : 'text-sm font-semibold text-foreground'}>
            {event.toolName || event.title}
          </h3>
          {event.toolName && event.title !== event.toolName ? (
            <div className="mt-0.5 text-xs text-(--ui-text-secondary)">{event.title}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[0.62rem] text-(--ui-text-tertiary)">
          {event.durationMs !== undefined ? <span className="font-mono tabular-nums">{formatDuration(event.durationMs)}</span> : null}
          <time className="font-mono tabular-nums" dateTime={new Date(event.timestamp).toISOString()}>
            {formatTime(event.timestamp)}
          </time>
        </div>
      </div>
      <p className="mt-2 break-words text-xs leading-relaxed text-(--ui-text-secondary)">{event.summary}</p>
      {event.input !== undefined || event.output !== undefined ? (
        <div className="mt-2 grid gap-1.5">
          <EventDetail label="input" value={event.input} />
          <EventDetail label="output" value={event.output} />
        </div>
      ) : null}
      {event.sessionId ? (
        <div className="mt-2 font-mono text-[0.62rem] text-(--ui-text-quaternary)" title={event.sessionId}>
          session {displaySessionId(event.sessionId)}
        </div>
      ) : null}
      <div className="mt-2 text-[0.65rem] font-medium text-(--ui-text-tertiary)">{statusLabel(event.status)}</div>
    </>
  )

  const card = isTool ? (
    <button
      aria-label={'Inspect ' + (event.toolName || 'tool') + ' event'}
      aria-pressed={selected}
      className={
        baseCardClass +
        ' block w-full cursor-pointer text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 ' +
        cardClass
      }
      onClick={() => onSelect?.(event.id)}
      type="button"
    >
      {cardContent}
    </button>
  ) : (
    <article className={baseCardClass + ' ' + cardClass}>{cardContent}</article>
  )

  return (
    <li className="relative grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
      <div className="relative flex justify-center">
        <span className="absolute top-2 bottom-0 w-px bg-(--ui-stroke-secondary)" />
        <StatusDot className="relative mt-2.5 ring-4 ring-background" tone={statusTone(event.status)} />
      </div>
      {card}
    </li>
  )
}
