"""Tests for the BSEEE course-offering parser and catalog merge.

Expected values come from the source document
(`doc/EEEfall26classroutine.pdf`), never from the parser implementation.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models.catalog import Catalog, Course, Faculty, Meeting, Section
from app.services.catalog import merge_catalogs
from app.services.eee_parser import extract_eee_catalog_with_report, parse_eee_line

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_PATH = REPO_ROOT / "doc" / "EEEfall26classroutine.pdf"

VALID_DAYS = {"Sat", "Sun", "Mon", "Tue", "Wed"}


def _row(line: str):
    row, note = parse_eee_line(line)
    assert row is not None, (line, note)
    return row, note


# --------------------------------------------------------------------------- #
# single line grammar
# --------------------------------------------------------------------------- #
def test_header_line_is_ignored() -> None:
    assert parse_eee_line("FormalCodeTitle Section Credits Room Day Time Faculty Dept.") == (
        None,
        None,
    )


def test_three_digit_course_code_is_accepted() -> None:
    row, _ = _row("ACT 111 Financial and Managerial Accounting A 3 S W 11:11:AM - 12:30:PM BSEEE")

    assert row.code == "ACT 111"
    assert row.title == "Financial and Managerial Accounting"
    assert row.section == "A"
    assert row.credits == 3


def test_day_pair_single_letters_share_one_time() -> None:
    row, _ = _row("ACT 111 Financial and Managerial Accounting A 3 S W 11:11:AM - 12:30:PM BSEEE")

    assert [(meeting.day, meeting.start, meeting.end) for meeting in row.meetings] == [
        ("Sun", "11:11", "12:30"),
        ("Wed", "11:11", "12:30"),
    ]


def test_sat_t_pair_is_saturday_and_tuesday() -> None:
    row, _ = _row("EEE 1001 Electrical Circuits I A 3 Sat T 11:11:AM - 12:30:PM MRK BSEEE")

    assert [meeting.day for meeting in row.meetings] == ["Sat", "Tue"]
    assert {(meeting.start, meeting.end) for meeting in row.meetings} == {("11:11", "12:30")}


def test_room_glued_to_the_day_cell_is_parsed() -> None:
    row, _ = _row(
        "EEE 3403 Microprocessor and Interfacing A 3 531 (Embedded System Lab)Sat T "
        "11:11:AM - 12:30:PM SMLK BSEEE"
    )

    assert row.code == "EEE 3403"
    assert row.title == "Microprocessor and Interfacing"
    assert {meeting.room for meeting in row.meetings} == {"531 (Embedded System Lab)"}
    assert [meeting.day for meeting in row.meetings] == ["Sat", "Tue"]


def test_missing_faculty_is_recorded_as_tba() -> None:
    row, _ = _row("ECO 2101 Economics A 3 Sat T 08:30:AM - 09:50:AM BSEEE")

    assert row.faculty.name == "TBA"
    assert row.faculty.initials is None


def test_initials_only_faculty_is_kept_as_name_and_initials() -> None:
    row, _ = _row("EEE 1001 Electrical Circuits I A 3 Sat T 11:11:AM - 12:30:PM MRK BSEEE")

    assert row.faculty.name == "MRK"
    assert row.faculty.initials == "MRK"


def test_placeholder_time_becomes_a_section_without_meetings() -> None:
    row, note = _row("EEE 4902 Capstone Project II A 2 00:00:PM - 00:00:PM BSEEE")

    assert row.code == "EEE 4902"
    assert row.credits == 2
    assert row.meetings == []
    assert note is not None and "no meeting time" in note


def test_line_with_unknown_day_tokens_is_not_parsed() -> None:
    row, note = parse_eee_line("EEE 1001 Electrical Circuits I A 3 X Y 11:11:AM - 12:30:PM BSEEE")

    assert row is None
    assert note is None


# --------------------------------------------------------------------------- #
# whole document
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def eee_catalog() -> Catalog:
    catalog, _ = extract_eee_catalog_with_report(PDF_PATH)
    return catalog


def test_document_volume(eee_catalog: Catalog) -> None:
    assert len(eee_catalog.courses) == 63
    assert sum(len(course.sections) for course in eee_catalog.courses) == 126
    assert eee_catalog.programs == ["BSEEE"]


def test_every_section_is_well_formed(eee_catalog: Catalog) -> None:
    problems: list[str] = []
    for course in eee_catalog.courses:
        assert course.programs == ["BSEEE"]
        assert 1 <= course.credits <= 3
        for section in course.sections:
            label = f"{course.code}/{section.name}"
            assert section.if_required is False
            assert section.faculty.name
            if course.code == "EEE 4902":
                assert section.meetings == []
                continue
            if not 1 <= len(section.meetings) <= 2:
                problems.append(f"{label}: {len(section.meetings)} meetings")
            for meeting in section.meetings:
                if meeting.day not in VALID_DAYS:
                    problems.append(f"{label}: day {meeting.day}")
                if not meeting.start < meeting.end:
                    problems.append(f"{label}: {meeting.start} !< {meeting.end}")
                if not meeting.room:
                    problems.append(f"{label}: empty room")
    assert not problems, "\n".join(problems[:10])


def test_channels_and_labs_are_classified(eee_catalog: Catalog) -> None:
    by_code = {course.code: course for course in eee_catalog.courses}

    assert by_code["EEE 1001"].kind == "theory"
    assert by_code["EEE 1004"].kind == "lab"
    assert by_code["MAT 1101"].kind == "theory"


def test_shared_service_course_is_present(eee_catalog: Catalog) -> None:
    course = next(item for item in eee_catalog.courses if item.code == "ENG 1011")

    assert course.title == "English I"
    assert [section.name for section in course.sections] == ["J", "K", "L", "M", "N"]


# --------------------------------------------------------------------------- #
# merge
# --------------------------------------------------------------------------- #
def _catalog(*courses: Course, programs: list[str] | None = None) -> Catalog:
    return Catalog(
        term="Fall 2026",
        programs=programs or sorted({program for course in courses for program in course.programs}),
        generated_at="2026-10-21T00:00:00+06:00",
        source="test",
        courses=list(courses),
    )


def _course(code: str, program: str, sections: list[Section], title: str = "Course") -> Course:
    return Course(
        code=code,
        title=title,
        credits=3,
        programs=[program],
        kind="theory",
        sections=sections,
    )


def _section(name: str, day: str = "Sat", room: str = "101") -> Section:
    return Section(
        name=name,
        if_required=False,
        faculty=Faculty(name="Test Faculty", initials="TF"),
        meetings=[Meeting(day=day, start="08:30", end="09:50", room=room)],
    )


def test_merge_unions_programs_and_sections_for_shared_codes() -> None:
    primary = _catalog(_course("ENG 1011", "BSCSE", [_section("AA")]))
    extra = _catalog(_course("ENG 1011", "BSEEE", [_section("J")]))

    merged = merge_catalogs(primary, extra)

    course = merged.courses[0]
    assert course.programs == ["BSCSE", "BSEEE"]
    assert [section.name for section in course.sections] == ["AA", "J"]
    assert merged.programs == ["BSCSE", "BSEEE"]


def test_merge_keeps_distinct_courses() -> None:
    primary = _catalog(_course("CSE 1111", "BSCSE", [_section("A")]))
    extra = _catalog(_course("EEE 1001", "BSEEE", [_section("A")]))

    merged = merge_catalogs(primary, extra)

    assert [course.code for course in merged.courses] == ["CSE 1111", "EEE 1001"]


def test_merge_rejects_conflicting_section_meetings() -> None:
    primary = _catalog(_course("ENG 1011", "BSCSE", [_section("AA", day="Sat")]))
    extra = _catalog(_course("ENG 1011", "BSEEE", [_section("AA", day="Sun")]))

    with pytest.raises(ValueError, match="conflicting duplicate section"):
        merge_catalogs(primary, extra)


def test_merge_rejects_conflicting_metadata() -> None:
    primary = _catalog(_course("ENG 1011", "BSCSE", [_section("AA")], title="English I"))
    extra = _catalog(_course("ENG 1011", "BSEEE", [_section("J")], title="English II"))

    with pytest.raises(ValueError, match="conflicting metadata"):
        merge_catalogs(primary, extra)
