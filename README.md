# Agent Inspector

Developer observability for Hermes Agent. Inspect live agent execution, tool
calls, failures, latency, and historical runs directly inside Hermes Desktop.

Agent Inspector makes autonomous agent behavior understandable while it is
happening and debuggable afterward.

## Demo

### Live tab

<video src="docs/videos/agent-inspector-live-start.mov" controls width="720"></video>

A live run starting, with the timeline picking up model and tool events as
they stream in.

<video src="docs/videos/agent-inspector-live-end.mov" controls width="720"></video>

The same run after it finishes, clicking through the timeline, metrics, and
Tool Inspector to explore what happened.

### History tab

<video src="docs/videos/agent-inspector-history.mov" controls width="720"></video>

A historical run, showing persisted timeline events, metrics, tool details,
and debugging context.

## Why

Autonomous agents can execute many hidden model and tool steps. When a run is
slow or fails, a final response alone does not explain what happened.

Agent Inspector exposes that execution as a compact, human-readable timeline
inside the environment where Hermes development already happens.

## Features

- Live Hermes execution timeline
- Model, tool, system, response, and error normalization
- Correlated tool lifecycle from start through progress to completion
- Failed tool calls visible in both Tools and Errors views
- Detailed tool input/output/raw event inspection
- Runtime, tool, failure, latency, slowest-tool, and model-generation metrics
- Historical completed-run persistence through a scoped Python API and SQLite
- All / Model / Tools / Errors filtering
- Polished loading, empty, and error states
- Graceful live-mode operation when the history backend is unavailable

## Architecture

```mermaid
flowchart LR
    G[Hermes gateway event stream<br/>host.onEvent('*')] --> N[src/trace/normalizer.ts<br/>TypeScript normalization]
    N --> T[TraceEvent domain model]
    T --> L[Live React UI<br/>timeline · metrics · Tool Inspector]
    T --> C[src/trace/runs.ts<br/>completed-run boundary]
    C --> P[src/api/runs.ts<br/>createRunPayload + ctx.rest]
    P --> A[backend/plugin_api.py<br/>scoped FastAPI router]
    A --> D[backend/db.py<br/>SQLite at Hermes home]
    D --> H[History UI<br/>same timeline, metrics, and Tool Inspector]
```

The Python backend is mounted by Hermes under
`/api/plugins/agent-inspector/`; it does not run a custom localhost server.

## Important design decisions

### Normalization boundary

Raw Hermes gateway payloads never leak directly into React components.
`src/trace/normalizer.ts` translates the verified Hermes event envelope into the
UI-facing `TraceEvent` model. This keeps Hermes-specific payload handling in one
small, testable boundary.

### Event correlation

`tool.start`, `tool.progress`, and `tool.complete` update one normalized tool
execution. This prevents streaming/update events from inflating the timeline,
metrics, or persisted trace. Failed tool completions retain their `toolName`,
so they remain discoverable in the Tools filter as well as Errors.

### Live vs persistence

TypeScript owns real-time event interpretation, replacement semantics, run
boundaries, and UI metrics. Python owns validated storage and retrieval. The
backend receives one completed normalized run rather than an unbounded gateway
stream.

### Concurrent sessions

The UI follows the focused/active Hermes session, while the run collector keeps
independent active runs keyed by session ID. Interleaved sessions cannot
overwrite each other. If a startup race produces `message.start` without a
session ID, a later explicit session event adopts that unresolved run. An
ambiguous unscoped event is left unassigned rather than attached to the wrong
session.

### Runtime artifact

The source is modular TypeScript/TSX. Hermes ultimately loads one ESM runtime
artifact, `dist/plugin.js`. Hermes-provided SDK and React imports remain
external to that bundle.

### Backend boundary and storage

Hermes mounts `backend/plugin_api.py` from the unified package's `dashboard/`
directory under `/api/plugins/agent-inspector/`. The Desktop plugin calls it
through profile-aware `ctx.rest`; there is no custom localhost port. Pydantic
validates the contract, and standard-library `sqlite3` stores one row per
completed run at:

```text
get_hermes_home() / "agent-inspector" / "runs.db"
```

The API remains deliberately small:

```text
GET  /runs          lightweight History summaries
GET  /runs/{runId}  complete normalized trace
POST /runs          validated completed-run insert
```

The SQLite primary key is `run_id`, and inserts are idempotent. Database routes
are synchronous FastAPI handlers so SQLite work runs in FastAPI's threadpool
instead of blocking the gateway event loop. The backend does not normalize
events or duplicate frontend metric calculations.

### Graceful degradation

Live trace collection does not depend on successful persistence. If the Python
API is disabled or unavailable, the timeline continues to update; History
shows an appropriate error state.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full write-up,
including the model-turn and tool-correlation semantics and the design
tradeoffs behind them.

## Repository structure

```text
backend/
  db.py                 SQLite storage and lightweight summary queries
  manifest.json         Hermes dashboard backend declaration
  models.py             Pydantic API/domain validation models
  plugin_api.py         FastAPI routes mounted by Hermes
src/
  api/runs.ts           Typed frontend/backend transport boundary
  components/           Agent Inspector, history, timeline, metrics, tooling UI
  plugin.tsx            Hermes plugin registration and lifecycle wiring
  trace/
    metrics.ts          Pure metrics derivation
    normalizer.ts       Hermes event → TraceEvent normalization
    runs.ts             Session-keyed completed-run collector
    store.ts            In-memory live trace store
    types.ts            TraceEvent, TraceMetrics, and normalization types
  utils/                Formatting and JSON-safe serialization
types/
  hermes-plugin-sdk.d.ts Hand-maintained Hermes plugin SDK contract
tests/
  *.test.ts             Frontend normalization, metrics, and run tests
  python/test_backend.py SQLite/Pydantic persistence tests
scripts/
  build.mjs             esbuild runtime bundle
  install-local.mjs     Unified Hermes package installer
  seed_demo_runs.py     Development-only historical demo fixtures
dist/plugin.js          Bundled Hermes Desktop runtime artifact
```

## Local development

Install JavaScript tooling and run the frontend checks:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Python tests should use the Python environment Hermes uses at runtime because
FastAPI and Pydantic are Hermes-provided dependencies:

```bash
/path/to/hermes-agent/venv/bin/python -m unittest discover \
  -s tests/python -p 'test_*.py'
```

### Installing the full plugin

For Live plus History, install the unified package:

```bash
HERMES_HOME=/path/to/.hermes npm run install:local
```

This creates:

```text
$HERMES_HOME/plugins/agent-inspector/
  desktop/plugin.js
  dashboard/manifest.json
  dashboard/plugin_api.py
  dashboard/db.py
  dashboard/models.py
```

Then enable the Desktop half in Hermes Settings → Plugins. Add
`agent-inspector` to the `plugins.enabled` list in Hermes `config.yaml`, then
restart the Hermes gateway so the Python routes mount. Use “Reload desktop
plugins” after updating the bundle.

For a Desktop-only Live install, copy the runtime artifact to the standalone
disk-plugin door:

```bash
mkdir -p "$HERMES_HOME/desktop-plugins/agent-inspector"
cp dist/plugin.js "$HERMES_HOME/desktop-plugins/agent-inspector/plugin.js"
```

That standalone path does not provide the Python History backend. Do not keep
both the standalone and unified copies enabled with the same plugin ID.

## Demo data

Seed three clearly labeled development runs (successful, failed-tool, and
slow) into the configured Hermes history database:

```bash
HERMES_HOME=/path/to/.hermes \
HERMES_PYTHON=/path/to/hermes-agent/venv/bin/python \
npm run seed:demo
```

The fixture script is [scripts/seed_demo_runs.py](scripts/seed_demo_runs.py).
It is never imported by the plugin and uses fixed IDs with idempotent inserts,
so rerunning it does not create duplicates. These fixtures are demo data only;
normal production persistence still begins at a real Hermes `message.start`
and ends at a real terminal event.

## Scope

This project intentionally does not include model comparison, routing, external
APIs, authentication, LLM calls, embeddings, RAG, charts, or a Python agent
runtime. It is focused on making one Hermes execution trace useful to a human
developer.
