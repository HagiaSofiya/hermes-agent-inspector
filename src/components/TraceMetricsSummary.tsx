import type { TraceMetrics } from '../trace/types'
import { formatMetricDuration } from '../utils/formatting'

function MetricBlock({ label, value, detail, mono = false, wide = false }: { label: string; value: string; detail?: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={(wide ? 'col-span-2 ' : '') + 'min-w-0 rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-3 py-2.5'}>
      <div className="truncate text-[0.62rem] font-medium uppercase tracking-[0.14em] text-(--ui-text-tertiary)">{label}</div>
      <div className={(mono ? 'font-mono ' : '') + 'mt-1 truncate text-sm font-semibold tabular-nums text-foreground'} title={value}>
        {value}
      </div>
      {detail ? <div className="mt-0.5 truncate text-[0.68rem] text-(--ui-text-tertiary)" title={detail}>{detail}</div> : null}
    </div>
  )
}

export function TraceMetricsSummary({ metrics }: { metrics: TraceMetrics }) {
  const slowestLabel = metrics.slowestTool ? metrics.slowestTool.toolName : '—'
  const slowestDuration = metrics.slowestTool ? formatMetricDuration(metrics.slowestTool.durationMs) : undefined

  return (
    <section aria-label="Execution metrics" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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
