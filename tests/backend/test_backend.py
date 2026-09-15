from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.db import USAGE_COLUMNS, get_run, init_db, insert_run, list_run_summaries, list_runs
from backend.models import CreateRunPayload, PersistedRun
from backend.pricing import resolve_pricing


def sample_payload(run_id: str = "run:test:1") -> CreateRunPayload:
    return CreateRunPayload(
        runId=run_id,
        sessionId="session-1",
        startedAt=1000,
        completedAt=1250,
        model="test-model",
        status="success",
        runtimeMs=250,
        toolCallCount=1,
        failedToolCount=0,
        events=[
            {
                "id": "tool:1",
                "timestamp": 1200,
                "category": "tool",
                "eventType": "tool.complete",
                "sessionId": "session-1",
                "title": "Success",
                "summary": "done",
                "status": "success",
                "toolName": "read_file",
                "durationMs": 100,
                "input": {"path": "README.md"},
                "output": "ok",
                "rawPayload": {"result": "ok"},
            }
        ],
    )


class BackendPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "runs.db"
        init_db(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_stores_and_retrieves_a_run(self) -> None:
        payload = sample_payload()
        stored = insert_run(PersistedRun.model_validate(payload.model_dump()), self.db_path)

        self.assertEqual(stored.runId, payload.runId)
        self.assertEqual(get_run(payload.runId, self.db_path).events[0].toolName, "read_file")

    def test_lists_lightweight_runs_in_completion_order(self) -> None:
        insert_run(PersistedRun.model_validate(sample_payload("run:1").model_dump()), self.db_path)
        later = sample_payload("run:2")
        later.completedAt = 2000
        insert_run(PersistedRun.model_validate(later.model_dump()), self.db_path)

        self.assertEqual([run.runId for run in list_runs(path=self.db_path)], ["run:2", "run:1"])

        summaries = list_run_summaries(path=self.db_path)
        self.assertEqual(summaries[0]["runId"], "run:2")
        self.assertNotIn("events", summaries[0])

    def test_duplicate_run_id_is_idempotent(self) -> None:
        first = PersistedRun.model_validate(sample_payload().model_dump())
        second_data = sample_payload().model_dump()
        second_data["model"] = "different-model"
        second = PersistedRun.model_validate(second_data)

        insert_run(first, self.db_path)
        stored = insert_run(second, self.db_path)

        self.assertEqual(stored.model, "test-model")
        self.assertEqual(len(list_runs(path=self.db_path)), 1)

    def test_malformed_payload_is_rejected(self) -> None:
        data = sample_payload().model_dump()
        data["events"][0]["status"] = "not-a-status"

        with self.assertRaises(ValueError):
            CreateRunPayload.model_validate(data)


# The schema as it shipped before token accounting existed. Recreating it
# verbatim is the only honest way to prove the migration works on the
# databases that are already out there.
LEGACY_SCHEMA = """
    CREATE TABLE runs (
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


class UsageMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "runs.db"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _seed_legacy_row(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(LEGACY_SCHEMA)
            connection.execute(
                """
                INSERT INTO runs (
                    run_id, session_id, started_at, completed_at, model, status,
                    runtime_ms, tool_call_count, failed_tool_count, events_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "run:legacy:1",
                    "session-legacy",
                    1000,
                    1250,
                    "test-model",
                    "success",
                    250,
                    0,
                    0,
                    json.dumps(
                        [
                            {
                                "id": "done",
                                "timestamp": 1200,
                                "category": "response",
                                "eventType": "message.complete",
                                "sessionId": "session-legacy",
                                "title": "Done",
                                "summary": "done",
                                "status": "success",
                            }
                        ]
                    ),
                ),
            )

    def test_adds_usage_columns_to_an_existing_database(self) -> None:
        self._seed_legacy_row()

        init_db(self.db_path)

        with sqlite3.connect(self.db_path) as connection:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(runs)")}

        for column, _type in USAGE_COLUMNS:
            self.assertIn(column, columns)

    def test_legacy_rows_survive_the_migration_with_empty_usage(self) -> None:
        self._seed_legacy_row()

        init_db(self.db_path)

        summary = list_run_summaries(path=self.db_path)[0]
        self.assertEqual(summary["runId"], "run:legacy:1")
        # Null, not zero: these runs have no token data, they did not use none.
        self.assertIsNone(summary["totalTokens"])
        self.assertIsNone(summary["costUsd"])

        stored = get_run("run:legacy:1", path=self.db_path)
        assert stored is not None
        self.assertIsNone(stored.totalTokens)

    def test_migration_is_repeatable(self) -> None:
        self._seed_legacy_row()

        init_db(self.db_path)
        init_db(self.db_path)

        self.assertEqual(len(list_run_summaries(path=self.db_path)), 1)

    def test_round_trips_usage_for_a_new_run(self) -> None:
        init_db(self.db_path)
        payload = sample_payload()
        payload.promptTokens = 20108
        payload.completionTokens = 111
        payload.totalTokens = 20219
        payload.sessionTotalTokens = 40574
        payload.apiCalls = 1
        payload.contextPercent = 4
        payload.costUsd = 0.10219

        insert_run(PersistedRun.model_validate(payload.model_dump()), self.db_path)

        summary = list_run_summaries(path=self.db_path)[0]
        self.assertEqual(summary["totalTokens"], 20219)
        self.assertEqual(summary["sessionTotalTokens"], 40574)
        self.assertEqual(summary["contextPercent"], 4)
        self.assertAlmostEqual(summary["costUsd"], 0.10219)


class PricingTests(unittest.TestCase):
    CATALOG = {
        "anthropic": {"models": {"claude-opus-5": {"cost": {"input": 5, "output": 25}}}},
        "upstage": {"models": {"solar-pro4": {"cost": {"input": 0.3, "output": 1.2}}}},
        "local": {"models": {"tinyllama": {}}},
    }

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.catalog_path = Path(self.temp_dir.name) / "models_dev_cache.json"
        self.catalog_path.write_text(json.dumps(self.CATALOG), encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_resolves_a_provider_prefixed_model(self) -> None:
        self.assertEqual(
            resolve_pricing("anthropic/claude-opus-5", self.catalog_path),
            {"inputPerMillion": 5.0, "outputPerMillion": 25.0},
        )

    def test_searches_every_provider_for_a_bare_model_id(self) -> None:
        self.assertEqual(
            resolve_pricing("claude-opus-5", self.catalog_path),
            {"inputPerMillion": 5.0, "outputPerMillion": 25.0},
        )

    def test_free_variants_cost_nothing(self) -> None:
        # Never the base model's rate: stripping ":free" and falling through to
        # solar-pro4 would bill a free run at 0.3/1.2.
        self.assertEqual(
            resolve_pricing("upstage/solar-pro4:free", self.catalog_path),
            {"inputPerMillion": 0.0, "outputPerMillion": 0.0},
        )

    def test_paid_suffixed_variant_falls_back_to_the_base_model(self) -> None:
        self.assertEqual(
            resolve_pricing("upstage/solar-pro4:nitro", self.catalog_path),
            {"inputPerMillion": 0.3, "outputPerMillion": 1.2},
        )

    def test_unpriced_and_unknown_models_resolve_to_nothing(self) -> None:
        self.assertIsNone(resolve_pricing("local/tinyllama", self.catalog_path))
        self.assertIsNone(resolve_pricing("nobody/nothing", self.catalog_path))
        self.assertIsNone(resolve_pricing("", self.catalog_path))
        self.assertIsNone(resolve_pricing(None, self.catalog_path))

    def test_a_missing_or_malformed_catalog_is_not_an_error(self) -> None:
        self.assertIsNone(resolve_pricing("anthropic/claude-opus-5", Path(self.temp_dir.name) / "absent.json"))

        broken = Path(self.temp_dir.name) / "broken.json"
        broken.write_text("{not json", encoding="utf-8")
        self.assertIsNone(resolve_pricing("anthropic/claude-opus-5", broken))

if __name__ == "__main__":
    unittest.main()
