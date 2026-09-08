import { Badge, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@hermes/plugin-sdk'

import type { RunSummary } from '../api/runs'
import { displaySessionId, formatMetricDuration, formatTime, runGroupLabel } from '../utils/formatting'

export type RunHistoryState = 'loading' | 'ready' | 'error'
export type HistoryFilter = 'all' | 'success' | 'error'

interface RunHistoryProps {
  runs: RunSummary[]
  state: RunHistoryState
  error: string
  filter: HistoryFilter
  selectedRunId: string | null
  onFilterChange: (filter: HistoryFilter) => void
  onSelect: (runId: string) => void
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'success', label: 'Completed' },
  { id: 'error', label: 'Failed' }
]

function runStatusVariant(status: RunSummary['status']): 'default' | 'destructive' {
  return status === 'error' ? 'destructive' : 'default'
}

function filterMatches(run: RunSummary, filter: HistoryFilter): boolean {
  return filter === 'all' || run.status === filter
}

function isHistoryFilter(value: string): value is HistoryFilter {
  return value === 'all' || value === 'success' || value === 'error'
}

interface RunGroup {
  label: string
  runs: RunSummary[]
}

function groupRunsByDate(runs: RunSummary[]): RunGroup[] {
  const groups: RunGroup[] = []

  for (const run of runs) {
    const label = runGroupLabel(run.completedAt)
    const currentGroup = groups[groups.length - 1]

    if (currentGroup && currentGroup.label === label) {
      currentGroup.runs.push(run)
    } else {
      groups.push({ label, runs: [run] })
    }
  }

  return groups
}

export function RunHistory({ runs, state, error, filter, selectedRunId, onFilterChange, onSelect }: RunHistoryProps) {
  const visibleRuns = runs.filter(run => filterMatches(run, filter))
  const groups = groupRunsByDate(visibleRuns)

  return (
    <section aria-label="Run history" className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">Previous runs</h2>
          <span className="text-xs text-(--ui-text-tertiary)">{runs.length ? `${runs.length} completed` : 'completed traces'}</span>
        </div>
        <SegmentedControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={value => {
            if (isHistoryFilter(value)) {
              onFilterChange(value)
            }
          }}
        />
      </div>
      {state === 'error' ? (
        <div className="rounded-md border border-destructive/30 p-4">
          <ErrorState title="History unavailable" description={error || 'The Agent Inspector backend could not load saved runs.'} />
        </div>
      ) : state === 'loading' ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : visibleRuns.length ? (
        <div className="overflow-y-auto rounded-md border border-(--ui-stroke-secondary) bg-background/20 p-2" style={{ maxHeight: '13rem' }}>
          <div className="grid gap-3">
            {groups.map(group => (
              <div className="grid gap-1.5" key={group.label}>
                <div className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-(--ui-text-tertiary)">{group.label}</div>
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.runs.map(run => (
                    <button
                      aria-label={`Open run ${displaySessionId(run.sessionId)}`}
                      aria-pressed={run.runId === selectedRunId}
                      className={
                        'h-20 min-w-0 overflow-hidden rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 ' +
                        (run.runId === selectedRunId
                          ? 'border-primary/50 bg-primary/[0.055]'
                          : 'border-transparent hover:border-(--ui-stroke-secondary) hover:bg-(--ui-bg-tertiary)')
                      }
                      key={run.runId}
                      onClick={() => onSelect(run.runId)}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <Badge size="xs" variant={runStatusVariant(run.status)}>{run.status === 'error' ? 'Failed' : 'Completed'}</Badge>
                        <time className="shrink-0 font-mono text-[0.62rem] text-(--ui-text-tertiary)" dateTime={new Date(run.completedAt).toISOString()}>
                          {formatTime(run.completedAt)}
                        </time>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-foreground" title={run.model || undefined}>{run.model || 'Model not reported'}</div>
                      <div className="mt-1 flex gap-2 font-mono text-[0.65rem] tabular-nums text-(--ui-text-secondary)">
                        <span>{formatMetricDuration(run.runtimeMs)}</span>
                        <span>{run.toolCallCount} tools</span>
                        {run.failedToolCount ? <span className="text-destructive">{run.failedToolCount} failure{run.failedToolCount === 1 ? '' : 's'}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : runs.length ? (
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/20 p-4">
          <EmptyState title="No matching runs" description="Try a different filter." />
        </div>
      ) : (
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/20 p-4">
          <EmptyState title="No completed runs yet" description="Completed Hermes sessions will appear here after the backend is enabled." />
        </div>
      )}
    </section>
  )
}
