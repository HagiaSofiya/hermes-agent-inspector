import { Badge, EmptyState, ErrorState, ScrollArea, Skeleton } from '@hermes/plugin-sdk'

import type { RunSummary } from '../api/runs'
import { displaySessionId, formatMetricDuration, formatTime } from '../utils/formatting'

export type RunHistoryState = 'loading' | 'ready' | 'error'

interface RunHistoryProps {
  runs: RunSummary[]
  state: RunHistoryState
  error: string
  selectedRunId: string | null
  onSelect: (runId: string) => void
}

function runStatusVariant(status: RunSummary['status']): 'default' | 'destructive' {
  return status === 'error' ? 'destructive' : 'default'
}

export function RunHistory({ runs, state, error, selectedRunId, onSelect }: RunHistoryProps) {
  return (
    <section aria-label="Run history" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">Previous runs</h2>
          <span className="text-xs text-(--ui-text-tertiary)">{runs.length ? `${runs.length} completed` : 'completed traces'}</span>
        </div>
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
      ) : runs.length ? (
        <ScrollArea className="max-h-44 rounded-md border border-(--ui-stroke-secondary) bg-background/20 p-2">
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {runs.map(run => (
              <button
                aria-label={`Open run ${displaySessionId(run.sessionId)}`}
                aria-pressed={run.runId === selectedRunId}
                className={
                  'min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 ' +
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
        </ScrollArea>
      ) : (
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/20 p-4">
          <EmptyState title="No completed runs yet" description="Completed Hermes sessions will appear here after the backend is enabled." />
        </div>
      )}
    </section>
  )
}
