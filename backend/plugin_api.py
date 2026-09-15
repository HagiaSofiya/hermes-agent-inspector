from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

try:
    from .db import get_run, init_db, insert_run, list_run_summaries
    from .models import CreateRunPayload, ModelPricing, PersistedRun, RunSummary
    from .pricing import resolve_pricing
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
    pricing = _load_sibling("pricing")
    models = sys.modules["_agent_inspector_models"]
    get_run, init_db, insert_run, list_run_summaries = db.get_run, db.init_db, db.insert_run, db.list_run_summaries
    CreateRunPayload, PersistedRun, RunSummary = models.CreateRunPayload, models.PersistedRun, models.RunSummary
    ModelPricing = models.ModelPricing
    resolve_pricing = pricing.resolve_pricing

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


@router.get("/pricing", response_model=ModelPricing | None)
def pricing_for_model(model: str = Query(min_length=1, max_length=200)) -> ModelPricing | None:
    """Token rates for a model, or null when it cannot be priced.

    Null rather than 404: an unpriced model is an ordinary outcome (a local or
    self-hosted model has no published rate), not a client error.
    """
    rates = resolve_pricing(model)

    return ModelPricing.model_validate(rates) if rates else None
