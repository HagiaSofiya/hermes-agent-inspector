from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

try:
    from .models import PersistedRun
except ImportError:  # Hermes imports plugin_api.py as a standalone module.
    try:
        from _agent_inspector_models import PersistedRun
    except ImportError:
        from models import PersistedRun

DB_FILENAME = "runs.db"


def database_path(home: Path | None = None) -> Path:
    if home is None:
        from hermes_constants import get_hermes_home

        home = Path(get_hermes_home())

    return home / "agent-inspector" / DB_FILENAME


def _connect(path: Path | None = None) -> sqlite3.Connection:
    resolved = path or database_path()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(resolved, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def init_db(path: Path | None = None) -> None:
    with _connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                session_id TEXT,
                started_at INTEGER NOT NULL,
                completed_at INTEGER NOT NULL,
                model TEXT,
                status TEXT NOT NULL CHECK (status IN ('success', 'error')),
                runtime_ms REAL,
                tool_call_count INTEGER NOT NULL,
                failed_tool_count INTEGER NOT NULL,
                events_json TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            )
            """
        )


def _row_to_record(row: sqlite3.Row) -> dict[str, Any]:
    record = dict(row)
    record["runId"] = record.pop("run_id")
    record["sessionId"] = record.pop("session_id")
    record["startedAt"] = record.pop("started_at")
    record["completedAt"] = record.pop("completed_at")
    record["runtimeMs"] = record.pop("runtime_ms")
    record["toolCallCount"] = record.pop("tool_call_count")
    record["failedToolCount"] = record.pop("failed_tool_count")
    record.pop("created_at", None)
    record["events"] = json.loads(record.pop("events_json"))
    return record


def _row_to_summary(row: sqlite3.Row) -> dict[str, Any]:
    record = dict(row)
    return {
        "runId": record["run_id"],
        "sessionId": record["session_id"],
        "startedAt": record["started_at"],
        "completedAt": record["completed_at"],
        "model": record["model"],
        "status": record["status"],
        "runtimeMs": record["runtime_ms"],
        "toolCallCount": record["tool_call_count"],
        "failedToolCount": record["failed_tool_count"],
    }


def insert_run(run: PersistedRun, path: Path | None = None) -> PersistedRun:
    payload = run.model_dump(mode="json")

    with _connect(path) as connection:
        connection.execute(
            """
            INSERT OR IGNORE INTO runs (
                run_id, session_id, started_at, completed_at, model, status,
                runtime_ms, tool_call_count, failed_tool_count, events_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["runId"],
                payload["sessionId"],
                payload["startedAt"],
                payload["completedAt"],
                payload["model"],
                payload["status"],
                payload["runtimeMs"],
                payload["toolCallCount"],
                payload["failedToolCount"],
                json.dumps(payload["events"], ensure_ascii=False, separators=(",", ":")),
            ),
        )

        row = connection.execute("SELECT * FROM runs WHERE run_id = ?", (run.runId,)).fetchone()

    if row is None:
        raise RuntimeError("Run was not available after persistence")

    return PersistedRun.model_validate(_row_to_record(row))


def get_run(run_id: str, path: Path | None = None) -> PersistedRun | None:
    with _connect(path) as connection:
        row = connection.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()

    return PersistedRun.model_validate(_row_to_record(row)) if row else None


def list_runs(limit: int = 50, path: Path | None = None) -> list[PersistedRun]:
    with _connect(path) as connection:
        rows = connection.execute(
            "SELECT * FROM runs ORDER BY completed_at DESC, created_at DESC LIMIT ?", (limit,)
        ).fetchall()

    return [PersistedRun.model_validate(_row_to_record(row)) for row in rows]


def list_run_summaries(limit: int = 50, path: Path | None = None) -> list[dict[str, Any]]:
    with _connect(path) as connection:
        rows = connection.execute(
            """
            SELECT run_id, session_id, started_at, completed_at, model, status,
                   runtime_ms, tool_call_count, failed_tool_count
            FROM runs
            ORDER BY completed_at DESC, created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [_row_to_summary(row) for row in rows]
