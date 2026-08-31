import { EmptyState, ErrorState, ScrollArea, SegmentedControl, Skeleton } from '@hermes/plugin-sdk'

import { TraceEventRow } from './TraceEventRow'
import type { TraceEvent } from '../trace/types'

export type TimelineFilter = 'all' | 'model' | 'tools' | 'errors'

interface TraceTimelineProps {
  events: TraceEvent[]
  filter: TimelineFilter
  listenerState: 'loading' | 'ready' | 'error'
  listenerError: string
  selectedEventId: string | null
  onFilterChange: (filter: TimelineFilter) => void
  onSelectEvent: (eventId: string) => void
  emptyTitle?: string
  emptyDescription?: string
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'model', label: 'Model' },
  { id: 'tools', label: 'Tools' },
  { id: 'errors', label: 'Errors' }
]

function filterMatches(event: TraceEvent, filter: TimelineFilter): boolean {
  if (filter === 'model') {
    return event.category === 'model'
  }

  if (filter === 'tools') {
    return event.category === 'tool' || Boolean(event.toolName)
  }

  if (filter === 'errors') {
    return event.category === 'error' || event.status === 'error'
  }

  return true
}

function isTimelineFilter(value: string): value is TimelineFilter {
  return value === 'all' || value === 'model' || value === 'tools' || value === 'errors'
}

export function TraceTimeline({
  events,
  filter,
  listenerState,
  listenerError,
  selectedEventId,
  onFilterChange,
  onSelectEvent,
  emptyTitle = 'Listening for execution events',
  emptyDescription = 'Start a prompt in Hermes to see model, tool, and response activity here.'
}: TraceTimelineProps) {
  // Sort by normalized event time rather than collection order. Replaced
  // events keep their original array position, so reversing the collection
  // can place a completed model event below newer tool activity.
  const visibleEvents = events
    .filter(event => filterMatches(event, filter))
    .toSorted((left, right) => right.timestamp - left.timestamp)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">Execution timeline</h2>
          <span className="text-xs text-(--ui-text-tertiary)">newest first</span>
        </div>
        <SegmentedControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={value => {
            if (isTimelineFilter(value)) {
              onFilterChange(value)
            }
          }}
        />
      </div>
      {listenerState === 'error' ? (
        <div className="rounded-md border border-destructive/30 p-5">
          <ErrorState title="Event stream unavailable" description={listenerError || 'Hermes did not provide a gateway event subscription.'} />
        </div>
      ) : (
        <ScrollArea
          // Reset the native scroll position when switching to a different
          // filtered collection. Hermes does not expose a ScrollArea ref API.
          key={filter}
          className="min-h-0 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-background/20 px-3 py-3"
        >
          {listenerState === 'loading' ? (
            <div className="grid gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-11/12" />
              <Skeleton className="h-16 w-4/5" />
            </div>
          ) : visibleEvents.length ? (
            <ol aria-live="polite" className="grid gap-3">
              {visibleEvents.map(event => (
                <TraceEventRow
                  event={event}
                  key={event.id}
                  onSelect={onSelectEvent}
                  selected={event.id === selectedEventId}
                />
              ))}
            </ol>
          ) : (
            <EmptyState
              title={events.length ? 'No matching events' : emptyTitle}
              description={events.length ? 'Try a different timeline filter.' : emptyDescription}
            />
          )}
        </ScrollArea>
      )}
    </section>
  )
}
