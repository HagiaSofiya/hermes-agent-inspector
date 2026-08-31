from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.db import get_run, init_db, insert_run, list_run_summaries, list_runs
from backend.models import CreateRunPayload, PersistedRun


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


if __name__ == "__main__":
    unittest.main()
