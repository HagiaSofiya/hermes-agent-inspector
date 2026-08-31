"""Populate three explicit demo runs in Agent Inspector's local history.

This is development tooling only. It is never imported by the Hermes plugin.
The fixed IDs make the command safe to run repeatedly: existing demo records
are left unchanged by the backend's idempotent insert behavior.
"""

from __future__ import annotations

import time
import sys
from pathlib import Path
from typing import Any

# The fixture is executed as a script, so make the repository package importable
# without requiring a package install or PYTHONPATH configuration.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.db import init_db, insert_run
from backend.models import PersistedRun, TraceEventModel


def event(
    *,
    event_id: str,
    timestamp: int,
    category: str,
    event_type: str,
    title: str,
    summary: str,
    status: str,
    raw_payload: dict[str, Any],
    tool_name: str | None = None,
    duration_ms: int | None = None,
    input_value: Any = None,
    output_value: Any = None,
) -> TraceEventModel:
    return TraceEventModel(
        id=event_id,
        timestamp=timestamp,
        category=category,
        eventType=event_type,
        sessionId="demo-session",
        title=title,
        summary=summary,
        status=status,
        toolName=tool_name,
        durationMs=duration_ms,
        input=input_value,
        output=output_value,
        rawPayload=raw_payload,
    )


def run(
    *,
    run_id: str,
    started_at: int,
    completed_at: int,
    model: str,
    status: str,
    runtime_ms: int,
    tool_call_count: int,
    failed_tool_count: int,
    events: list[TraceEventModel],
) -> PersistedRun:
    return PersistedRun(
        runId=run_id,
        sessionId="demo-session",
        startedAt=started_at,
        completedAt=completed_at,
        model=model,
        status=status,
        runtimeMs=runtime_ms,
        toolCallCount=tool_call_count,
        failedToolCount=failed_tool_count,
        events=events,
    )


def build_runs(now: int) -> list[PersistedRun]:
    model = "upstage/solar-pro4:free"

    successful = run(
        run_id="demo-successful-run",
        started_at=now - 36_000,
        completed_at=now - 23_600,
        model=model,
        status="success",
        runtime_ms=12_400,
        tool_call_count=3,
        failed_tool_count=0,
        events=[
            event(event_id="success-model", timestamp=now - 36_000, category="model", event_type="message.complete", title="Generation complete", summary="Model generation finished", status="success", raw_payload={"text": "I inspected the repository and summarized the key files."}, duration_ms=4_200, output_value="I inspected the repository and summarized the key files."),
            event(event_id="success-read", timestamp=now - 34_800, category="tool", event_type="tool.complete", title="Success", summary="README.md loaded", status="success", raw_payload={"name": "read_file", "result": "..."}, tool_name="read_file", duration_ms=114, input_value={"path": "README.md"}, output_value="# Agent Inspector"),
            event(event_id="success-search", timestamp=now - 32_100, category="tool", event_type="tool.complete", title="Success", summary="14 matching files", status="success", raw_payload={"name": "search_files", "result_count": 14}, tool_name="search_files", duration_ms=1_800, input_value={"query": "plugin-sdk"}, output_value={"matches": 14}),
            event(event_id="success-response", timestamp=now - 23_600, category="response", event_type="message.complete", title="Complete", summary="Repository inspection complete", status="success", raw_payload={"text": "Repository inspection complete"}, output_value="Repository inspection complete"),
        ],
    )

    failed = run(
        run_id="demo-failed-tool-run",
        started_at=now - 82_000,
        completed_at=now - 73_800,
        model=model,
        status="error",
        runtime_ms=8_200,
        tool_call_count=2,
        failed_tool_count=1,
        events=[
            event(event_id="failed-model", timestamp=now - 82_000, category="model", event_type="message.complete", title="Generation complete", summary="Model generated a plan", status="success", raw_payload={"text": "I will inspect the configuration."}, duration_ms=3_100),
            event(event_id="failed-read", timestamp=now - 79_500, category="tool", event_type="tool.complete", title="Success", summary="config.yaml loaded", status="success", raw_payload={"name": "read_file"}, tool_name="read_file", duration_ms=220, input_value={"path": "config.yaml"}, output_value="plugins.enabled: []"),
            event(event_id="failed-write", timestamp=now - 74_000, category="error", event_type="tool.complete", title="Tool execution failed", summary="Permission denied while writing config.yaml", status="error", raw_payload={"name": "write_file", "error": "Permission denied"}, tool_name="write_file", duration_ms=3_600, input_value={"path": "config.yaml"}, output_value={"error": "Permission denied"}),
            event(event_id="failed-response", timestamp=now - 73_800, category="response", event_type="message.complete", title="Assistant response failed", summary="The assistant could not complete the requested change", status="error", raw_payload={"error": "tool failure"}),
        ],
    )

    slow = run(
        run_id="demo-slow-run",
        started_at=now - 145_000,
        completed_at=now - 120_300,
        model=model,
        status="success",
        runtime_ms=24_700,
        tool_call_count=3,
        failed_tool_count=0,
        events=[
            event(event_id="slow-model", timestamp=now - 145_000, category="model", event_type="message.complete", title="Generation complete", summary="Model generation finished", status="success", raw_payload={"text": "I analyzed the project structure."}, duration_ms=8_900),
            event(event_id="slow-search", timestamp=now - 136_000, category="tool", event_type="tool.complete", title="Success", summary="Search completed", status="success", raw_payload={"name": "search_files"}, tool_name="search_files", duration_ms=6_200, input_value={"query": "trace"}, output_value={"matches": 42}),
            event(event_id="slow-read", timestamp=now - 129_000, category="tool", event_type="tool.complete", title="Success", summary="Source files loaded", status="success", raw_payload={"name": "read_file"}, tool_name="read_file", duration_ms=2_400, input_value={"path": "src/trace/normalizer.ts"}, output_value="..."),
            event(event_id="slow-response", timestamp=now - 120_300, category="response", event_type="message.complete", title="Complete", summary="Analysis complete", status="success", raw_payload={"text": "Analysis complete"}),
        ],
    )

    return [successful, failed, slow]


def main() -> None:
    init_db()
    for demo_run in build_runs(int(time.time() * 1000)):
        insert_run(demo_run)
    print("Seeded Agent Inspector demo history: 3 runs")


if __name__ == "__main__":
    main()
