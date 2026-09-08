import type { TraceMetrics } from '../trace/types'
import { formatMetricDuration } from '../utils/formatting'

function MetricBlock({ label, value, detail, mono = false, wide = false }: { label: string; value: string; detail?: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={(wide ? 'col-span-2 ' : '') + 'flex min-w-0 items-baseline gap-1.5 rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-2.5 py-1.5'}>
      <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-(--ui-text-tertiary)">{label}</span>
      <span className={(mono ? 'font-mono ' : '') + 'min-w-0 flex-1 truncate text-xs font-semibold tabular-nums text-foreground'} title={value}>
        {value}
      </span>
      {detail ? <span className="shrink-0 truncate text-[0.62rem] text-(--ui-text-tertiary)" title={detail}>{detail}</span> : null}
    </div>
  )
}

export function TraceMetricsSummary({ metrics }: { metrics: TraceMetrics }) {
  const slowestLabel = metrics.slowestTool ? metrics.slowestTool.toolName : '—'
  const slowestDuration = metrics.slowestTool ? formatMetricDuration(metrics.slowestTool.durationMs) : undefined

  return (
    <section aria-label="Execution metrics" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
      <MetricBlock label="Runtime" mono value={formatMetricDuration(metrics.totalExecutionDurationMs)} detail={metrics.isActive ? 'active' : 'from trace'} />
      <MetricBlock label="Tool calls" mono value={String(metrics.totalToolCalls)} />
      <MetricBlock label="Successful" mono value={String(metrics.successfulToolCalls)} />
      <MetricBlock label="Failed" mono value={String(metrics.failedToolCalls)} />
      <MetricBlock label="Avg tool" mono value={formatMetricDuration(metrics.averageToolDurationMs)} />
      <MetricBlock label="Slowest tool" mono value={slowestLabel} detail={slowestDuration} />
      <MetricBlock label="Model generation" mono value={formatMetricDuration(metrics.modelGenerationDurationMs)} wide />
    </section>
  )
}
