import type { TraceUsage } from '../trace/types'
import { formatTokens } from '../utils/formatting'

function gaugeTone(percent: number): string {
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-primary'
}

/**
 * Context-window occupancy at the trace's most recent usage tick.
 *
 * Unlike the token counters this is a point-in-time reading rather than a
 * running total, so it needs no delta against a baseline.
 */
export function ContextGauge({ usage }: { usage: TraceUsage | null }) {
  const percent = usage?.contextPercent ?? null
  const used = usage?.contextUsed ?? null
  const max = usage?.contextMax ?? null
  const hasReading = percent !== null && max !== null
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent))

  return (
    <div className="col-span-2 flex min-w-0 flex-col justify-center gap-1 rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-2.5 py-1.5 sm:col-span-4 lg:col-span-3">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-(--ui-text-tertiary)">Context</span>
        <span className="min-w-0 truncate font-mono text-[0.65rem] tabular-nums text-(--ui-text-secondary)">
          {hasReading ? `${formatTokens(used)} / ${formatTokens(max)} · ${clamped}%` : 'Not reported'}
        </span>
      </div>
      <div
        aria-label="Context window used"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={hasReading ? clamped : undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-(--ui-stroke-secondary)"
        role="progressbar"
      >
        {hasReading ? (
          <div className={'h-full rounded-full transition-[width] ' + gaugeTone(clamped)} style={{ width: `${clamped}%` }} />
        ) : null}
      </div>
    </div>
  )
}
