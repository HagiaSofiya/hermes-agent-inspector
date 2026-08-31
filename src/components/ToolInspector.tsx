import { Badge, Button, CopyButton, ScrollArea } from '@hermes/plugin-sdk'

import type { TraceEvent } from '../trace/types'
import { formatDuration, statusLabel } from '../utils/formatting'
import { prettyPrintValue } from '../utils/serialization'

function InspectorMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.13em] text-(--ui-text-tertiary)">{label}</div>
      <div className={mono ? 'break-all font-mono text-xs text-foreground' : 'text-sm font-medium text-foreground'} title={value}>
        {value}
      </div>
    </div>
  )
}

function ToolPayloadSection({ label, value }: { label: string; value: unknown }) {
  const serialized = prettyPrintValue(value)

  return (
    <section className="grid min-h-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-(--ui-text-tertiary)">{label}</h3>
        <CopyButton buttonSize="xs" buttonVariant="ghost" text={serialized} title={'Copy ' + label.toLowerCase()}>
          Copy
        </CopyButton>
      </div>
      <ScrollArea className="max-h-64 min-h-12 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary)">
        <pre className="whitespace-pre-wrap break-words p-2.5 font-mono text-[0.68rem] leading-relaxed text-(--ui-text-secondary)">
          {serialized}
        </pre>
      </ScrollArea>
    </section>
  )
}

export function ToolInspector({ event, onClose }: { event: TraceEvent; onClose: () => void }) {
  const statusVariant = event.status === 'error' ? 'destructive' : event.status === 'pending' ? 'warn' : 'default'

  return (
    <aside aria-label="Tool Inspector" className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md border border-(--ui-stroke-secondary) bg-background/40">
      <header className="flex items-start justify-between gap-3 border-b border-(--ui-stroke-secondary) px-3 py-3">
        <div className="min-w-0 space-y-1">
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.15em] text-(--ui-text-tertiary)">Tool Inspector</div>
          <h2 className="truncate font-mono text-base font-semibold text-foreground">{event.toolName || event.title}</h2>
        </div>
        <Button aria-label="Close Tool Inspector" onClick={onClose} size="icon-xs" title="Close inspector" variant="ghost">
          ×
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary) px-2.5 py-2">
            <span className="text-xs text-(--ui-text-secondary)">Status</span>
            <Badge size="xs" variant={statusVariant}>{statusLabel(event.status)}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InspectorMeta label="Event" mono value={event.eventType} />
            <InspectorMeta label="Duration" mono value={event.durationMs === undefined ? '—' : formatDuration(event.durationMs)} />
            <InspectorMeta label="Timestamp" mono value={new Date(event.timestamp).toLocaleString()} />
            <InspectorMeta label="Session" mono value={event.sessionId || '—'} />
          </div>
          <ToolPayloadSection label="Input" value={event.input} />
          <ToolPayloadSection label="Output" value={event.output} />
          <ToolPayloadSection label="Raw payload" value={event.rawPayload} />
        </div>
      </ScrollArea>
    </aside>
  )
}
