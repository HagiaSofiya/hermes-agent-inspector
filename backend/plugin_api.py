from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

try:
    from .db import get_run, init_db, insert_run, list_run_summaries
    from .models import CreateRunPayload, PersistedRun, RunSummary
except ImportError:  # Hermes imports plugin_api.py as a standalone module.
    def _load_sibling(module_name: str):
        qualified_name = "_agent_inspector_" + module_name
        loaded = sys.modules.get(qualified_name)
        if loaded is not None:
            return loaded

        path = Path(__file__).with_name(module_name + ".py")
        spec = importlib.util.spec_from_file_location(qualified_name, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Unable to load Agent Inspector backend module {module_name}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
        return module

    _load_sibling("models")
    db = _load_sibling("db")
    models = sys.modules["_agent_inspector_models"]
    get_run, init_db, insert_run, list_run_summaries = db.get_run, db.init_db, db.insert_run, db.list_run_summaries
    CreateRunPayload, PersistedRun, RunSummary = models.CreateRunPayload, models.PersistedRun, models.RunSummary

router = APIRouter()


@router.on_event("startup")
def initialize_storage() -> None:
    init_db()


@router.get("/runs", response_model=list[RunSummary])
def runs(limit: int = Query(default=50, ge=1, le=200)) -> list[RunSummary]:
    return [RunSummary.model_validate(run) for run in list_run_summaries(limit)]


@router.get("/runs/{run_id}", response_model=PersistedRun)
def run(run_id: str) -> PersistedRun:
    stored = get_run(run_id)

    if stored is None:
        raise HTTPException(status_code=404, detail="Run not found")

    return stored


@router.post("/runs", response_model=PersistedRun)
def create_run(payload: CreateRunPayload) -> PersistedRun:
    return insert_run(PersistedRun.model_validate(payload.model_dump()))
