"""Acceptance tests for the HTTP API (``app.main.create_app``).

Contract under test:
  GET  /health              -> 200 ``{"status": "ok"}``
  GET  /api/meta            -> term / programs / days / time_slots / generated_at
  GET  /api/courses         -> course summaries, optional ``?program=`` / ``?q=``
  GET  /api/courses/{code}  -> full course, 404 when unknown
  POST /api/generate        -> 200 GenerateResult; infeasible requests return an
                               empty list plus diagnostics; invalid payloads 422
  CORS                      -> ``http://localhost:3000`` allowed

Every expected value is derived from ``tests/fixtures/api_catalog.json``, the
``api_payload.json`` request bodies, or the contract above - never from the
implementation under test.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
CATALOG_PATH = FIXTURES_DIR / "api_catalog.json"
PAYLOAD_PATH = FIXTURES_DIR / "api_payload.json"

ALL_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed"]
PROGRAMS = ["BSCSE", "BSDS"]
FRONTEND_ORIGIN = "http://localhost:3000"
HHMM = re.compile(r"^\d{2}:\d{2}$")
LAB_SECTION_NAMES = ("section", "section_name", "name")


# --------------------------------------------------------------------------- #
# fixtures
# --------------------------------------------------------------------------- #
def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def catalog_data() -> dict:
    return _read_json(CATALOG_PATH)


@pytest.fixture(scope="module")
def payloads() -> dict:
    return _read_json(PAYLOAD_PATH)


@pytest.fixture(scope="module")
def client():
    try:
        from app.main import create_app
    except ImportError as exc:  # wrong module layout also lands here
        pytest.fail(f"PENDING: app.main.create_app is not importable yet: {exc}")

    from fastapi.testclient import TestClient

    with TestClient(create_app(catalog_path=CATALOG_PATH)) as test_client:
        yield test_client


def _payload(payloads: dict, name: str) -> dict:
    assert name in payloads, f"unknown payload fixture {name!r}; have {sorted(payloads)}"
    return json.loads(json.dumps(payloads[name]))


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _course(catalog_data: dict, code: str) -> dict:
    for course in catalog_data["courses"]:
        if course["code"] == code:
            return course
    raise AssertionError(f"fixture catalog has no course {code!r}")


def _section(catalog_data: dict, code: str, name: str) -> dict:
    for section in _course(catalog_data, code)["sections"]:
        if section["name"] == name:
            return section
    raise AssertionError(f"fixture catalog has no section {code}/{name}")


def _meeting_key(meeting: dict) -> tuple[str, str, str, str]:
    for field in ("day", "start", "end", "room"):
        assert field in meeting, f"meeting {meeting!r} is missing {field!r}"
    return (meeting["day"], meeting["start"], meeting["end"], meeting["room"])


def _minutes(value: str) -> int:
    hours, _, minutes = value.partition(":")
    return int(hours) * 60 + int(minutes)


def _section_name(routine_course: dict) -> str:
    for key in LAB_SECTION_NAMES:
        value = routine_course.get(key)
        if value:
            return str(value)
    raise AssertionError(f"routine course {routine_course!r} exposes no section identifier")


def _gap_minutes(meetings: list[tuple[str, str, str, str]]) -> int:
    by_day: dict[str, list[tuple[int, int]]] = {}
    for day, start, end, _room in meetings:
        by_day.setdefault(day, []).append((_minutes(start), _minutes(end)))
    total = 0
    for intervals in by_day.values():
        intervals.sort()
        for (_start_a, end_a), (start_b, _end_b) in zip(intervals, intervals[1:]):
            total += max(0, start_b - end_a)
    return total


def _assert_no_conflicts(meetings: list[tuple[str, str, str, str]]) -> None:
    by_day: dict[str, list[tuple[int, int]]] = {}
    for day, start, end, _room in meetings:
        assert _minutes(start) < _minutes(end), f"{day} {start}-{end} is not a positive span"
        by_day.setdefault(day, []).append((_minutes(start), _minutes(end)))
    for day, intervals in by_day.items():
        intervals.sort()
        for (_start_a, end_a), (start_b, _end_b) in zip(intervals, intervals[1:]):
            assert start_b >= end_a, f"overlapping meetings on {day}: {intervals}"


# --------------------------------------------------------------------------- #
# fixture contract
# --------------------------------------------------------------------------- #
def test_api_fixture_catalog_matches_contract(catalog_data: dict) -> None:
    assert catalog_data["term"] == "Fall 2026"
    assert set(catalog_data["programs"]) == set(PROGRAMS)
    assert len(catalog_data["courses"]) == 4

    codes = [course["code"] for course in catalog_data["courses"]]
    assert len(set(codes)) == len(codes)
    assert sum(1 for course in catalog_data["courses"] if course["kind"] == "lab") == 1
    assert all(
        len(section["meetings"]) == (2 if course["kind"] == "theory" else 1)
        for course in catalog_data["courses"]
        for section in course["sections"]
    ), "theory courses meet twice, labs once"
    for course in catalog_data["courses"]:
        assert set(course["programs"]) <= set(PROGRAMS)
        assert set(course["programs"])
        for section in course["sections"]:
            for meeting in section["meetings"]:
                assert meeting["day"] in ALL_DAYS
                assert _minutes(meeting["start"]) < _minutes(meeting["end"])


# --------------------------------------------------------------------------- #
# health
# --------------------------------------------------------------------------- #
def test_health_returns_ok(client) -> None:
    response = client.get("/health")

    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ok"}


# --------------------------------------------------------------------------- #
# meta
# --------------------------------------------------------------------------- #
def test_meta_describes_catalog_axes(client, catalog_data: dict) -> None:
    response = client.get("/api/meta")

    assert response.status_code == 200, response.text
    body = response.json()
    assert {"term", "programs", "days", "time_slots", "generated_at"} <= set(body)
    assert body["term"] == catalog_data["term"]
    assert sorted(body["programs"]) == PROGRAMS
    assert body["days"] == ALL_DAYS
    assert body["generated_at"] == catalog_data["generated_at"]

    slots = body["time_slots"]
    assert isinstance(slots, list) and slots, "time_slots must be a non-empty list"
    for slot in slots:
        assert set(slot) == {"start", "end"}, f"time slot shape: {slot}"
        assert HHMM.match(slot["start"]) and HHMM.match(slot["end"]), slot
        assert _minutes(slot["start"]) < _minutes(slot["end"]), slot

    slot_spans = [(slot["start"], slot["end"]) for slot in slots]
    assert len(set(slot_spans)) == len(slot_spans), f"duplicate time slots: {slot_spans}"
    catalog_spans = {
        (meeting["start"], meeting["end"])
        for course in catalog_data["courses"]
        for section in course["sections"]
        for meeting in section["meetings"]
    }
    assert catalog_spans <= set(slot_spans), (
        f"catalog meeting spans missing from time_slots: {sorted(catalog_spans - set(slot_spans))}"
    )


# --------------------------------------------------------------------------- #
# course list / filters
# --------------------------------------------------------------------------- #
def test_course_list_returns_every_course_summary(client, catalog_data: dict) -> None:
    response = client.get("/api/courses")

    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body, list)
    assert {item["code"] for item in body} == {course["code"] for course in catalog_data["courses"]}

    by_code = {item["code"]: item for item in body}
    for course in catalog_data["courses"]:
        summary = by_code[course["code"]]
        for field in ("title", "credits", "programs", "kind"):
            assert summary[field] == course[field], f"{course['code']} summary field {field!r}"
        assert summary["section_count"] == len(course["sections"])
        assert set(summary["faculty_initials"]) == {
            section["faculty"]["initials"] for section in course["sections"]
        }


def test_course_list_filters_by_program(client) -> None:
    response = client.get("/api/courses", params={"program": "BSDS"})

    assert response.status_code == 200, response.text
    assert {item["code"] for item in response.json()} == {"CSE 2213", "MATH 1151"}


def test_course_list_empty_program_means_no_filter(client, catalog_data: dict) -> None:
    response = client.get("/api/courses", params={"program": ""})

    assert response.status_code == 200, response.text
    assert {item["code"] for item in response.json()} == {
        course["code"] for course in catalog_data["courses"]
    }


def test_course_list_filters_by_query_text(client) -> None:
    by_title = client.get("/api/courses", params={"q": "lab"})
    assert by_title.status_code == 200, by_title.text
    assert [item["code"] for item in by_title.json()] == ["CSE 1112"]

    by_code = client.get("/api/courses", params={"q": "2213"})
    assert by_code.status_code == 200, by_code.text
    assert [item["code"] for item in by_code.json()] == ["CSE 2213"]


def test_course_list_unknown_program_returns_no_courses(client) -> None:
    response = client.get("/api/courses", params={"program": "BSCE"})

    assert response.status_code == 200, response.text
    assert response.json() == [], "an unoffered program is an empty filter result, not a server error"


# --------------------------------------------------------------------------- #
# course detail
# --------------------------------------------------------------------------- #
def test_course_detail_returns_full_course(client, catalog_data: dict) -> None:
    expected = _course(catalog_data, "CSE 2213")
    response = client.get("/api/courses/CSE 2213")

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_course_detail_unknown_code_is_404(client) -> None:
    response = client.get("/api/courses/ZZZ 9999")

    assert response.status_code == 404, response.text
    assert response.json().get("detail"), "404 body must explain the miss"


# --------------------------------------------------------------------------- #
# full catalog export
# --------------------------------------------------------------------------- #
def test_catalog_returns_full_catalog_for_docket(client, catalog_data: dict) -> None:
    response = client.get("/api/catalog")

    assert response.status_code == 200, response.text
    body = response.json()
    assert {"term", "programs", "courses"} <= set(body), sorted(body)

    assert body["term"] == catalog_data["term"]
    assert sorted(body["programs"]) == PROGRAMS

    courses = body["courses"]
    assert isinstance(courses, list) and courses, "the docket needs a non-empty course list"
    assert len(courses) >= len(catalog_data["courses"]), (
        f"catalog export dropped courses: {len(courses)} < {len(catalog_data['courses'])}"
    )

    for course in courses:
        assert {"code", "title", "credits", "programs", "kind", "sections"} <= set(course), (
            f"{course.get('code')!r} is missing required fields"
        )
        assert isinstance(course["credits"], int) and not isinstance(course["credits"], bool)
        assert set(course["programs"]) and set(course["programs"]) <= set(PROGRAMS)

    section_seen = False
    for course in courses:
        for section in course["sections"]:
            assert isinstance(section.get("if_required"), bool), (
                f"{course['code']}/{section.get('name')}: if_required must be a boolean"
            )
            meetings = section["meetings"]
            assert 1 <= len(meetings) <= 2, (
                f"{course['code']}/{section['name']} has {len(meetings)} meetings, expected 1-2"
            )
            for meeting in meetings:
                assert meeting["day"] in ALL_DAYS, meeting
                assert HHMM.match(meeting["start"]) and HHMM.match(meeting["end"]), meeting
                assert _minutes(meeting["start"]) < _minutes(meeting["end"]), meeting
            section_seen = True
    assert section_seen, "catalog export exposed no sections for the docket"


# --------------------------------------------------------------------------- #
# generate: feasible
# --------------------------------------------------------------------------- #
def test_generate_valid_request_returns_ranked_routines(client, payloads, catalog_data) -> None:
    payload = _payload(payloads, "valid")
    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert {"routines", "diagnostics", "truncated", "total", "offset", "limit"} <= set(body)
    routines = body["routines"]
    assert routines, "the fixture request is feasible"
    assert len(routines) <= payload["limit"]
    assert body["offset"] == payload.get("offset", 0)
    assert body["limit"] == payload["limit"]
    assert body["total"] >= len(routines)
    assert isinstance(body["total_is_partial"], bool)

    requested = {item["code"] for item in payload["courses"]}
    allowed_sections = {
        (item["code"], name)
        for item in payload["courses"]
        for name in item.get(
            "allowed_sections",
            [section["name"] for section in _course(catalog_data, item["code"])["sections"]],
        )
    }
    allowed_days = set(payload["constraints"]["allowed_days"])
    session_cap = payload["constraints"]["max_sessions_per_day"]

    scores = [routine["score"] for routine in routines]
    assert all(
        isinstance(score, (int, float)) and not isinstance(score, bool) and math.isfinite(score)
        for score in scores
    ), scores
    assert scores == sorted(scores, reverse=True), f"routines must rank best first: {scores}"

    for routine in routines:
        assert {"score", "breakdown", "stats", "courses"} <= set(routine)
        breakdown = routine["breakdown"]
        assert set(breakdown) == {"time", "faculty", "compactness", "fewer_days", "off_days"}
        assert all(
            isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
            for value in breakdown.values()
        ), breakdown

        courses = routine["courses"]
        codes = [course["code"] for course in courses]
        assert len(codes) == len(set(codes)), f"duplicate course in routine: {codes}"
        assert set(codes) == requested, f"missing or extra courses: {set(codes) ^ requested}"

        meetings: list[tuple[str, str, str, str]] = []
        for course in courses:
            name = _section_name(course)
            assert (course["code"], name) in allowed_sections, (
                f"section {course['code']}/{name} is not allowed by the request"
            )
            expected_meetings = {
                _meeting_key(meeting)
                for meeting in _section(catalog_data, course["code"], name)["meetings"]
            }
            actual_meetings = [_meeting_key(meeting) for meeting in course["meetings"]]
            assert set(actual_meetings) == expected_meetings, (
                f"{course['code']}/{name} meetings drifted from the catalog: {actual_meetings}"
            )
            meetings.extend(actual_meetings)

        _assert_no_conflicts(meetings)

        days = {day for day, _start, _end, _room in meetings}
        assert days <= allowed_days, f"routine uses disallowed days: {days - allowed_days}"

        per_day: dict[str, int] = {}
        for day, _start, _end, _room in meetings:
            per_day[day] = per_day.get(day, 0) + 1
        assert max(per_day.values()) <= session_cap, f"per-day sessions exceed cap: {per_day}"

        stats = routine["stats"]
        assert set(stats) == {"campus_days", "gap_minutes", "total_credits", "earliest", "latest"}
        assert stats["campus_days"] == len(days)
        assert stats["gap_minutes"] == _gap_minutes(meetings), stats
        assert stats["total_credits"] == sum(
            _course(catalog_data, course["code"])["credits"] for course in courses
        )
        assert stats["earliest"] == min(start for _day, start, _end, _room in meetings)
        assert stats["latest"] == max(end for _day, _start, end, _room in meetings)


# --------------------------------------------------------------------------- #
# generate: infeasible
# --------------------------------------------------------------------------- #
def test_generate_infeasible_request_returns_diagnostics(client, payloads) -> None:
    payload = _payload(payloads, "no_solution")
    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["routines"] == [], "CSE 2213 meets Sun/Wed, so Sat+Mon is infeasible"
    diagnostics = body.get("diagnostics")
    assert isinstance(diagnostics, list) and diagnostics, f"diagnostics must explain the empty result: {body}"
    for diagnostic in diagnostics:
        assert set(diagnostic) >= {"reason", "message"}, diagnostic
        assert diagnostic["reason"], diagnostic
        assert diagnostic["message"], diagnostic


# --------------------------------------------------------------------------- #
# generate: live refinements
# --------------------------------------------------------------------------- #
def test_generate_removes_excluded_sections(client, payloads) -> None:
    payload = _payload(payloads, "valid")
    payload["courses"][0]["excluded_sections"] = ["A"]
    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["routines"] == [], "CSE 1111 only offers section A"
    assert body["diagnostics"], "the excluded section should be reported"


def test_generate_removes_meetings_after_latest_end(client, payloads) -> None:
    payload = _payload(payloads, "valid")
    payload["constraints"]["latest_end"] = "12:00"
    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["routines"] == [], "CSE 1112 runs until 15:30"
    assert body["diagnostics"], "the late section should be reported"


def test_generate_keeps_only_routines_inside_the_campus_day_cap(client, payloads) -> None:
    payload = _payload(payloads, "valid")
    payload["constraints"]["max_campus_days"] = 1
    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["routines"] == [], "every fixture course meets on two days"
    assert body["diagnostics"], "the campus day cap should be reported"


# --------------------------------------------------------------------------- #
# generate: validation
# --------------------------------------------------------------------------- #
def _empty_courses(payload: dict) -> None:
    payload["courses"] = []


def _unknown_course(payload: dict) -> None:
    payload["courses"] = [{"code": "ZZZ 9999"}]


def _zero_session_cap(payload: dict) -> None:
    payload["constraints"]["max_sessions_per_day"] = 0


def _limit_zero(payload: dict) -> None:
    payload["limit"] = 0


def _limit_too_large(payload: dict) -> None:
    payload["limit"] = 51


def _invalid_allowed_day(payload: dict) -> None:
    payload["constraints"]["allowed_days"] = ["Thu"]


def _invalid_blocked_day(payload: dict) -> None:
    payload["constraints"]["blocked"] = [{"day": "Thu", "start": "08:30", "end": "09:50"}]


def _empty_programs(payload: dict) -> None:
    payload["programs"] = []


def _invalid_latest_end(payload: dict) -> None:
    payload["constraints"]["latest_end"] = "25:00"


def _negative_max_gap(payload: dict) -> None:
    payload["constraints"]["max_gap_minutes"] = -1


def _unknown_program(payload: dict) -> None:
    payload["programs"] = ["BSCE"]


VALIDATION_CASES = {
    "empty_courses": _empty_courses,
    "unknown_course": _unknown_course,
    "zero_max_sessions_per_day": _zero_session_cap,
    "limit_zero": _limit_zero,
    "limit_too_large": _limit_too_large,
    "invalid_allowed_day": _invalid_allowed_day,
    "invalid_blocked_day": _invalid_blocked_day,
    "empty_programs": _empty_programs,
    "unknown_program": _unknown_program,
    "invalid_latest_end": _invalid_latest_end,
    "negative_max_gap": _negative_max_gap,
}


@pytest.mark.parametrize("case", sorted(VALIDATION_CASES))
def test_generate_rejects_invalid_payload(client, payloads, case: str) -> None:
    payload = _payload(payloads, "valid")
    VALIDATION_CASES[case](payload)

    response = client.post("/api/generate", json=payload)

    assert response.status_code == 422, f"{case}: {response.status_code} {response.text}"
    detail = response.json().get("detail")
    assert detail, f"{case}: 422 body must carry validation detail"


# --------------------------------------------------------------------------- #
# generate: multiple programs
# --------------------------------------------------------------------------- #
def test_generate_accepts_multiple_programs(client, payloads) -> None:
    payload = _payload(payloads, "valid")
    payload["programs"] = ["BSCSE", "BSDS"]

    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text
    assert response.json()["routines"], "the fixture request is feasible for both programs"


def test_generate_dedupes_repeated_programs(client, payloads) -> None:
    payload = _payload(payloads, "valid")
    payload["programs"] = ["BSCSE", "BSCSE"]

    response = client.post("/api/generate", json=payload)

    assert response.status_code == 200, response.text


# --------------------------------------------------------------------------- #
# CORS
# --------------------------------------------------------------------------- #
def test_cors_allows_frontend_origin_on_simple_request(client) -> None:
    response = client.get("/health", headers={"Origin": FRONTEND_ORIGIN})

    assert response.status_code == 200, response.text
    assert response.headers.get("access-control-allow-origin") == FRONTEND_ORIGIN


def test_cors_preflight_allows_generate_from_frontend(client) -> None:
    response = client.options(
        "/api/generate",
        headers={
            "Origin": FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200, response.text
    assert response.headers.get("access-control-allow-origin") == FRONTEND_ORIGIN
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_cors_does_not_allow_foreign_origin(client) -> None:
    response = client.get("/health", headers={"Origin": "http://evil.example"})

    assert response.headers.get("access-control-allow-origin") != "http://evil.example"