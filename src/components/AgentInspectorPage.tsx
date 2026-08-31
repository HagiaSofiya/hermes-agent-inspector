import { Badge, SegmentedControl, Separator, StatusDot, host, useValue } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'

import { loadRun, loadRuns, type PersistedRun, type PluginRest, type RunSummary } from '../api/runs'
import { RunHistory, type RunHistoryState } from './RunHistory'
import { ToolInspector } from './ToolInspector'
import { TraceMetricsSummary } from './TraceMetricsSummary'
import { TimelineFilter, TraceTimeline } from './TraceTimeline'
import { deriveTraceMetrics } from '../trace/metrics'
import { traceStore, subscribeTraceStore } from '../trace/store'
import type { TraceEvent } from '../trace/types'
import { displaySessionId, statusFor } from '../utils/formatting'

type InspectorMode = 'live' | 'history'

const MODE_OPTIONS = [
  { id: 'live', label: 'Live' },
  { id: 'history', label: 'History' }
]

function MetadataValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-(--ui-text-tertiary)">{label}</div>
      <div className={mono ? 'truncate font-mono text-xs text-foreground' : 'truncate text-sm font-medium text-foreground'} title={value}>
        {value}
      </div>
    </div>
  )
}

export function AgentInspectorPage({ rest }: { rest: PluginRest }) {
  const focusedSessionId = useValue(host.state.focusedSessionId)
  const activeSessionId = useValue(host.state.activeSessionId)
  const model = useValue(host.state.model)
  const gateway = useValue(host.state.gateway)
  const busy = useValue(host.state.busy)
  const awaitingResponse = useValue(host.state.awaitingResponse)
  const [liveEvents, setLiveEvents] = useState<TraceEvent[]>(() => traceStore.events)
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [listenerState, setListenerState] = useState<'loading' | 'ready' | 'error'>(() => (traceStore.started ? 'ready' : 'loading'))
  const [listenerError, setListenerError] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [mode, setMode] = useState<InspectorMode>('live')
  const [historyRuns, setHistoryRuns] = useState<RunSummary[]>([])
  const [historyState, setHistoryState] = useState<RunHistoryState>('loading')
  const [historyError, setHistoryError] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [historicalRun, setHistoricalRun] = useState<PersistedRun | null>(null)
  const [historicalRunState, setHistoricalRunState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [historicalRunError, setHistoricalRunError] = useState('')

  useEffect(() => {
    return subscribeTraceStore((nextEvents, error) => {
      setLiveEvents(nextEvents)
      setListenerError(error)
      setListenerState(error ? 'error' : 'ready')
    })
  }, [])

  useEffect(() => {
    if (mode !== 'history') {
      return
    }

    let cancelled = false
    setHistoryState('loading')
    setHistoryError('')

    void loadRuns(rest)
      .then(runs => {
        if (!cancelled) {
          setHistoryRuns(runs)
          setHistoryState('ready')
        }
      })
      .catch(error => {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : 'Unable to load saved runs')
          setHistoryState('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, rest])

  const selectRun = (runId: string) => {
    setSelectedRunId(runId)
    setHistoricalRun(null)
    setHistoricalRunState('loading')
    setHistoricalRunError('')
    setSelectedEventId(null)

    void loadRun(rest, runId)
      .then(run => {
        setHistoricalRun(run)
        setHistoricalRunState('idle')
      })
      .catch(error => {
        setHistoricalRunError(error instanceof Error ? error.message : 'Unable to load this run')
        setHistoricalRunState('error')
      })
  }

  const selectedMode = (value: string) => {
    if (value !== 'live' && value !== 'history') {
      return
    }

    setMode(value)
    setSelectedEventId(null)
    if (value === 'live') {
      setSelectedRunId(null)
      setHistoricalRun(null)
      setHistoricalRunState('idle')
    }
  }

  const events = mode === 'history' ? historicalRun?.events || [] : liveEvents
  const selectedTool = events.find(event => event.id === selectedEventId && (event.category === 'tool' || Boolean(event.toolName))) || null
  const metrics = useMemo(() => deriveTraceMetrics(events), [events])
  const liveStatus = statusFor(gateway, busy, awaitingResponse)
  const shownSessionId = mode === 'history' ? historicalRun?.sessionId || null : focusedSessionId || activeSessionId
  const shownModel = mode === 'history' ? historicalRun?.model || 'Not recorded' : model || 'Not reported'
  const shownStatus =
    mode === 'history' && historicalRun
      ? historicalRun.status === 'error'
        ? { label: 'failed', tone: 'bad' as const }
        : { label: 'completed', tone: 'good' as const }
      : liveStatus
  const timelineState = mode === 'history' ? (historicalRunState === 'loading' ? 'loading' : historicalRunState === 'error' ? 'error' : 'ready') : listenerState
  const timelineError = mode === 'history' && historicalRunState === 'error' ? historicalRunError : listenerError

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-(--ui-text-tertiary)">Developer surface</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Agent Inspector</h1>
          <p className="max-w-xl text-sm text-(--ui-text-secondary)">{mode === 'live' ? 'Live execution timeline for the focused Hermes session.' : 'Browse completed Hermes execution traces.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={selectedMode} />
          <div className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
            <StatusDot tone={shownStatus.tone} />
            <span>{shownStatus.label}</span>
            <span className="text-(--ui-text-quaternary)">·</span>
            <span className="font-mono tabular-nums">{events.length} events</span>
          </div>
        </div>
      </header>
      <section aria-label="Current session details" className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-3 py-2.5">
          <MetadataValue label="Session ID" mono value={shownSessionId ? displaySessionId(shownSessionId) : mode === 'history' ? 'Select a run' : 'No active session'} />
        </div>
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-3 py-2.5">
          <MetadataValue label="Model" value={shownModel} />
        </div>
        <div className="rounded-md border border-(--ui-stroke-secondary) bg-background/40 px-3 py-2.5">
          <div className="flex items-end justify-between gap-3">
            <MetadataValue label="Gateway" value={mode === 'history' ? 'historical' : gateway || 'Unknown'} />
            <Badge size="xs" variant={shownStatus.tone === 'good' ? 'default' : shownStatus.tone === 'warn' ? 'warn' : 'muted'}>{shownStatus.label}</Badge>
          </div>
        </div>
      </section>
      <Separator />
      {mode === 'history' ? (
        <RunHistory runs={historyRuns} state={historyState} error={historyError} selectedRunId={selectedRunId} onSelect={selectRun} />
      ) : null}
      <TraceMetricsSummary metrics={metrics} />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_25rem]">
        <TraceTimeline
          events={events}
          filter={filter}
          listenerState={timelineState}
          listenerError={timelineError}
          selectedEventId={selectedEventId}
          onFilterChange={setFilter}
          onSelectEvent={setSelectedEventId}
          emptyTitle={mode === 'history' ? 'Select a completed run' : undefined}
          emptyDescription={mode === 'history' ? 'Choose a run above to inspect its normalized execution timeline.' : undefined}
        />
        {selectedTool ? (
          <div className="grid min-h-0 min-w-0 grid-cols-[1px_minmax(0,1fr)] gap-3">
            <Separator className="hidden lg:block" orientation="vertical" />
            <ToolInspector event={selectedTool} onClose={() => setSelectedEventId(null)} />
          </div>
        ) : null}
      </div>
    </main>
  )
}
