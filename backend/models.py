from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# The gateway payloads are JSON values. The container types are validated here;
# nested leaves remain intentionally open because Hermes tool results can have
# arbitrary JSON object shapes.
JsonValue = None | bool | int | float | str | list[Any] | dict[str, Any]


class TraceEventModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    timestamp: int
    category: Literal["user", "model", "tool", "response", "system", "error"]
    eventType: str = Field(min_length=1)
    sessionId: str | None = None
    title: str
    summary: str
    status: Literal["pending", "success", "error"]
    toolName: str | None = None
    durationMs: int | float | None = Field(default=None, ge=0)
    input: JsonValue = None
    output: JsonValue = None
    rawPayload: JsonValue = None


class RunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runId: str = Field(min_length=1)
    sessionId: str | None = None
    startedAt: int
    completedAt: int
    model: str | None = None
    status: Literal["success", "error"]
    runtimeMs: int | float | None = Field(default=None, ge=0)
    toolCallCount: int = Field(ge=0)
    failedToolCount: int = Field(ge=0)


class CreateRunPayload(RunSummary):
    events: list[TraceEventModel] = Field(min_length=1)


class PersistedRun(RunSummary):
    events: list[TraceEventModel] = Field(min_length=1)


def model_dump_json_ready(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json")
