"""FastAPI router exposing the Epicure ingredient-embedding operators.

Mounted by ``main.py``. The service is loaded lazily on first use so importing
this module (and starting the app) stays cheap; the heavy model download only
happens when an epicure endpoint is first hit.

All responses use the app's standard ``{success, data, error}`` envelope.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from epicure_service import EpicureService, load_default

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/epicure", tags=["epicure"])

# Bounds on free-text inputs so a pathologically long string can't drive regex /
# vocabulary work. An ingredient name is at most a few words.
MAX_INGREDIENT_LEN = 200
MAX_CUISINE_LEN = 100
ModelName = Literal["core", "chem", "cooc"]

_service: Optional[EpicureService] = None
_service_lock = threading.Lock()


def get_service() -> EpicureService:
    """Lazily construct and cache the real EpicureService (thread-safe).

    Overridden in tests via ``app.dependency_overrides`` with a fake service.
    The instance is published only after a fully successful load, so a failed
    download leaves the singleton unset and the next request retries cleanly.
    """
    global _service
    if _service is not None:
        return _service
    with _service_lock:
        if _service is None:
            try:
                _service = load_default()
            except Exception as exc:  # pragma: no cover - exercised only at runtime
                logger.exception("Failed to load Epicure models")
                raise HTTPException(status_code=503, detail=f"Epicure models unavailable: {exc}")
    return _service


class CuisineBlendRequest(BaseModel):
    ingredient: str = Field(..., min_length=1, max_length=MAX_INGREDIENT_LEN)
    cuisine: str = Field(..., min_length=1, max_length=MAX_CUISINE_LEN)
    theta_deg: float = Field(default=30.0, ge=0.0, le=90.0)
    k: int = Field(default=5, ge=1, le=50)
    model: ModelName = Field(default="core")


def _ok(data: object) -> dict[str, object]:
    return {"success": True, "data": data, "error": None}


@router.get("/health")
async def epicure_health(service: EpicureService = Depends(get_service)) -> dict[str, object]:
    return {"status": "healthy", "models": service.available_models()}


@router.get("/neighbors")
async def epicure_neighbors(
    ingredient: str = Query(..., min_length=1, max_length=MAX_INGREDIENT_LEN),
    k: int = Query(default=5, ge=1, le=50),
    model: ModelName = Query(default="core"),
    service: EpicureService = Depends(get_service),
) -> dict[str, object]:
    try:
        # Offload the synchronous NumPy work so it doesn't block the event loop.
        data = await asyncio.to_thread(service.neighbors, ingredient, k=k, model=model)
        return _ok(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/swap")
async def epicure_swap(
    ingredient: str = Query(..., min_length=1, max_length=MAX_INGREDIENT_LEN),
    k: int = Query(default=5, ge=1, le=50),
    service: EpicureService = Depends(get_service),
) -> dict[str, object]:
    try:
        data = await asyncio.to_thread(service.swap, ingredient, k=k)
        return _ok(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/cuisine-blend")
async def epicure_cuisine_blend(
    request: CuisineBlendRequest,
    service: EpicureService = Depends(get_service),
) -> dict[str, object]:
    try:
        data = await asyncio.to_thread(
            service.cuisine_blend,
            request.ingredient,
            request.cuisine,
            theta_deg=request.theta_deg,
            k=request.k,
            model=request.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _ok(data)


@router.get("/cuisines")
async def epicure_cuisines(
    model: ModelName = Query(default="core"),
    service: EpicureService = Depends(get_service),
) -> dict[str, object]:
    try:
        data = await asyncio.to_thread(service.list_cuisines, model=model)
        return _ok(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
