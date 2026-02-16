"""FastAPI application factory with CORS and security middleware."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemaingest.endpoints import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="SchemaIngest Agent",
        description="Local agent for database schema introspection.",
        version="0.1.0",
        docs_url=None,   # disable Swagger UI in production
        redoc_url=None,
    )

    # CORS — only the GitHub Pages site and local dev
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://jinethbosilu.github.io",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(router)

    return app
