from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.models.catalog import Catalog, Course


def load_catalog(path: Path) -> Catalog:
    return Catalog.model_validate_json(path.read_text(encoding="utf-8"))


def save_catalog(catalog: Catalog, path: Path) -> None:
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(catalog.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def merge_catalogs(*catalogs: Catalog) -> Catalog:
    """Combine program-specific catalogs into one scheduler catalog.

    A course code shared by two programs keeps one entry: programs, sections
    and meetings are unioned.  Section names must not collide with different
    meetings, and title/credits/kind must agree, so a bad merge fails loudly.
    """
    if not catalogs:
        raise ValueError("merge_catalogs needs at least one catalog")

    merged: dict[str, Course] = {}
    for catalog in catalogs:
        for course in catalog.courses:
            existing = merged.get(course.code)
            if existing is None:
                merged[course.code] = course.model_copy(deep=True)
                continue

            if (existing.title, existing.credits, existing.kind) != (
                course.title,
                course.credits,
                course.kind,
            ):
                raise ValueError(f"conflicting metadata for shared course {course.code}")

            by_name = {section.name: section for section in existing.sections}
            sections = list(existing.sections)
            for section in course.sections:
                previous = by_name.get(section.name)
                if previous is None:
                    sections.append(section.model_copy(deep=True))
                    by_name[section.name] = section
                elif previous != section:
                    raise ValueError(f"conflicting duplicate section {course.code}/{section.name}")

            existing.sections = sorted(sections, key=lambda section: section.name)
            existing.programs = sorted(set(existing.programs) | set(course.programs))

    term = catalogs[0].term
    source = " + ".join(dict.fromkeys(catalog.source for catalog in catalogs))
    courses = sorted(merged.values(), key=lambda course: course.code)
    return Catalog(
        term=term,
        programs=sorted({program for course in courses for program in course.programs}),
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source=source,
        courses=courses,
    )


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
