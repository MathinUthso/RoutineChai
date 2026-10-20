"""Tests for the Fall 2026 class-routine PDF parser.

Expected values come from the workstream contract and from the source document
(`doc/Class Routine with faculty assign Fall 2026.pdf`), never from the parser
implementation.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.models.catalog import Catalog
from app.services.parser import (
    _parse_primary_row,
    extract_catalog,
    normalize_faculty,
    normalize_section,
    normalize_time,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_PATH = REPO_ROOT / "doc" / "Class Routine with faculty assign Fall 2026.pdf"

VALID_DAYS = {"Sat", "Sun", "Mon", "Tue", "Wed"}
CLOCK_RE = re.compile(r"^\d{2}:\d{2}$")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _initials(result):
    """normalize_faculty may return bare initials or a Faculty-like object."""
    return getattr(result, "initials", result)


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _days(meeting) -> list[str]:
    return [str(d) for d in _as_list(getattr(meeting, "days", getattr(meeting, "day", None)))]


def _section_faculty(section) -> list:
    found = _as_list(getattr(section, "faculty", None))
    for meeting in _as_list(getattr(section, "meetings", None)):
        found.extend(_as_list(getattr(meeting, "faculty", None)))
    return found


def _kind(course, section, meeting) -> str:
    for obj in (meeting, section, course):
        value = getattr(obj, "kind", None)
        if value:
            return str(getattr(value, "value", value)).lower()
    return ""


def _credit(course) -> object:
    for obj in (course, *_as_list(getattr(course, "sections", None))):
        for attr in ("credit", "credits"):
            value = getattr(obj, attr, None)
            if value is not None:
                return value
    return None


def _find_section(catalog: Catalog, code: str, name: str):
    wanted = code.replace(" ", "").upper()
    for course in catalog.courses:
        if course.code.replace(" ", "").upper() != wanted:
            continue
        for section in course.sections:
            if section.name.strip().upper() == name.upper():
                return course, section
    pytest.fail(f"section {code}/{name} missing from parsed catalog")


@pytest.fixture(scope="session")
def catalog() -> Catalog:
    if not PDF_PATH.is_file():
        pytest.skip(f"source routine PDF missing: {PDF_PATH}")
    return extract_catalog(PDF_PATH)


# --------------------------------------------------------------------------- #
# unit: time normalization
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("08:30:AM - 09:50:AM", ("08:30", "09:50")),
        ("12:31:PM - 01:50:PM", ("12:31", "13:50")),
        ("01:51:PM - 03:10:PM", ("13:51", "15:10")),
        ("11:11:AM - 01:40:PM", ("11:11", "13:40")),
        ("08:30:AM - 11:00:AM", ("08:30", "11:00")),
    ],
)
def test_normalize_time_converts_to_24_hour(raw: str, expected: tuple[str, str]) -> None:
    assert normalize_time(raw) == expected


def test_normalize_time_absent_slot_is_none() -> None:
    assert normalize_time("-") is None


# --------------------------------------------------------------------------- #
# unit: section normalization
# --------------------------------------------------------------------------- #
def test_normalize_section_flags_if_required() -> None:
    assert normalize_section("AE (If Required)") == ("AE", True)


def test_normalize_section_plain_section_is_not_if_required() -> None:
    assert normalize_section("A") == ("A", False)


def test_normalize_section_handles_lowercase_flag() -> None:
    # The PDF mixes "(If Required)" and "(if required)" spellings.
    assert normalize_section("F (if required)") == ("F", True)


# --------------------------------------------------------------------------- #
# unit: faculty normalization
# --------------------------------------------------------------------------- #
def test_normalize_faculty_keeps_real_initials() -> None:
    assert _initials(normalize_faculty("Ishrat Jahan", "IJ")) == "IJ"


def test_normalize_faculty_drops_full_name_in_initials_column() -> None:
    assert _initials(normalize_faculty("Md. Tanvir Raihan", "Md. Tanvir Raihan")) is None


# --------------------------------------------------------------------------- #
# integration: whole catalog
# --------------------------------------------------------------------------- #
def test_catalog_volume(catalog: Catalog) -> None:
    assert isinstance(catalog, Catalog)
    sections = [s for c in catalog.courses for s in c.sections]
    assert len(catalog.courses) >= 90
    assert len(sections) >= 700


def test_every_section_is_well_formed(catalog: Catalog) -> None:
    problems: list[str] = []

    for course in catalog.courses:
        for section in course.sections:
            label = f"{course.code}/{section.name}"
            if "required" in section.name.lower():
                problems.append(f"{label}: section name keeps if-required flag")

            meetings = _as_list(getattr(section, "meetings", None))
            if not 1 <= len(meetings) <= 2:
                problems.append(f"{label}: {len(meetings)} meetings")
                continue

            for meeting in meetings:
                days = _days(meeting)
                start, end = meeting.start, meeting.end
                room = (meeting.room or "").strip()

                if not days or not set(days) <= VALID_DAYS:
                    problems.append(f"{label}: days {days!r}")
                if not (isinstance(start, str) and isinstance(end, str)):
                    problems.append(f"{label}: time {start!r}-{end!r}")
                elif not (CLOCK_RE.match(start) and CLOCK_RE.match(end)):
                    problems.append(f"{label}: time {start!r}-{end!r}")
                elif not start < end:
                    problems.append(f"{label}: {start} !< {end}")
                if not room:
                    problems.append(f"{label}: empty room")

            names = [str(getattr(f, "name", "") or "").strip() for f in _section_faculty(section)]
            if not names or any(not n for n in names):
                problems.append(f"{label}: missing faculty name")

    assert not problems, "malformed sections:\n" + "\n".join(problems[:10])


def test_course_section_pairs_are_unique(catalog: Catalog) -> None:
    pairs = [(c.code, s.name) for c in catalog.courses for s in c.sections]
    counts: dict[tuple[str, str], int] = {}
    for pair in pairs:
        counts[pair] = counts.get(pair, 0) + 1
    duplicates = sorted(pair for pair, n in counts.items() if n > 1)
    assert not duplicates, f"duplicate (course, section) rows: {duplicates[:10]}"


def test_course_credits_are_parsed_as_ints(catalog: Catalog) -> None:
    bad = []
    for course in catalog.courses:
        credit = _credit(course)
        if not isinstance(credit, int) or isinstance(credit, bool) or not 1 <= credit <= 4:
            bad.append(f"{course.code}: {credit!r}")
    assert not bad, f"unparsed credits: {bad[:10]}"

    act, _ = _find_section(catalog, "ACT 2111", "A")
    assert _credit(act) == 3


def _primary_row(credit: str) -> list[str]:
    return [
        "1",
        "BSCSE",
        "CSE 9999",
        "Synthetic Course",
        "A",
        "101",
        "",
        "Sat",
        "",
        "08:30:AM - 09:50:AM",
        "-",
        "Amina Rahman",
        "AR",
        credit,
    ]


@pytest.mark.parametrize("credit", ["1", "4"])
def test_primary_row_accepts_supported_credits(credit: str) -> None:
    row, reasons = _parse_primary_row(
        page=1,
        cells=_primary_row(credit),
        canonical_titles={},
        known_faculty=set(),
    )

    assert reasons == [], f"{credit}-credit row rejected: {reasons}"
    assert row is not None
    assert row.credits == int(credit)
    assert "invalid credit" not in reasons


def test_primary_row_rejects_five_credits() -> None:
    row, reasons = _parse_primary_row(
        page=1,
        cells=_primary_row("5"),
        canonical_titles={},
        known_faculty=set(),
    )

    assert row is None
    assert "invalid credit" in reasons


def test_act_2111_a_has_two_meetings(catalog: Catalog) -> None:
    _, section = _find_section(catalog, "ACT 2111", "A")
    meetings = _as_list(section.meetings)
    assert len(meetings) == 2
    assert {tuple(_days(m)) for m in meetings} == {("Sat",), ("Tue",)}
    assert {(m.start, m.end) for m in meetings} == {("08:30", "09:50")}


def test_cse_1110_a_is_sunday_lab(catalog: Catalog) -> None:
    _, section = _find_section(catalog, "CSE 1110", "A")
    meetings = _as_list(section.meetings)
    assert len(meetings) == 1
    meeting = meetings[0]
    assert _days(meeting) == ["Sun"]
    assert (meeting.start, meeting.end) == ("11:11", "13:40")
    assert "computer lab" in (meeting.room or "").lower()


def test_bds_1201_ae_is_if_required(catalog: Catalog) -> None:
    _, section = _find_section(catalog, "BDS 1201", "AE")
    assert getattr(section, "if_required", None) is True


def test_cse_4165_i_is_monday_lab(catalog: Catalog) -> None:
    course, section = _find_section(catalog, "CSE 4165", "I")
    meetings = _as_list(section.meetings)
    assert len(meetings) == 1
    meeting = meetings[0]
    assert _days(meeting) == ["Mon"]
    assert (meeting.start, meeting.end) == ("08:30", "11:00")
    assert _kind(course, section, meeting) == "lab"
