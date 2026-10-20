from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from app.models.catalog import Catalog


def load_catalog(path: Path) -> Catalog:
    return Catalog.model_validate_json(path.read_text(encoding="utf-8"))


def save_catalog(catalog: Catalog, path: Path) -> None:
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(catalog.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def catalog_stats(catalog: Catalog) -> dict:
    meetings = [meeting for course in catalog.courses for section in course.sections for meeting in section.meetings]
    day_counts = Counter(meeting.day for meeting in meetings)
    return {
        "courses": len(catalog.courses),
        "sections": sum(len(course.sections) for course in catalog.courses),
        "meetings": len(meetings),
        "programs": sorted({program for course in catalog.courses for program in course.programs}),
        "days": {day: day_counts.get(day, 0) for day in ("Sat", "Sun", "Mon", "Tue", "Wed")},
    }
