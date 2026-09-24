"""FastAPI route handlers."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from schemaingest.introspect import introspect
from schemaingest.models import ConnectRequest, PairRequest, SchemaPack
from schemaingest.renderers import render_erd_mermaid, render_schema_txt
from schemaingest.security import (
    rate_limit_dep,
    redact_password,
    require_session,
    verify_pairing_code,
)
from schemaingest import __version__

router = APIRouter()


# Handlers are plain `def`: the database drivers block, so FastAPI runs them in its
# threadpool instead of on the event loop.

# ─── Health ───────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok", "version": __version__}


# ─── Pairing ──────────────────────────────────────────────────────────

@router.post("/pair/start", dependencies=[Depends(rate_limit_dep)])
def pair_start(body: PairRequest):
    token = verify_pairing_code(body.code)
    if token is None:
        return JSONResponse(status_code=403, content={"detail": "Invalid pairing code"})
    return {"sessionToken": token}


# ─── Introspection ────────────────────────────────────────────────────

def _do_introspect(req: ConnectRequest) -> SchemaPack:
    """Shared introspection helper."""
    try:
        return introspect(req)
    except Exception as e:
        # Sanitise the error message to avoid leaking credentials
        raise ValueError(redact_password(str(e))) from None


@router.post("/introspect", dependencies=[Depends(rate_limit_dep)])
def introspect_endpoint(body: ConnectRequest, _token: str = Depends(require_session)):
    try:
        pack = _do_introspect(body)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})
    return pack.model_dump(by_alias=True)


@router.post("/render/schema.txt", dependencies=[Depends(rate_limit_dep)])
def render_schema_txt_endpoint(body: ConnectRequest, _token: str = Depends(require_session)):
    try:
        pack = _do_introspect(body)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})
    return {"text": render_schema_txt(pack)}


@router.post("/render/erd.mmd", dependencies=[Depends(rate_limit_dep)])
def render_erd_mmd_endpoint(body: ConnectRequest, _token: str = Depends(require_session)):
    try:
        pack = _do_introspect(body)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})
    return {"mermaid": render_erd_mermaid(pack)}
