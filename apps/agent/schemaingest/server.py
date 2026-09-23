"""FastAPI application factory with CORS and security middleware."""

from __future__ import annotations

import inspect

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from schemaingest import __version__
from schemaingest.endpoints import router

ALLOWED_ORIGINS = [
    "https://jinethbosilu.github.io",
    "http://localhost:5173",
    "http://localhost:4173",
]


def create_app() -> FastAPI:
    app = FastAPI(
        title="SchemaIngest Agent",
        description="Local agent for database schema introspection.",
        version=__version__,
        docs_url=None,   # disable Swagger UI in production
        redoc_url=None,
        openapi_url=None,
    )

    # CORS - only the GitHub Pages site and local dev. Auth is a bearer header,
    # not a cookie, so credentials are not needed.
    #
    # Chrome's Private/Local Network Access: a public HTTPS page (GitHub Pages)
    # calling 127.0.0.1 sends a preflight with Access-Control-Request-Private-Network
    # and refuses the request unless the answer opts in. Newer Starlette handles
    # that itself (and rejects the preflight unless told to allow it); older
    # Starlette ignores the header, so the middleware below adds the answer.
    native_pna = "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        **({"allow_private_network": True} if native_pna else {}),
    )

    if not native_pna:
        # Added after CORS, so it is the outer layer and sees CORS's preflight response.
        @app.middleware("http")
        async def allow_private_network(request: Request, call_next):
            response = await call_next(request)
            if (
                request.method == "OPTIONS"
                and request.headers.get("origin") in ALLOWED_ORIGINS
                and request.headers.get("access-control-request-private-network") == "true"
            ):
                response.headers["Access-Control-Allow-Private-Network"] = "true"
            return response

    app.include_router(router)

    return app
