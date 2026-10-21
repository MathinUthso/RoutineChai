from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from app.models.catalog import Catalog, Course, Faculty, Meeting, Section
from app.models.requests import (
    Constraints,
    Diagnostics,
    GenerateRequest,
    GenerateResult,
    Routine,
    RoutineCourse,
    RoutineStats,
    ScoreBreakdown,
    SelectedCourse,
)

NODE_LIMIT = 200_000
TIME_LIMIT_SECONDS = 2.0
PROJECT_COURSE_CODES = frozenset({"CSE 4000A", "DS 4000A", "EEE 4902"})

WINDOWS: dict[str, tuple[int, int]] = {
    "morning": (8 * 60 + 30, 12 * 60 + 30),
    "afternoon": (12 * 60 + 30, 16 * 60 + 30),
}
WEIGHTS = {"time": 35.0, "faculty": 25.0, "compactness": 20.0, "fewer_days": 15.0, "off_days": 5.0}

Interval = tuple[str, int, int]


@dataclass
class _Candidate:
    code: str
    title: str
    credits: int
    kind: Literal["theory", "lab"]
    section: Section
    meetings: tuple[Interval, ...]
    masks: tuple[tuple[str, int], ...]
    day_counts: tuple[tuple[str, int], ...]
    manual: bool = False


@dataclass(frozen=True)
class _Metrics:
    time: float
    faculty: float
    compactness: float
    fewer_days: float
    off_days: float
    campus_days: int
    gap_minutes: int
    longest_gap: int
    total_credits: int
    earliest: str | None
    latest: str | None

    @property
    def score(self) -> float:
        weighted = (
            WEIGHTS["time"] * self.time
            + WEIGHTS["faculty"] * self.faculty
            + WEIGHTS["compactness"] * self.compactness
            + WEIGHTS["fewer_days"] * self.fewer_days
            + WEIGHTS["off_days"] * self.off_days
        )
        return round(weighted / 100.0, 2)


def generate(catalog: Catalog, request: GenerateRequest) -> GenerateResult:
    by_code = {course.code.strip(): course for course in catalog.courses}
    programs = set(request.programs)
    selected: list[tuple[Course, SelectedCourse]] = []
    excluded: list[str] = []
    seen_codes: set[str] = set()
    for item in request.courses:
        code = item.code.strip()
        if code in seen_codes:
            continue
        seen_codes.add(code)
        course = by_code.get(code)
        if course is None:
            raise ValueError(f"unknown course: {item.code}")
        if not programs.intersection(course.programs):
            excluded.append(code)
            continue
        if item.manual_project is not None and code not in PROJECT_COURSE_CODES:
            raise ValueError(
                "manual project sections are only available for "
                + ", ".join(sorted(PROJECT_COURSE_CODES))
            )
        selected.append((course, item))

    if excluded:
        excluded_diagnostics = [
            Diagnostics(
                reason="courses_without_candidates",
                courses_without_candidates=excluded,
                conflicting_pairs=[],
                message=f"Not offered to {', '.join(request.programs)}: " + ", ".join(excluded),
            )
        ]
    else:
        excluded_diagnostics = []

    if not selected:
        return GenerateResult(
            routines=[],
            diagnostics=excluded_diagnostics
            or [
                Diagnostics(
                    reason="no_solution",
                    courses_without_candidates=[],
                    conflicting_pairs=[],
                    message=f"No requested course is offered to {', '.join(request.programs)}.",
                )
            ],
            truncated=False,
            total=0,
            offset=request.offset,
            limit=request.limit,
        )

    blocked = _blocked_masks(request.constraints)
    candidates = [
        _course_candidates(course, item, request.constraints, blocked)
        for course, item in selected
    ]
    codes = [course.code.strip() for course, _ in selected]

    without = [code for code, options in zip(codes, candidates) if not options]
    if without:
        return GenerateResult(
            routines=[],
            diagnostics=[
                *excluded_diagnostics,
                Diagnostics(
                    reason="courses_without_candidates",
                    courses_without_candidates=without,
                    conflicting_pairs=[],
                    message="No available section for: " + ", ".join(without),
                ),
            ],
            truncated=False,
            total=0,
            offset=request.offset,
            limit=request.limit,
        )

    faculty_prefs: dict[str, set[str]] = {}
    for course, item in selected:
        preferred = {
            name.strip().casefold() for name in item.preferred_faculty or [] if name.strip()
        }
        preferred -= _excluded_faculty_identities(course, item)
        if preferred:
            faculty_prefs[course.code.strip()] = preferred

    slot_minutes = _slot_minutes(catalog)
    solutions, total, capped = _search(
        candidates,
        codes,
        request,
        faculty_prefs,
        slot_minutes,
        time.monotonic() + TIME_LIMIT_SECONDS,
    )
    truncated = capped or total > request.offset + len(solutions)
    if not solutions:
        diagnostics = (
            [
                Diagnostics(
                    reason="no_solution",
                    courses_without_candidates=[],
                    conflicting_pairs=[],
                    message="No routines exist at this page offset.",
                )
            ]
            if total
            else [_diagnostics(codes, candidates, request.constraints, capped)]
        )
        return GenerateResult(
            routines=[],
            diagnostics=[*excluded_diagnostics, *diagnostics],
            truncated=truncated,
            total=total,
            total_is_partial=capped,
            offset=request.offset,
            limit=request.limit,
        )

    routines = [_routine(solution, request, faculty_prefs, slot_minutes) for solution in solutions]
    return GenerateResult(
        routines=routines,
        diagnostics=excluded_diagnostics,
        truncated=truncated,
        total=total,
        total_is_partial=capped,
        offset=request.offset,
        limit=request.limit,
    )


def _minutes(value: str) -> int:
    hours, _, minutes = value.strip().partition(":")
    return int(hours) * 60 + int(minutes)


def _format(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _slot_minutes(catalog: Catalog) -> int:
    """Shortest meeting in the catalog, i.e. one standard class slot.

    Idle time shorter than a slot is a seam between back-to-back periods, not
    a gap a student can use.
    """
    durations = [
        _minutes(meeting.end) - _minutes(meeting.start)
        for course in catalog.courses
        for section in course.sections
        for meeting in section.meetings
        if _minutes(meeting.end) > _minutes(meeting.start)
    ]
    return min(durations) if durations else 0


def _earliest_start_minutes(constraints: Constraints) -> int | None:
    if constraints.earliest_start is None:
        return None
    return _minutes(constraints.earliest_start)


def _latest_end_minutes(constraints: Constraints) -> int | None:
    if constraints.latest_end is None:
        return None
    return _minutes(constraints.latest_end)


def _blocked_masks(constraints: Constraints) -> dict[str, int]:
    masks: dict[str, int] = {}
    for interval in constraints.blocked:
        start = _minutes(interval.start)
        end = _minutes(interval.end)
        if end <= start:
            raise ValueError(f"blocked interval must end after it starts: {interval.start}-{interval.end}")
        mask = ((1 << (end - start)) - 1) << start
        masks[interval.day] = masks.get(interval.day, 0) | mask
    return masks


def _candidate(
    course: Course,
    section: Section,
    allowed_days: set[str],
    blocked: dict[str, int],
    max_sessions: int,
    earliest_start: int | None = None,
    latest_end: int | None = None,
    manual: bool = False,
) -> _Candidate | None:
    meetings: list[Interval] = []
    masks: dict[str, int] = {}
    day_counts: dict[str, int] = {}
    for meeting in section.meetings:
        if meeting.day not in allowed_days:
            return None
        start = _minutes(meeting.start)
        end = _minutes(meeting.end)
        if end <= start:
            return None
        if earliest_start is not None and start < earliest_start:
            return None
        if latest_end is not None and end > latest_end:
            return None
        mask = ((1 << (end - start)) - 1) << start
        if mask & blocked.get(meeting.day, 0):
            return None
        day_counts[meeting.day] = day_counts.get(meeting.day, 0) + 1
        if day_counts[meeting.day] > max_sessions:
            return None
        meetings.append((meeting.day, start, end))
        masks[meeting.day] = masks.get(meeting.day, 0) | mask
    meetings.sort()
    return _Candidate(
        code=course.code.strip(),
        title=course.title,
        credits=course.credits,
        kind=course.kind,
        section=section,
        meetings=tuple(meetings),
        masks=tuple(sorted(masks.items())),
        day_counts=tuple(sorted(day_counts.items())),
        manual=manual,
    )


def _faculty_tokens(section: Section) -> set[str]:
    return {
        token
        for token in (
            section.faculty.name.strip().casefold(),
            (section.faculty.initials or "").strip().casefold(),
        )
        if token
    }


def _excluded_faculty_identities(course: Course, selected: SelectedCourse) -> set[str]:
    excluded = {name.strip().casefold() for name in selected.excluded_faculty or [] if name.strip()}
    if not excluded:
        return set()

    identities: set[str] = set()
    for section in course.sections:
        tokens = _faculty_tokens(section)
        if tokens & excluded:
            identities |= tokens
    return identities


def _manual_project_candidates(
    course: Course,
    selected: SelectedCourse,
    constraints: Constraints,
    blocked: dict[str, int],
) -> list[_Candidate]:
    manual = selected.manual_project
    if manual is None:
        return []

    section_name = manual.section.strip()
    if not section_name:
        return []

    official = next(
        (
            section
            for section in course.sections
            if section.name.strip().casefold() == section_name.casefold()
        ),
        None,
    )
    excluded = {name.strip().casefold() for name in selected.excluded_faculty or [] if name.strip()}
    if official is not None and excluded and _faculty_tokens(official) & excluded:
        return []

    section = Section(
        name=section_name,
        if_required=False,
        faculty=official.faculty if official is not None else Faculty(name="TBA", initials=None),
        meetings=[
            Meeting(day=manual.day, start=manual.start, end=manual.end, room="TBA"),
        ],
    )
    candidate = _candidate(
        course,
        section,
        set(constraints.allowed_days),
        blocked,
        constraints.max_sessions_per_day,
        earliest_start=_earliest_start_minutes(constraints),
        latest_end=_latest_end_minutes(constraints),
        manual=True,
    )
    return [candidate] if candidate is not None else []


def _course_candidates(
    course: Course,
    selected: SelectedCourse,
    constraints: Constraints,
    blocked: dict[str, int],
) -> list[_Candidate]:
    if selected.manual_project is not None:
        return _manual_project_candidates(course, selected, constraints, blocked)

    allowed = {name.strip().casefold() for name in selected.allowed_sections or [] if name.strip()}
    excluded = {name.strip().casefold() for name in selected.excluded_faculty or [] if name.strip()}
    excluded_sections = {
        name.strip().casefold() for name in selected.excluded_sections or [] if name.strip()
    }
    allowed_days = set(constraints.allowed_days)
    earliest_start = _earliest_start_minutes(constraints)
    latest_end = _latest_end_minutes(constraints)
    result: list[_Candidate] = []
    seen: set[tuple] = set()
    for section in sorted(course.sections, key=lambda item: item.name):
        if section.name.strip().casefold() in excluded_sections:
            continue
        if excluded and _faculty_tokens(section) & excluded:
            continue
        if allowed:
            if section.name.strip().casefold() not in allowed:
                continue
        elif section.if_required:
            continue
        candidate = _candidate(
            course,
            section,
            allowed_days,
            blocked,
            constraints.max_sessions_per_day,
            earliest_start=earliest_start,
            latest_end=latest_end,
        )
        if candidate is None:
            continue
        if not allowed:
            # Auto-mode may collapse sections that are indistinguishable to the
            # scheduler. Explicitly pinned sections keep their identity.
            faculty_key = (
                (section.faculty.initials or "").strip().casefold(),
                section.faculty.name.strip().casefold(),
            )
            key = (candidate.meetings, faculty_key)
            if key in seen:
                continue
            seen.add(key)
        result.append(candidate)
    return result


def _fits(
    candidate: _Candidate,
    occupancy: dict[str, int],
    counts: dict[str, int],
    max_sessions: int,
) -> bool:
    for day, count in candidate.day_counts:
        if counts.get(day, 0) + count > max_sessions:
            return False
    for day, mask in candidate.masks:
        if occupancy.get(day, 0) & mask:
            return False
    return True


def _apply(candidate: _Candidate, occupancy: dict[str, int], counts: dict[str, int]) -> None:
    for day, mask in candidate.masks:
        occupancy[day] = occupancy.get(day, 0) | mask
    for day, count in candidate.day_counts:
        counts[day] = counts.get(day, 0) + count


def _undo(candidate: _Candidate, occupancy: dict[str, int], counts: dict[str, int]) -> None:
    for day, mask in candidate.masks:
        occupancy[day] ^= mask
    for day, count in candidate.day_counts:
        counts[day] -= count


def _search(
    candidates: list[list[_Candidate]],
    codes: list[str],
    request: GenerateRequest,
    faculty_prefs: dict[str, set[str]],
    slot_minutes: int,
    deadline: float,
) -> tuple[list[tuple[_Candidate, ...]], int, bool]:
    keep = request.offset + request.limit
    max_sessions = request.constraints.max_sessions_per_day
    best: list[tuple[float, tuple[tuple[str, str], ...], tuple[_Candidate, ...]]] = []
    seen: set[tuple[tuple[str, str], ...]] = set()
    chosen: list[_Candidate] = []
    occupancy: dict[str, int] = {}
    counts: dict[str, int] = {}
    nodes = 0
    total = 0
    capped = False

    def visit(remaining: tuple[int, ...]) -> None:
        nonlocal nodes, total, capped
        if capped:
            return
        nodes += 1
        if nodes > NODE_LIMIT or time.monotonic() > deadline:
            capped = True
            return

        if not remaining:
            solution = tuple(sorted(chosen, key=lambda item: item.code))
            key = tuple((item.code, item.section.name) for item in solution)
            if key in seen:
                return
            seen.add(key)
            metrics = _metrics(solution, request.constraints, faculty_prefs, slot_minutes)
            if not _fits_live_limits(metrics, request.constraints):
                return
            total += 1
            best.append((metrics.score, key, solution))
            if len(best) > max(4 * keep, 32):
                best.sort(key=lambda entry: (-entry[0], entry[1]))
                del best[keep:]
            return

        feasible: list[tuple[int, str, int, list[_Candidate]]] = []
        for index in remaining:
            options = [
                candidate
                for candidate in candidates[index]
                if _fits(candidate, occupancy, counts, max_sessions)
            ]
            if not options:
                return
            feasible.append((len(options), codes[index], index, options))
        feasible.sort(key=lambda entry: (entry[0], entry[1]))
        _, _, index, options = feasible[0]
        next_remaining = tuple(item for item in remaining if item != index)

        for candidate in options:
            _apply(candidate, occupancy, counts)
            chosen.append(candidate)
            visit(next_remaining)
            chosen.pop()
            _undo(candidate, occupancy, counts)
            if capped:
                break

    visit(tuple(range(len(candidates))))
    best.sort(key=lambda entry: (-entry[0], entry[1]))
    page = best[request.offset : request.offset + request.limit]
    return [solution for _, _, solution in page], total, capped


def _metrics(
    solution: tuple[_Candidate, ...],
    constraints: Constraints,
    faculty_prefs: dict[str, set[str]],
    slot_minutes: int,
) -> _Metrics:
    meetings = [meeting for candidate in solution for meeting in candidate.meetings]
    total_minutes = sum(end - start for _, start, end in meetings)

    window = WINDOWS.get(constraints.time_preference)
    if window is None or total_minutes == 0:
        time_score = 100.0
    else:
        inside = sum(
            max(0, min(end, window[1]) - max(start, window[0]))
            for _, start, end in meetings
        )
        time_score = 100.0 * inside / total_minutes

    preferred_courses = [candidate for candidate in solution if faculty_prefs.get(candidate.code)]
    if preferred_courses:
        matched = 0
        for candidate in preferred_courses:
            if _faculty_tokens(candidate.section) & faculty_prefs[candidate.code]:
                matched += 1
        faculty_score = 100.0 * matched / len(preferred_courses)
    else:
        faculty_score = 100.0

    by_day: dict[str, list[tuple[int, int]]] = {}
    for day, start, end in meetings:
        by_day.setdefault(day, []).append((start, end))
    gap_minutes = 0
    longest_gap = 0
    for intervals in by_day.values():
        intervals.sort()
        for (_, previous_end), (next_start, _) in zip(intervals, intervals[1:]):
            gap = max(0, next_start - previous_end)
            # Seams between adjacent periods are shorter than a class slot and
            # do not count as idle time.
            if slot_minutes and gap < slot_minutes:
                continue
            gap_minutes += gap
            longest_gap = max(longest_gap, gap)

    campus_days = len(by_day)
    compactness = max(0.0, 100.0 - gap_minutes / 2.0)
    fewer_days = max(0.0, 100.0 - 20.0 * max(0, campus_days - 1))

    off_days = set(constraints.preferred_off_days)
    if off_days and meetings:
        on_off = sum(1 for day, _, _ in meetings if day in off_days)
        off_score = 100.0 * (len(meetings) - on_off) / len(meetings)
    else:
        off_score = 100.0

    return _Metrics(
        time=time_score,
        faculty=faculty_score,
        compactness=compactness,
        fewer_days=fewer_days,
        off_days=off_score,
        campus_days=campus_days,
        gap_minutes=gap_minutes,
        longest_gap=longest_gap,
        total_credits=sum(candidate.credits for candidate in solution),
        earliest=_format(min(start for _, start, _ in meetings)) if meetings else None,
        latest=_format(max(end for _, _, end in meetings)) if meetings else None,
    )


def _fits_live_limits(metrics: _Metrics, constraints: Constraints) -> bool:
    """Apply the refinements that depend on the finished solution."""
    if constraints.max_gap_minutes is not None and metrics.longest_gap > constraints.max_gap_minutes:
        return False
    if constraints.max_campus_days is not None and metrics.campus_days > constraints.max_campus_days:
        return False
    return True


def _routine(
    solution: tuple[_Candidate, ...],
    request: GenerateRequest,
    faculty_prefs: dict[str, set[str]],
    slot_minutes: int,
) -> Routine:
    metrics = _metrics(solution, request.constraints, faculty_prefs, slot_minutes)
    return Routine(
        id="|".join(f"{candidate.code}={candidate.section.name}" for candidate in solution),
        score=metrics.score,
        breakdown=ScoreBreakdown(
            time=round(metrics.time, 2),
            faculty=round(metrics.faculty, 2),
            compactness=round(metrics.compactness, 2),
            fewer_days=round(metrics.fewer_days, 2),
            off_days=round(metrics.off_days, 2),
        ),
        stats=RoutineStats(
            campus_days=metrics.campus_days,
            gap_minutes=metrics.gap_minutes,
            total_credits=metrics.total_credits,
            earliest=metrics.earliest,
            latest=metrics.latest,
        ),
        courses=[
            RoutineCourse(
                code=candidate.code,
                title=candidate.title,
                section=candidate.section.name,
                faculty=candidate.section.faculty.name,
                credits=candidate.credits,
                kind=candidate.kind,
                meetings=list(candidate.section.meetings),
                manual=candidate.manual,
            )
            for candidate in solution
        ],
    )


def _compatible(first: _Candidate, second: _Candidate, max_sessions: int) -> bool:
    counts: dict[str, int] = {}
    for day, count in first.day_counts + second.day_counts:
        counts[day] = counts.get(day, 0) + count
        if counts[day] > max_sessions:
            return False
    for day, first_mask in first.masks:
        for other_day, second_mask in second.masks:
            if day == other_day and first_mask & second_mask:
                return False
    return True


def _conflicting_pairs(
    codes: list[str],
    candidates: list[list[_Candidate]],
    constraints: Constraints,
) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for index, code in enumerate(codes):
        for other_index in range(index + 1, len(codes)):
            if not any(
                _compatible(first, second, constraints.max_sessions_per_day)
                for first in candidates[index]
                for second in candidates[other_index]
            ):
                pairs.append((code, codes[other_index]))
    return pairs


def _diagnostics(
    codes: list[str],
    candidates: list[list[_Candidate]],
    constraints: Constraints,
    capped: bool,
) -> Diagnostics:
    without = [code for code, options in zip(codes, candidates) if not options]
    pairs = _conflicting_pairs(codes, candidates, constraints) if not without else []
    if without:
        reason = "courses_without_candidates"
        message = "No available section for: " + ", ".join(without)
    elif pairs:
        reason = "conflicting_pairs"
        message = "No sections can be combined for: " + ", ".join(
            f"{first} / {second}" for first, second in pairs
        )
    else:
        reason = "no_solution"
        message = "No combination of sections satisfies every constraint."
    if capped:
        message += " Search stopped at the node/time limit before exhausting options."
    return Diagnostics(
        reason=reason,
        courses_without_candidates=without,
        conflicting_pairs=pairs,
        message=message,
    )
