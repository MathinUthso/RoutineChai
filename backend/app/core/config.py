from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]

_DEFAULT_ALLOWED_ORIGINS = ("http://localhost:3000",)
_DEFAULT_CATALOG_PATH = BACKEND_DIR / "app" / "data" / "routine.json"


@dataclass(frozen=True)
class Settings:
    allowed_origins: tuple[str, ...]
    catalog_path: Path


def _catalog_path(raw: str) -> Path:
    path = Path(raw)
    return path if path.is_absolute() else BACKEND_DIR / path


@lru_cache
def get_settings() -> Settings:
    origins = tuple(
        origin.strip()
        for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    )
    raw_path = os.environ.get("CATALOG_PATH", "").strip()

    return Settings(
        allowed_origins=origins or _DEFAULT_ALLOWED_ORIGINS,
        catalog_path=_catalog_path(raw_path) if raw_path else _DEFAULT_CATALOG_PATH,
    )
