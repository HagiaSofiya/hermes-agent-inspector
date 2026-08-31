# Agent Inspector architecture

Agent Inspector is a Desktop-side observability surface built around the
focused Hermes session, with a run collector that can track multiple
sessions' runs at once in the background. It has two cooperating halves, a
bundled TypeScript/React Desktop plugin and a small Python API mounted by
Hermes for completed-run storage.

## Ingestion

`src/plugin.tsx` registers the `/agent-inspector` route and sidebar entry,
then calls `startTraceCollection()` (`src/trace/store.ts`) for the lifetime
of the plugin. That function subscribes to `host.onEvent('*')`.

Hermes delivers gateway envelopes with an event `type`, an optional
`session_id`, and an opaque `payload`. `src/trace/normalizer.ts` is the only
layer that interprets those Hermes-specific shapes. It produces `TraceEvent`
objects with stable local IDs, UI categories, status, summaries, and tool
metadata.

The normalizer mirrors two independent kinds of stream semantics.

Model turns:

- `message.start` creates a pending model event.
- Model delta, thinking, and reasoning events replace that model event
  instead of creating one row per token or signal.
- `message.complete` replaces the model event and adds an assistant
  response.

Tool calls:

- `tool.start`, `tool.progress`, and `tool.complete` replace one correlated
  tool event rather than appending new rows.
- Correlation checks `tool_id`, then `tool_call_id`, then `id`. When Hermes
  provides none of those, a same-name FIFO queue matches the next pending
  call for that tool name instead.

Session attribution for events without an explicit `session_id` follows the
session established at the active `message.start`, falling back to whichever
session is currently focused or active. The raw payload stays available on
the normalized event for inspection, but React components never need to
understand its Hermes-specific shape. The plugin also does not fabricate
submitted prompt text, since the current Hermes Desktop event contract
doesn't expose it through the plugin event stream.

## Live state and UI

`src/trace/store.ts` owns the bounded in-memory live trace. It keeps the
latest 250 normalized events, applies replacement IDs, publishes snapshots to
React, and records normalization errors without stopping the event
subscription.

The page derives metrics with the pure `deriveTraceMetrics(events)` function.
Timeline filters change only the visible rows; metrics are always computed
from the complete current trace, not the filtered view. The Tool Inspector
stores only a selected event ID and looks up the current normalized event on
each render, so progress and completion replacements can't leave stale
detail content behind.

## Completed-run boundary

`src/trace/runs.ts` maintains a small collector of active runs keyed by
Hermes session. Each run begins at normalized `message.start` and closes on
`message.complete` or a terminal `error`. It applies the same normalized
replacement semantics as the live store, so persisted traces contain final
normalized events rather than raw streaming updates.

Interleaved session A and B events can't overwrite one another, since each
session tracks its own active run. If a startup race produces `message.start`
without a session ID, a later explicit session event adopts that one
unresolved run rather than leaving it stranded. An event that arrives with no
session ID while multiple runs are active, and so can't be safely attributed
to any of them, is left unassigned instead of being attached to the wrong
run.

The collector derives a stable run ID from the session ID and the normalized
start timestamp, so it doesn't need an upstream Hermes run identifier that
the current event contract doesn't expose. It emits one completed run;
`src/plugin.tsx` converts that run to a JSON-safe `CreateRunPayload` and makes
one `ctx.rest('/runs', { method: 'POST' })` call. Persistence failure is
caught and logged, and it does not interrupt live collection or rendering.

## Backend boundary and storage

Hermes mounts `backend/plugin_api.py` from the unified package's `dashboard/`
directory as a scoped router under `/api/plugins/agent-inspector/`. The
Desktop plugin reaches it through `ctx.rest`, which is profile-aware and
doesn't require a custom port.

Python validates the request with Pydantic models in `backend/models.py`. The
backend owns no normalization logic and doesn't calculate frontend metrics.
`backend/db.py` uses the standard-library `sqlite3` module and stores one row
per completed run, with the normalized event list JSON-encoded in the row.
Its route handlers are synchronous FastAPI functions, so that SQLite work
runs in FastAPI's threadpool instead of blocking the gateway event loop.

The database path is:

```text
get_hermes_home() / "agent-inspector" / "runs.db"
```

The API intentionally stays small:

```text
GET  /runs          lightweight summaries for History
GET  /runs/{runId}  one complete persisted normalized trace
POST /runs          validate and insert one completed run
```

`run_id` is the SQLite primary key, and inserts use `INSERT OR IGNORE`,
making a replayed completion event safe. There are no update or delete
endpoints, since this milestone only needs append-once completed-run
history.

## History

`src/api/runs.ts` is the only frontend transport module. History mode loads
lightweight run summaries first, then fetches a selected run's full trace.
Both Live and History mode feed their `TraceEvent[]` into the same timeline,
metrics, filters, and Tool Inspector components, so nothing about the UI
needs to know which mode produced the data.

History loading and persistence errors are presented as UI states. Live mode
does not require the backend to be reachable at all.

## Tradeoffs

- A bounded, 250-event in-memory trace keeps the Desktop surface responsive
  and avoids accidental unbounded stream retention.
- TypeScript owns event meaning, since it's already adjacent to Hermes's
  verified Desktop event contract.
- Python is deliberately thin. It provides a clean language boundary and
  durable local history without introducing an ORM or a second analytics
  implementation.
- The run ID uses available normalized boundary data rather than inventing
  an upstream Hermes identifier that the current event contract doesn't
  expose.
- The unified install is required for History. The standalone
  `desktop-plugins` door remains useful for Live-only development.
