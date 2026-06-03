"""FastAPI router exposing the Epicure ingredient-embedding operators.

Mounted by ``main.py``. The service is loaded lazily on first use so importing
this module (and starting the app) stays cheap; the heavy model download only
happens when an epicure endpoint is first hit.

All responses use the app's standard ``{success, data, error}`` envelope.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from epicure_service import EpicureService, load_default

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/epicure", tags=["epicure"])

_service: Optional[EpicureService] = None


def get_service() -> EpicureService:
    """Lazily construct and cache the real EpicureService.

    Overridden in tests via ``app.dependency_overrides`` with a fake service.
    """
    global _service
    if _service is None:
        try:
            _service = load_default()
        except Exception as exc:  # pragma: no cover - exercised only at runtime
            logger.exception("Failed to load Epicure models")
            raise HTTPException(status_code=503, detail=f"Epicure models unavailable: {exc}")
    return _service


class CuisineBlendRequest(BaseModel):
    ingredient: str = Field(..., min_length=1)
    cuisine: str = Field(..., min_length=1)
    theta_deg: float = Field(default=30.0, ge=0.0, le=90.0)
    k: int = Field(default=5, ge=1, le=50)
    model: str = Field(default="core")


def _ok(data) -> dict:
    return {"success": True, "data": data, "error": None}


@router.get("/health")
async def epicure_health(service: EpicureService = Depends(get_service)):
    return {"status": "healthy", "models": service.available_models()}


@router.get("/neighbors")
async def epicure_neighbors(
    ingredient: str = Query(..., min_length=1),
    k: int = Query(default=5, ge=1, le=50),
    model: str = Query(default="core"),
    service: EpicureService = Depends(get_service),
):
    try:
        return _ok(service.neighbors(ingredient, k=k, model=model))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/swap")
async def epicure_swap(
    ingredient: str = Query(..., min_length=1),
    k: int = Query(default=5, ge=1, le=50),
    service: EpicureService = Depends(get_service),
):
    return _ok(service.swap(ingredient, k=k))


@router.post("/cuisine-blend")
async def epicure_cuisine_blend(
    request: CuisineBlendRequest,
    service: EpicureService = Depends(get_service),
):
    try:
        data = service.cuisine_blend(
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
    model: str = Query(default="core"),
    service: EpicureService = Depends(get_service),
):
    try:
        return _ok(service.list_cuisines(model=model))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
