"""Acceptance tests for ``app.services.scheduler.generate`` (public API only).

Schema under test (see ``tests/fixtures/*.json``):
  catalog: term / programs / generated_at / source / courses
  course:  code / title / credits / programs / kind / sections
  section: name / if_required / faculty{name,initials} / meetings[{day,start,end,room}]
  request: programs / courses[{code,allowed_sections?,excluded_sections?,
                                preferred_faculty?,excluded_faculty?}] /
           constraints{blocked,max_sessions_per_day,allowed_days,
                       time_preference,preferred_off_days,
                       max_gap_minutes?,max_campus_days?,latest_end?} / limit

Every expected value below is derived from the fixture catalog or from the
scheduler contract, never from the implementation.
"""

from __future__ import annotations

import json
import random
import re
import time

import pytest

from app.services.scheduler import generate

ALL_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed"]
DAY_SET = set(ALL_DAYS)
BSCSE = "BSCSE"
BSDS = "BSDS"
BSEEE = "BSEEE"
COURSE_CODE = re.compile(r"^[A-Z]{2,4} \d{4}$")
_MISSING = object()


# --------------------------------------------------------------------------- #
# result helpers (tolerant to pydantic models and plain dicts only)
# --------------------------------------------------------------------------- #
def _attr(obj, name, default=_MISSING):
    if isinstance(obj, dict):
        value = obj.get(name, _MISSING)
    else:
        value = getattr(obj, name, _MISSING)
    if value is _MISSING:
        if default is _MISSING:
            raise AssertionError(f"missing attribute {name!r} on {obj!r}")
        return default
    return value


def _minutes(value) -> int:
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return int(value.hour) * 60 + int(value.minute)
    if isinstance(value, str):
        hours, _, minutes = value.partition(":")
        return int(hours) * 60 + int(minutes)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    raise AssertionError(f"unrecognized time value: {value!r}")


def _enum_text(value) -> str:
    return str(getattr(value, "value", value)).lower()


def routines(result) -> list:
    return list(_attr(result, "routines"))


def courses_of(routine) -> list:
    return list(_attr(routine, "courses"))


def course_code(course) -> str:
    return str(_attr(course, "code"))


def section_name(course) -> str:
    for attr in ("section", "section_name", "name"):
        value = _attr(course, attr, None)
        if value:
            return str(value)
    raise AssertionError(f"course {course!r} exposes no section identifier")


def score_of(routine) -> float:
    return float(_attr(routine, "score"))


def scores(result) -> list[float]:
    return [score_of(routine) for routine in routines(result)]


def diagnostics(result) -> list:
    value = _attr(result, "diagnostics", [])
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    return list(value)


def excluded_courses(result) -> dict[str, set[str]]:
    """Map diagnostic reason -> course codes reported as excluded."""
    found: dict[str, set[str]] = {}
    for diagnostic in diagnostics(result):
        reason = _enum_text(_attr(diagnostic, "reason"))
        codes = {
            str(code)
            for code in _attr(diagnostic, "courses_without_candidates", [])
        }
        found.setdefault(reason, set()).update(codes)
    return found


def routine_meetings(routine) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for course in courses_of(routine):
        for meeting in _attr(course, "meetings"):
            day = _attr(meeting, "day", None)
            assert day, f"meeting {meeting!r} exposes no 'day'; schema is one day per meeting"
            found.append(
                (
                    str(day),
                    _minutes(_attr(meeting, "start")),
                    _minutes(_attr(meeting, "end")),
                )
            )
    return found


def section_keys(routine) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((course_code(c), section_name(c)) for c in courses_of(routine)))


def per_day_sessions(meetings) -> dict[str, int]:
    counts: dict[str, int] = {}
    for day, _start, _end in meetings:
        counts[day] = counts.get(day, 0) + 1
    return counts


def gap_minutes(meetings) -> int:
    by_day: dict[str, list[tuple[int, int]]] = {}
    for day, start, end in meetings:
        by_day.setdefault(day, []).append((start, end))
    total = 0
    for intervals in by_day.values():
        intervals.sort()
        for (_prev_start, prev_end), (next_start, _next_end) in zip(intervals, intervals[1:]):
            total += max(0, next_start - prev_end)
    return total


def overlaps(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    """Half-open intervals: touching endpoints do not overlap."""
    return start_a < end_b and start_b < end_a


def assert_no_conflicts(meetings) -> None:
    by_day: dict[str, list[tuple[int, int]]] = {}
    for day, start, end in meetings:
        assert end > start, f"meeting {day} {start}-{end} has non-positive duration"
        by_day.setdefault(day, []).append((start, end))
    for day, intervals in by_day.items():
        intervals.sort()
        for (start_a, end_a), (start_b, end_b) in zip(intervals, intervals[1:]):
            assert start_b >= end_a, (
                f"overlapping meetings on {day}: {start_a}-{end_a} / {start_b}-{end_b}"
            )


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
# --------------------------------------------------------------------------- #
# synthetic catalog builders (same schema as the fixtures)
# --------------------------------------------------------------------------- #
FACULTY_NAMES = {"AR": "Amina Rahman", "TA": "Tanvir Ahmed"}


def _meeting(day, start, end, room="R1"):
    return {"day": day, "start": start, "end": end, "room": room}


def _section(name, initials, meetings, if_required=False):
    return {
        "name": name,
        "if_required": if_required,
        "faculty": {"name": FACULTY_NAMES[initials], "initials": initials},
        "meetings": list(meetings),
    }


def _course(code, title, credits, kind, sections, programs=(BSCSE,)):
    return {
        "code": code,
        "title": title,
        "credits": credits,
        "programs": list(programs),
        "kind": kind,
        "sections": list(sections),
    }


def _catalog(*courses):
    return {
        "term": "Fall 2026",
        "programs": [BSCSE, BSDS, BSEEE],
        "generated_at": "2026-10-21T00:00:00+06:00",
        "source": "test",
        "courses": list(courses),
    }


def _request(
    program,
    courses,
    *,
    blocked=(),
    max_sessions_per_day=3,
    allowed_days=None,
    time_preference="any",
    limit=10,
    offset=0,
):
    return {
        "programs": [program],
        "courses": list(courses),
        "constraints": {
            "blocked": list(blocked),
            "max_sessions_per_day": max_sessions_per_day,
            "allowed_days": list(ALL_DAYS if allowed_days is None else allowed_days),
            "time_preference": time_preference,
            "preferred_off_days": [],
        },
        "limit": limit,
        "offset": offset,
    }


def _offered_sections(catalog_payload, program):
    offered: dict[str, list[str]] = {}
    for course in catalog_payload["courses"]:
        if program not in course["programs"]:
            continue
        names = [s["name"] for s in course["sections"] if not s["if_required"]]
        if names:
            offered[course["code"]] = names
    return offered


# --------------------------------------------------------------------------- #
# fixture contract
# --------------------------------------------------------------------------- #
def test_fixture_catalog_matches_agreed_schema(catalog_payload) -> None:
    assert catalog_payload["term"] == "Fall 2026"
    assert catalog_payload["source"] == "fixture"
    assert catalog_payload["generated_at"] == "2026-10-21T00:00:00+06:00"
    assert set(catalog_payload["programs"]) == {BSCSE, BSDS}

    courses = catalog_payload["courses"]
    assert len(courses) == 6
    codes = [course["code"] for course in courses]
    assert len(set(codes)) == len(codes), f"duplicate course codes: {codes}"
    assert sum(1 for course in courses if course["kind"] == "lab") >= 1
    assert sum(1 for course in courses if len(course["sections"]) == 1) == 1
    assert sum(
        1 for course in courses for section in course["sections"] if section["if_required"]
    ) == 1

    for course in courses:
        assert COURSE_CODE.match(course["code"]), f"bad course code {course['code']!r}"
        assert 1 <= course["credits"] <= 3, f"{course['code']} credits out of range"
        assert course["kind"] in {"theory", "lab"}, f"{course['code']} bad kind"
        assert set(course["programs"]) <= {BSCSE, BSDS}
        assert 1 <= len(course["sections"]) <= 3
        for section in course["sections"]:
            assert section["faculty"]["name"]
            assert section["faculty"]["initials"]
            meetings = section["meetings"]
            assert len(meetings) == (2 if course["kind"] == "theory" else 1), (
                f"{course['code']}/{section['name']}: theory has two meetings, labs one"
            )
            for meeting in meetings:
                assert set(meeting) == {"day", "start", "end", "room"}
                assert meeting["day"] in DAY_SET
                start = _minutes(meeting["start"])
                end = _minutes(meeting["end"])
                assert 8 * 60 <= start < end <= 20 * 60

    initials = {
        section["faculty"]["initials"]
        for course in courses
        for section in course["sections"]
    }
    assert len(initials) == 2, f"fixture should use two faculty, got {sorted(initials)}"


def test_fixture_requests_match_agreed_schema(catalog_payload, request_payloads, make_request) -> None:
    offered = {course["code"]: course for course in catalog_payload["courses"]}
    for name, payload in request_payloads.items():
        request = make_request(payload)
        programs = [
            str(getattr(item, "value", item)).upper() for item in _attr(request, "programs")
        ]
        assert programs, name
        assert set(programs) <= {BSCSE, BSDS}, name
        assert int(_attr(request, "limit")) >= 1, name

        constraints = _attr(request, "constraints")
        assert int(_attr(constraints, "max_sessions_per_day")) >= 1, name
        allowed_days = {str(day) for day in _attr(constraints, "allowed_days")}
        assert allowed_days <= DAY_SET, f"{name}: bad allowed_days {allowed_days}"
        assert _enum_text(_attr(constraints, "time_preference")) in {
            "morning",
            "afternoon",
            "any",
        }, name
        for block in _attr(constraints, "blocked"):
            assert str(_attr(block, "day")) in DAY_SET, name
            assert _minutes(_attr(block, "start")) < _minutes(_attr(block, "end")), name

        requested = list(_attr(request, "courses"))
        assert requested, f"{name}: no courses requested"
        for item in requested:
            code = str(_attr(item, "code"))
            assert code in offered, f"{name}: unknown course {code}"
            allowed_sections = _attr(item, "allowed_sections", None)
            if allowed_sections:
                known = {section["name"] for section in offered[code]["sections"]}
                assert set(map(str, allowed_sections)) <= known, (
                    f"{name}: {code} allowed_sections {allowed_sections} not in {sorted(known)}"
                )


# --------------------------------------------------------------------------- #
# hard constraints
# --------------------------------------------------------------------------- #
def test_each_requested_course_gets_exactly_one_section(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("full_bscse")))

    assert routines(result), "the full BSCSE fixture request is feasible"
    expected = {"CSE 1111", "CSE 1112", "CSE 2213", "MATH 1151"}
    for routine in routines(result):
        codes = [course_code(course) for course in courses_of(routine)]
        assert len(codes) == len(set(codes)), f"duplicate course codes in routine: {codes}"
        assert set(codes) == expected, f"missing or extra courses: {set(codes) ^ expected}"
        for course in courses_of(routine):
            assert section_name(course)
            assert _attr(course, "meetings")


def test_routines_have_no_same_day_overlaps(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("full_bscse")))

    assert routines(result)
    for routine in routines(result):
        meetings = routine_meetings(routine)
        assert_no_conflicts(meetings)
        counts = per_day_sessions(meetings)
        assert max(counts.values()) <= 3, f"request caps sessions at 3 per day: {counts}"


def test_adjacent_meetings_are_allowed(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("adjacent_2213_2218")))

    assert routines(result), "Sun 10:00-11:20 and Sun 11:20-13:20 are adjacent, not overlapping"
    assert len(routines(result)) == 1
    routine = routines(result)[0]
    assert section_keys(routine) == (("CSE 2213", "A"), ("CSE 2218", "A"))
    meetings = routine_meetings(routine)
    assert ("Sun", 10 * 60, 11 * 60 + 20) in meetings
    assert ("Sun", 11 * 60 + 20, 13 * 60 + 20) in meetings
    assert_no_conflicts(meetings)


def test_lab_lecture_overlap_is_rejected(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("overlap_lab_lecture")))

    assert not routines(result), "Sun 11:20-13:20 lab overlaps Sun 11:30-12:50 lecture"
    assert diagnostics(result), "infeasible request must explain why"


def test_lecture_lecture_overlap_is_rejected(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("overlap_lecture_lecture")))

    assert not routines(result), "both sections meet Wed 11:30-12:50"
    assert diagnostics(result)


def test_blocked_exact_time_excludes_section(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("blocked_exact_cse1111")))

    assert routines(result)
    for routine in routines(result):
        assert section_keys(routine) == (("CSE 1111", "B"),)


def test_blocked_partial_overlap_excludes_section(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("blocked_partial_cse1111")))

    assert routines(result)
    for routine in routines(result):
        assert section_keys(routine) == (("CSE 1111", "B"),)


def test_blocked_adjacent_interval_does_not_exclude(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("blocked_adjacent_cse1111")))

    assert routines(result), "08:00-08:30 and 09:50-10:30 touch but do not overlap 08:30-09:50"
    for routine in routines(result):
        assert section_keys(routine) == (("CSE 1111", "A"),)
        assert ("Sat", 8 * 60 + 30, 9 * 60 + 50) in routine_meetings(routine)


def test_max_sessions_per_day_is_enforced(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("max_two_per_day")))

    assert routines(result)
    for routine in routines(result):
        counts = per_day_sessions(routine_meetings(routine))
        assert max(counts.values()) <= 2, f"per-day sessions exceed cap: {counts}"
        assert ("CSE 1112", "B") in section_keys(routine), (
            "CSE 1112 section A adds a third Saturday session, so the cap must select B"
        )


def test_max_sessions_per_day_can_make_request_infeasible(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("max_one_per_day")))

    assert not routines(result), "both courses meet Sat and Tue, so one session/day is impossible"
    assert diagnostics(result)


def test_allowed_days_excludes_other_days(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("allowed_days_mon_wed")))

    assert not routines(result), "CSE 2213 only meets Sun and Wed, so Mon/Wed is infeasible"
    assert diagnostics(result)


def test_allowed_days_permits_full_set(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("allowed_days_mon_wed_sun")))

    assert routines(result)
    for routine in routines(result):
        days = {day for day, _start, _end in routine_meetings(routine)}
        assert days <= {"Sun", "Mon", "Wed"}
        assert {course_code(course) for course in courses_of(routine)} == {"CSE 2213", "CSE 2217"}
def test_program_filter_excludes_course_from_other_program(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("bsds_mixed")))

    assert routines(result), "MATH 1151 is offered to BSDS"
    for routine in routines(result):
        codes = {course_code(course) for course in courses_of(routine)}
        assert "CSE 1111" not in codes, "CSE 1111 is BSCSE-only and must not be offered to BSDS"
        assert codes == {"MATH 1151"}, "the BSDS-offered course must still generate a routine"

    excluded = excluded_courses(result)
    reported = excluded.get("courses_without_candidates", set())
    assert "CSE 1111" in reported, (
        f"program-filtered course must be reported as excluded, got {excluded}"
    )
    assert "MATH 1151" not in reported, (
        f"an offered course must not be reported as excluded, got {excluded}"
    )


def test_program_filter_diagnostic_survives_no_solution(catalog, make_request) -> None:
    request = _request(
        BSDS,
        [{"code": "CSE 1111"}, {"code": "MATH 1151"}],
        allowed_days=("Sun", "Mon", "Wed"),
    )

    result = generate(catalog, make_request(request))

    assert routines(result) == []
    reported = excluded_courses(result).get("courses_without_candidates", set())
    assert "CSE 1111" in reported, "program-excluded course must stay in diagnostics"
    assert "MATH 1151" in reported, "course with no remaining sections must be reported"


def test_program_filter_allows_bsds_course(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("bsds_db_only")))

    assert routines(result), "CSE 2217 is offered to BSDS"
    for routine in routines(result):
        assert {course_code(course) for course in courses_of(routine)} == {"CSE 2217"}


def test_if_required_section_is_hidden_by_default(catalog, request_payload, make_request) -> None:
    offered = generate(catalog, make_request(request_payload("cse2217_default")))
    assert routines(offered)
    for routine in routines(offered):
        assert section_name(courses_of(routine)[0]) in {"A", "B"}

    only_hidden_left = generate(catalog, make_request(request_payload("cse2217_blocked_ab")))
    assert not routines(only_hidden_left), (
        "CSE 2217 section C is if_required; blocking A and B must not surface it"
    )
    assert diagnostics(only_hidden_left)


def test_pinned_section_identity_is_preserved(make_catalog, make_request) -> None:
    meetings = [
        _meeting("Sat", "08:30", "09:50"),
        _meeting("Tue", "08:30", "09:50"),
    ]
    catalog_payload = _catalog(
        _course(
            "TST 1004",
            "Pinned Section",
            3,
            "theory",
            [
                _section("A", "AR", meetings),
                _section("B", "AR", meetings),
            ],
        )
    )
    result = generate(
        make_catalog(catalog_payload),
        make_request(
            _request(BSCSE, [{"code": "TST 1004", "allowed_sections": ["B"]}])
        ),
    )

    assert routines(result), "section B is feasible and explicitly requested"
    for routine in routines(result):
        assert section_keys(routine) == (("TST 1004", "B"),), (
            "pinned section B must keep its identity instead of collapsing to A"
        )


def test_max_gap_limits_the_longest_single_gap(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1101",
            "Gap First",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "08:30", "09:50")])],
        ),
        _course(
            "TST 1102",
            "Gap Second",
            3,
            "theory",
            [_section("A", "TA", [_meeting("Sat", "11:10", "12:30")])],
        ),
    )
    catalog_model = make_catalog(catalog_payload)
    courses = [{"code": "TST 1101"}, {"code": "TST 1102"}]

    exact = _request(BSCSE, courses)
    exact["constraints"]["max_gap_minutes"] = 80
    assert routines(generate(catalog_model, make_request(exact))), (
        "an 80-minute gap is allowed when the cap is 80"
    )

    too_tight = _request(BSCSE, courses)
    too_tight["constraints"]["max_gap_minutes"] = 60
    result = generate(catalog_model, make_request(too_tight))
    assert routines(result) == []
    assert diagnostics(result), "the gap cap should report an infeasible request"


def test_max_campus_days_filters_multi_day_routines(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1201",
            "Day Footprint",
            3,
            "theory",
            [
                _section("A", "AR", [_meeting("Sat", "08:30", "09:50")]),
                _section(
                    "B",
                    "TA",
                    [
                        _meeting("Sat", "08:30", "09:50"),
                        _meeting("Sun", "08:30", "09:50"),
                    ],
                ),
            ],
        )
    )
    payload = _request(BSCSE, [{"code": "TST 1201"}])
    payload["constraints"]["max_campus_days"] = 1
    result = generate(make_catalog(catalog_payload), make_request(payload))

    assert routines(result)
    for routine in routines(result):
        assert int(_attr(_attr(routine, "stats"), "campus_days")) == 1
        assert section_keys(routine) == (("TST 1201", "A"),)


def test_latest_end_removes_late_sections(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1301",
            "End Time",
            3,
            "theory",
            [
                _section("A", "AR", [_meeting("Sat", "08:30", "09:50")]),
                _section("B", "TA", [_meeting("Sat", "15:00", "16:20")]),
            ],
        )
    )
    payload = _request(BSCSE, [{"code": "TST 1301"}])
    payload["constraints"]["latest_end"] = "12:00"
    result = generate(make_catalog(catalog_payload), make_request(payload))

    assert routines(result)
    for routine in routines(result):
        assert all(end <= 12 * 60 for _day, _start, end in routine_meetings(routine))
        assert section_keys(routine) == (("TST 1301", "A"),)


def test_excluded_sections_are_removed_from_candidates(make_catalog, make_request) -> None:
    meetings = [_meeting("Sat", "08:30", "09:50")]
    catalog_payload = _catalog(
        _course(
            "TST 1401",
            "Full Section",
            3,
            "theory",
            [_section("A", "AR", meetings), _section("B", "AR", meetings)],
        )
    )
    result = generate(
        make_catalog(catalog_payload),
        make_request(
            _request(
                BSCSE,
                [{"code": "TST 1401", "excluded_sections": ["A"]}],
            )
        ),
    )

    assert routines(result)
    for routine in routines(result):
        assert section_keys(routine) == (("TST 1401", "B"),)


# --------------------------------------------------------------------------- #
# soft preferences
# --------------------------------------------------------------------------- #
def test_morning_preference_ranks_morning_first(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("morning_cse1111")))

    assert routines(result)
    assert section_name(courses_of(routines(result)[0])[0]) == "A"
    assert ("Sat", 8 * 60 + 30, 9 * 60 + 50) in routine_meetings(routines(result)[0])


def test_afternoon_preference_flips_ranking(catalog, request_payload, make_request) -> None:
    morning = generate(catalog, make_request(request_payload("morning_cse1111")))
    afternoon = generate(catalog, make_request(request_payload("afternoon_cse1111")))

    assert routines(morning) and routines(afternoon)
    assert section_name(courses_of(routines(morning)[0])[0]) == "A"
    assert section_name(courses_of(routines(afternoon)[0])[0]) == "B"


@pytest.mark.parametrize(("initials", "expected"), [("AR", "A"), ("TA", "B")])
def test_preferred_faculty_ranks_matching_section_first(
    initials, expected, catalog, request_payload, make_request
) -> None:
    payload = request_payload("cse1111_only")
    payload["courses"][0]["preferred_faculty"] = [initials]
    result = generate(catalog, make_request(payload))

    assert routines(result)
    assert section_name(courses_of(routines(result)[0])[0]) == expected, (
        f"preferred faculty {initials} should rank section {expected} first"
    )


@pytest.mark.parametrize("identity", ["AR", "ar", "Amina Rahman", "amina rahman"])
def test_excluded_faculty_removes_matching_sections(
    identity, catalog, request_payload, make_request
) -> None:
    payload = request_payload("cse1111_only")
    payload["courses"][0]["excluded_faculty"] = [identity]
    result = generate(catalog, make_request(payload))

    assert routines(result)
    assert section_keys(routines(result)[0]) == (("CSE 1111", "B"),)


def test_excluding_every_faculty_returns_course_without_candidates(
    catalog, request_payload, make_request
) -> None:
    payload = request_payload("cse1111_only")
    payload["courses"][0]["excluded_faculty"] = ["Amina Rahman", "TA"]
    result = generate(catalog, make_request(payload))

    assert routines(result) == []
    assert "CSE 1111" in excluded_courses(result).get("courses_without_candidates", set())


def test_excluded_faculty_overrides_overlapping_preference(
    catalog, request_payload, make_request
) -> None:
    payload = request_payload("cse1111_only")
    payload["courses"][0]["preferred_faculty"] = ["Amina Rahman"]
    payload["courses"][0]["excluded_faculty"] = ["AR"]
    result = generate(catalog, make_request(payload))

    assert routines(result)
    routine = routines(result)[0]
    assert section_keys(routine) == (("CSE 1111", "B"),)
    assert _attr(_attr(routine, "breakdown"), "faculty") == 100.0


def test_compactness_prefers_gapless_routine(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1001",
            "Compactness One",
            3,
            "theory",
            [
                _section("A", "AR", [_meeting("Mon", "08:30", "09:50"), _meeting("Wed", "08:30", "09:50")]),
                _section("B", "AR", [_meeting("Mon", "08:30", "09:50"), _meeting("Wed", "13:30", "15:30")]),
            ],
        ),
        _course(
            "TST 1002",
            "Compactness Two",
            3,
            "theory",
            [
                _section("A", "TA", [_meeting("Mon", "10:00", "11:20"), _meeting("Wed", "10:00", "11:20")]),
                _section("B", "TA", [_meeting("Mon", "14:00", "15:20"), _meeting("Wed", "14:00", "15:20")]),
            ],
        ),
    )
    result = generate(
        make_catalog(catalog_payload),
        make_request(
            _request(BSCSE, [{"code": "TST 1001"}, {"code": "TST 1002"}])
        ),
    )

    assert routines(result)
    gaps = [gap_minutes(routine_meetings(routine)) for routine in routines(result)]
    assert gaps[0] == 20, f"gapless combo has two 10-minute gaps, got {gaps}"
    assert min(gaps) == gaps[0]
    assert section_keys(routines(result)[0]) == (("TST 1001", "A"), ("TST 1002", "A"))


def test_fewer_days_prefers_single_day_routine(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1003",
            "Days Tradeoff",
            3,
            "theory",
            [
                _section("A", "AR", [_meeting("Sat", "08:30", "09:50"), _meeting("Sun", "08:30", "09:50")]),
                _section("B", "AR", [_meeting("Sat", "08:30", "09:50"), _meeting("Sat", "09:50", "11:20")]),
            ],
        )
    )
    result = generate(
        make_catalog(catalog_payload),
        make_request(_request(BSCSE, [{"code": "TST 1003"}], limit=5)),
    )

    assert routines(result)
    top = routines(result)[0]
    assert {day for day, _start, _end in routine_meetings(top)} == {"Sat"}
    assert section_name(courses_of(top)[0]) == "B"
    seen_sections = {
        section_name(course) for routine in routines(result) for course in courses_of(routine)
    }
    assert seen_sections == {"A", "B"}, "both one-day and two-day sections are feasible"


# --------------------------------------------------------------------------- #
# top N
# --------------------------------------------------------------------------- #
def test_limit_truncates_and_sorts(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("full_bscse", limit=2)))

    assert len(routines(result)) == 2
    assert _attr(result, "truncated") is True, "the fixture catalog holds more than two routines"
    assert scores(result) == sorted(scores(result), reverse=True)

    keys = [section_keys(routine) for routine in routines(result)]
    assert len(set(keys)) == len(keys), f"duplicate section tuple returned: {keys}"


def test_result_has_no_duplicate_section_tuples(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("full_bscse")))

    assert len(routines(result)) >= 3
    assert len(routines(result)) <= 10
    keys = [section_keys(routine) for routine in routines(result)]
    assert len(set(keys)) == len(keys), f"duplicate section tuple returned: {keys}"
    assert scores(result) == sorted(scores(result), reverse=True)


def test_truncated_is_false_when_limit_is_large(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("full_bscse", limit=50)))

    assert routines(result)
    assert _attr(result, "truncated") is False, "every feasible routine fits inside limit=50"


def test_generate_is_deterministic(catalog, catalog_payload, request_payload, make_catalog, make_request) -> None:
    payload = request_payload("full_bscse")
    first = generate(catalog, make_request(payload))
    second = generate(make_catalog(catalog_payload), make_request(payload))

    def fingerprint(result):
        return [
            (score_of(routine), section_keys(routine), routine_meetings(routine))
            for routine in routines(result)
        ]

    assert fingerprint(first) == fingerprint(second)


def test_no_solution_returns_diagnostics(catalog, request_payload, make_request) -> None:
    result = generate(catalog, make_request(request_payload("overlap_lab_lecture")))

    assert routines(result) == []
    assert diagnostics(result), "diagnostics must explain an empty result"
    assert isinstance(_attr(result, "truncated"), bool)


# --------------------------------------------------------------------------- #
# server-side paging
# --------------------------------------------------------------------------- #
def test_offset_returns_disjoint_ranked_pages(catalog, request_payload, make_request) -> None:
    first = generate(catalog, make_request(request_payload("full_bscse", limit=3, offset=0)))
    second = generate(catalog, make_request(request_payload("full_bscse", limit=3, offset=3)))

    first_keys = [section_keys(routine) for routine in routines(first)]
    second_keys = [section_keys(routine) for routine in routines(second)]
    assert len(first_keys) == 3
    assert len(second_keys) == 3
    assert set(first_keys).isdisjoint(second_keys)
    assert _attr(first, "total") == _attr(second, "total")
    assert _attr(first, "offset") == 0
    assert _attr(second, "offset") == 3
    assert _attr(first, "limit") == 3
    assert scores(first) == sorted(scores(first), reverse=True)
    assert scores(second) == sorted(scores(second), reverse=True)
    assert scores(first)[-1] >= scores(second)[0], "pages must preserve the global ranking"


def test_offset_past_the_end_returns_an_empty_page(catalog, request_payload, make_request) -> None:
    all_routines = generate(catalog, make_request(request_payload("full_bscse", limit=50)))
    total = _attr(all_routines, "total")

    result = generate(
        catalog,
        make_request(request_payload("full_bscse", limit=3, offset=total)),
    )

    assert routines(result) == []
    assert _attr(result, "total") == total
    assert _attr(result, "offset") == total
    assert _attr(result, "truncated") is False
    assert diagnostics(result), "an empty page should explain itself"


# --------------------------------------------------------------------------- #
# manual project slots
# --------------------------------------------------------------------------- #
def _project_catalog(*extra_courses):
    official = _course(
        "CSE 4000A",
        "Final Year Design Project",
        3,
        "theory",
        [
            _section("A", "AR", [_meeting("Mon", "09:00", "10:30")]),
        ],
    )
    return _catalog(official, *extra_courses)


def test_manual_project_uses_section_meeting_and_official_faculty(make_catalog, make_request) -> None:
    result = generate(
        make_catalog(_project_catalog()),
        make_request(
            _request(
                BSCSE,
                [
                    {
                        "code": "CSE 4000A",
                        "manual_project": {
                            "section": "A",
                            "day": "Sat",
                            "start": "09:00",
                            "end": "11:00",
                        },
                    }
                ],
            )
        ),
    )

    assert routines(result)
    course = courses_of(routines(result)[0])[0]
    assert course_code(course) == "CSE 4000A"
    assert section_name(course) == "A"
    assert _attr(course, "faculty") == FACULTY_NAMES["AR"]
    assert _attr(course, "manual") is True
    meetings = _attr(course, "meetings")
    assert len(meetings) == 1
    assert _minutes(_attr(meetings[0], "start")) == 9 * 60
    assert _minutes(_attr(meetings[0], "end")) == 11 * 60
    assert _attr(meetings[0], "room") == "TBA"


def test_manual_project_unknown_section_gets_tba_faculty(make_catalog, make_request) -> None:
    result = generate(
        make_catalog(_project_catalog()),
        make_request(
            _request(
                BSCSE,
                [
                    {
                        "code": "CSE 4000A",
                        "manual_project": {
                            "section": "Z",
                            "day": "Sun",
                            "start": "13:00",
                            "end": "15:00",
                        },
                    }
                ],
            )
        ),
    )

    assert routines(result)
    course = courses_of(routines(result)[0])[0]
    assert section_name(course) == "Z"
    assert _attr(course, "faculty") == "TBA"


def test_manual_project_participates_in_clash_checks(make_catalog, make_request) -> None:
    conflicting = _course(
        "TST 1001",
        "Conflicting Course",
        3,
        "theory",
        [_section("A", "TA", [_meeting("Sat", "10:00", "11:00")])],
    )
    result = generate(
        make_catalog(_project_catalog(conflicting)),
        make_request(
            _request(
                BSCSE,
                [
                    {
                        "code": "CSE 4000A",
                        "manual_project": {
                            "section": "A",
                            "day": "Sat",
                            "start": "09:00",
                            "end": "11:00",
                        },
                    },
                    {"code": "TST 1001"},
                ],
            )
        ),
    )

    assert routines(result) == []
    assert diagnostics(result), "the manual meeting must be checked for clashes"


def test_manual_project_respects_excluded_faculty(make_catalog, make_request) -> None:
    result = generate(
        make_catalog(_project_catalog()),
        make_request(
            _request(
                BSCSE,
                [
                    {
                        "code": "CSE 4000A",
                        "excluded_faculty": ["AR"],
                        "manual_project": {
                            "section": "A",
                            "day": "Sat",
                            "start": "09:00",
                            "end": "11:00",
                        },
                    }
                ],
            )
        ),
    )

    assert routines(result) == []
    assert "CSE 4000A" in excluded_courses(result).get("courses_without_candidates", set())


def test_manual_project_is_rejected_for_non_project_course(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 1001",
            "Not a Project",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "09:00", "10:30")])],
        )
    )

    with pytest.raises(ValueError, match="manual project sections"):
        generate(
            make_catalog(catalog_payload),
            make_request(
                _request(
                    BSCSE,
                    [
                        {
                            "code": "TST 1001",
                            "manual_project": {
                                "section": "A",
                                "day": "Sat",
                                "start": "09:00",
                                "end": "10:30",
                            },
                        }
                    ],
                )
            ),
        )


# --------------------------------------------------------------------------- #
# randomized validity + performance
# --------------------------------------------------------------------------- #
def test_randomized_requests_are_always_valid(catalog, catalog_payload, make_request) -> None:
    offered = _offered_sections(catalog_payload, BSCSE)
    codes = sorted(offered)
    assert len(codes) >= 4, "fixture needs enough courses for randomized coverage"

    feasible = 0
    for seed in range(60):
        rng = random.Random(seed)

        chosen = []
        allowed_by_code: dict[str, set[str]] = {}
        # 2-4 courses keeps overlap/cap/days constraints in play without making
        # most draws unsatisfiable.
        for code in rng.sample(codes, rng.randint(2, min(4, len(codes)))):
            names = offered[code]
            # Keep at least two sections selectable whenever the course offers
            # them, so a conflict can be resolved instead of forcing infeasibility.
            count = rng.randint(min(2, len(names)), len(names))
            allowed = sorted(rng.sample(names, count))
            chosen.append({"code": code, "allowed_sections": allowed})
            allowed_by_code[code] = set(allowed)

        blocked = []
        for _ in range(rng.randint(0, 2)):
            start = rng.randrange(8 * 60, 16 * 60 + 1, 30)
            end = start + rng.choice([60, 90, 120])
            blocked.append({"day": rng.choice(ALL_DAYS), "start": hhmm(start), "end": hhmm(end)})

        # 4-5 allowed days: still excludes a real day (and the Sun-only lab when
        # Sun is dropped) but keeps a healthy feasible sample.
        allowed_days = rng.sample(ALL_DAYS, rng.randint(4, len(ALL_DAYS)))
        max_sessions = rng.randint(2, 3)
        limit = rng.randint(2, 6)

        payload = _request(
            BSCSE,
            chosen,
            blocked=blocked,
            max_sessions_per_day=max_sessions,
            allowed_days=allowed_days,
            time_preference=rng.choice(["morning", "afternoon", "any"]),
            limit=limit,
        )
        result = generate(catalog, make_request(payload))
        assert isinstance(_attr(result, "truncated"), bool), f"seed {seed}"

        returned = routines(result)
        assert len(returned) <= limit, f"seed {seed}: limit exceeded"
        if not returned:
            assert diagnostics(result), f"seed {seed}: empty result without diagnostics"
            continue

        feasible += 1
        assert scores(result) == sorted(scores(result), reverse=True), f"seed {seed}: not sorted"

        seen = set()
        for routine in returned:
            keys = section_keys(routine)
            assert keys not in seen, f"seed {seed}: duplicate section tuple {keys}"
            seen.add(keys)

            meetings = routine_meetings(routine)
            assert_no_conflicts(meetings)

            days = {day for day, _start, _end in meetings}
            assert days <= set(allowed_days), f"seed {seed}: disallowed days {days - set(allowed_days)}"

            counts = per_day_sessions(meetings)
            assert max(counts.values()) <= max_sessions, (
                f"seed {seed}: per-day sessions {counts} exceed cap {max_sessions}"
            )

            routine_codes = [course_code(course) for course in courses_of(routine)]
            assert len(set(routine_codes)) == len(routine_codes), f"seed {seed}: duplicate course"
            for course in courses_of(routine):
                code = course_code(course)
                assert code in allowed_by_code, f"seed {seed}: unrequested course {code}"
                assert section_name(course) in allowed_by_code[code], (
                    f"seed {seed}: section {code}/{section_name(course)} not allowed"
                )

            for day, start, end in meetings:
                for block in blocked:
                    if block["day"] != day:
                        continue
                    assert not overlaps(
                        start, end, _minutes(block["start"]), _minutes(block["end"])
                    ), (
                        f"seed {seed}: meeting {day} {hhmm(start)}-{hhmm(end)} hits blocked "
                        f"{block['start']}-{block['end']}"
                    )

    assert feasible >= 20, f"only {feasible}/60 randomized requests were feasible"


def test_generate_is_fast_on_fixture_catalog(catalog, request_payload, make_request) -> None:
    request = make_request(request_payload("full_bscse"))

    started = time.perf_counter()
    result = generate(catalog, request)
    elapsed = time.perf_counter() - started

    assert routines(result)
    assert elapsed < 3.0, f"generate took {elapsed:.2f}s on the 6-course fixture catalog"


# --------------------------------------------------------------------------- #
# multi-program requests
# --------------------------------------------------------------------------- #
def test_multiple_programs_admit_courses_from_each(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 2001",
            "CSE Course",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "08:30", "09:50")])],
            programs=(BSCSE,),
        ),
        _course(
            "TST 2002",
            "EEE Course",
            3,
            "theory",
            [_section("A", "TA", [_meeting("Sun", "08:30", "09:50")])],
            programs=(BSEEE,),
        ),
    )
    payload = _request(BSCSE, [{"code": "TST 2001"}, {"code": "TST 2002"}])
    payload["programs"] = [BSCSE, BSEEE]

    result = generate(make_catalog(catalog_payload), make_request(payload))

    assert routines(result)
    for routine in routines(result):
        assert {course_code(course) for course in courses_of(routine)} == {
            "TST 2001",
            "TST 2002",
        }


def test_program_filter_reports_every_selected_program(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 2003",
            "EEE Only",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "08:30", "09:50")])],
            programs=(BSEEE,),
        )
    )
    payload = _request(BSCSE, [{"code": "TST 2003"}])
    payload["programs"] = [BSCSE, BSDS]

    result = generate(make_catalog(catalog_payload), make_request(payload))

    assert routines(result) == []
    messages = " ".join(_attr(item, "message") for item in _attr(result, "diagnostics"))
    assert "BSCSE, BSDS" in messages, messages


def test_empty_program_list_is_rejected() -> None:
    from app.models.requests import GenerateRequest

    payload = _request(BSCSE, [{"code": "TST 2004"}])
    payload["programs"] = []

    with pytest.raises(ValueError):
        GenerateRequest.model_validate(payload)


def test_duplicate_programs_are_collapsed(make_request) -> None:
    payload = _request(BSCSE, [{"code": "CSE 1111"}])
    payload["programs"] = [BSCSE, BSCSE, BSDS]

    request = make_request(payload)

    assert [str(item) for item in _attr(request, "programs")] == [BSCSE, BSDS]


# --------------------------------------------------------------------------- #
# gap definition: a gap must be at least one class slot
# --------------------------------------------------------------------------- #
def test_seam_shorter_than_a_slot_is_not_a_gap(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 3001",
            "First Period",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "08:30", "09:50")])],
        ),
        _course(
            "TST 3002",
            "Next Period",
            3,
            "theory",
            [_section("A", "TA", [_meeting("Sat", "09:51", "11:10")])],
        ),
    )

    result = generate(
        make_catalog(catalog_payload),
        make_request(_request(BSCSE, [{"code": "TST 3001"}, {"code": "TST 3002"}])),
    )

    assert routines(result)
    assert all(int(_attr(routine.stats, "gap_minutes")) == 0 for routine in routines(result))


def test_idle_time_of_a_full_slot_counts_as_a_gap(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "TST 3003",
            "Morning Class",
            3,
            "theory",
            [_section("A", "AR", [_meeting("Sat", "08:30", "09:50")])],
        ),
        _course(
            "TST 3004",
            "Afternoon Class",
            3,
            "theory",
            [_section("A", "TA", [_meeting("Sat", "11:11", "12:30")])],
        ),
    )

    result = generate(
        make_catalog(catalog_payload),
        make_request(_request(BSCSE, [{"code": "TST 3003"}, {"code": "TST 3004"}])),
    )

    assert routines(result)
    # 09:50 -> 11:11 is 81 minutes: one free period plus the 1-minute seam.
    assert all(int(_attr(routine.stats, "gap_minutes")) == 81 for routine in routines(result))


# --------------------------------------------------------------------------- #
# manual project slots for EEE 4902
# --------------------------------------------------------------------------- #
def test_eee_capstone_accepts_a_manual_meeting(make_catalog, make_request) -> None:
    catalog_payload = _catalog(
        _course(
            "EEE 4902",
            "Capstone Project II",
            2,
            "theory",
            [_section("A", "AR", [])],
            programs=(BSEEE,),
        )
    )
    payload = _request(
        BSEEE,
        [
            {
                "code": "EEE 4902",
                "manual_project": {
                    "section": "A",
                    "day": "Mon",
                    "start": "10:00",
                    "end": "12:00",
                },
            }
        ],
    )

    result = generate(make_catalog(catalog_payload), make_request(payload))

    assert routines(result)
    course = courses_of(routines(result)[0])[0]
    assert _attr(course, "manual") is True
    assert [(item.day, item.start, item.end) for item in _attr(course, "meetings")] == [
        ("Mon", "10:00", "12:00")
    ]
