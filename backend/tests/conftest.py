"""Shared fixtures for backend tests.

Catalog and request payloads use the agreed snake_case schema
(``term`` / ``credits`` / ``kind`` on Course / one ``day`` per Meeting).
Fixture JSON is UTF-8 without BOM; a BOM is treated as a fixture bug.
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
FIXTURES_DIR = TESTS_DIR / "fixtures"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BOM = b"\xef\xbb\xbf"

_CATALOG_MODELS = (
    ("app.models.catalog", "Catalog"),
    ("app.models.catalog", "CourseCatalog"),
    ("app.models", "Catalog"),
)


def load_fixture_json(name: str):
    """Load a fixture file, rejecting a UTF-8 BOM."""
    path = FIXTURES_DIR / name
    raw = path.read_bytes()
    assert not raw.startswith(BOM), f"{path} must be UTF-8 without BOM"
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError as exc:  # pragma: no cover - defensive
        raise AssertionError(f"{path} is not valid UTF-8: {exc}") from exc


def build_catalog(payload: dict):
    """Validate the catalog through the app model when one exists."""
    data = json.loads(json.dumps(payload))
    for module_name, attr in _CATALOG_MODELS:
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            continue
        model = getattr(module, attr, None)
        if model is not None:
            return model.model_validate(data)
    return data


@pytest.fixture(scope="session")
def catalog_payload() -> dict:
    return load_fixture_json("catalog_min.json")


@pytest.fixture(scope="session")
def catalog(catalog_payload: dict):
    return build_catalog(catalog_payload)


@pytest.fixture(scope="session")
def make_catalog():
    return build_catalog


@pytest.fixture(scope="session")
def request_payloads() -> dict:
    return load_fixture_json("requests.json")


@pytest.fixture(scope="session")
def request_payload(request_payloads: dict):
    """Return a fresh copy of a named request fixture, with optional overrides."""

    def _get(name: str, **overrides):
        assert name in request_payloads, (
            f"unknown request fixture {name!r}; have {sorted(request_payloads)}"
        )
        payload = json.loads(json.dumps(request_payloads[name]))
        for key, value in overrides.items():
            if key == "limit":
                payload["limit"] = value
            elif key == "offset":
                payload["offset"] = value
            elif key == "constraints":
                payload["constraints"].update(value)
            else:
                raise AssertionError(f"unsupported request override {key!r}")
        return payload

    return _get


@pytest.fixture(scope="session")
def make_request():
    """Validate a request payload through the public GenerateRequest model."""

    def _make(payload: dict):
        from app.models.requests import GenerateRequest

        return GenerateRequest.model_validate(json.loads(json.dumps(payload)))

    return _make