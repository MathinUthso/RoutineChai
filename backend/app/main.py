from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.api.routes import health_router, router
from app.core.config import get_settings
from app.services.catalog import load_catalog


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    path: Path = app.state.catalog_path
    try:
        app.state.catalog = load_catalog(path)
    except (OSError, ValidationError) as exc:
        raise RuntimeError(f"Could not load catalog from {path}: {exc}") from exc
    yield


def create_app(catalog_path: Path | None = None) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="UIU Routine API", lifespan=_lifespan)
    app.state.catalog_path = Path(catalog_path) if catalog_path is not None else settings.catalog_path

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(router)
    return app


app = create_app()
