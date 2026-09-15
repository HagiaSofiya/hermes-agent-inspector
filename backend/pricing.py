"""Per-model token prices, read from the models.dev catalogue Hermes maintains.

Hermes keeps a refreshed copy of the models.dev catalogue at
``$HERMES_HOME/models_dev_cache.json``. Reading it means prices track whatever
Hermes itself believes today, instead of a hardcoded table that silently rots.

Every failure mode here returns ``None`` rather than raising: cost is a
decoration on top of the token counts, and a missing or reshaped cache must
never take the run history down with it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CACHE_FILENAME = "models_dev_cache.json"

_catalog: dict[str, Any] | None = None
_catalog_key: tuple[str, float] | None = None


def pricing_path(home: Path | None = None) -> Path:
    if home is None:
        from hermes_constants import get_hermes_home

        home = Path(get_hermes_home())

    return home / CACHE_FILENAME


def _load_catalog(path: Path) -> dict[str, Any]:
    """Return the catalogue, re-reading only when the file changes on disk."""
    global _catalog, _catalog_key

    try:
        mtime = path.stat().st_mtime
    except OSError:
        _catalog, _catalog_key = None, None
        return {}

    # Keyed on path as well as mtime: two catalogues written in the same clock
    # tick would otherwise be indistinguishable to the cache.
    key = (str(path), mtime)

    if _catalog is not None and _catalog_key == key:
        return _catalog

    try:
        with path.open(encoding="utf-8") as handle:
            loaded = json.load(handle)
    except (OSError, ValueError):
        loaded = {}

    if not isinstance(loaded, dict):
        loaded = {}

    _catalog, _catalog_key = loaded, key
    return loaded


def _models_for(catalog: dict[str, Any], provider: str) -> dict[str, Any]:
    entry = catalog.get(provider)

    if not isinstance(entry, dict):
        return {}

    models = entry.get("models")
    return models if isinstance(models, dict) else {}


def _rates(models: dict[str, Any], model_id: str) -> dict[str, float] | None:
    entry = models.get(model_id)

    if not isinstance(entry, dict):
        return None

    cost = entry.get("cost")

    if not isinstance(cost, dict):
        return None

    try:
        return {
            "inputPerMillion": float(cost["input"]),
            "outputPerMillion": float(cost["output"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def _search_all_providers(catalog: dict[str, Any], model_id: str) -> dict[str, float] | None:
    for provider in catalog:
        rates = _rates(_models_for(catalog, provider), model_id)

        if rates is not None:
            return rates

    return None


def resolve_pricing(model: str | None, path: Path | None = None) -> dict[str, float] | None:
    """USD per million tokens for ``model``, or None if it cannot be priced.

    Model ids arrive provider-prefixed (``anthropic/claude-opus-5``). A bare id
    is searched across providers, since the catalogue is keyed provider-first.
    """
    model_id = (model or "").strip()

    if not model_id:
        return None

    # A ":free" variant costs nothing. This must short-circuit ahead of the
    # base-model fallback below, which would otherwise price a free run at the
    # paid model's rate and invent a charge that was never incurred.
    if model_id.endswith(":free"):
        return {"inputPerMillion": 0.0, "outputPerMillion": 0.0}

    catalog = _load_catalog(path or pricing_path())

    if not catalog:
        return None

    provider, separator, remainder = model_id.partition("/")

    if not separator:
        return _search_all_providers(catalog, model_id)

    models = _models_for(catalog, provider)

    for candidate in (remainder, remainder.partition(":")[0]):
        rates = _rates(models, candidate)

        if rates is not None:
            return rates

    # Known model, unknown (or renamed) provider prefix.
    return _search_all_providers(catalog, remainder)
