from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

from app.models.catalog import Catalog, Course, Faculty, Meeting, Section

CODE_RE = re.compile(r"^[A-Z]{2,4} \d{4}[A-Z]?$")
ROOM_RE = re.compile(r"^\d{3}(?: \((?:Computer|Digital|Physics|Circuit) Lab\))?$")
DAY_RE = re.compile(r"^(?:Sat|Sun|Mon|Tue|Wed)$")
SECTION_RE = re.compile(
    r"^(?P<name>[A-Z]{1,2})(?:\s*\((?P<flag>[Ii]f\s+[Rr]equired)\))?$"
)
TIME_RANGE_RE = re.compile(
    r"^(?P<h1>\d{1,2}):(?P<m1>\d{2}):?\s*(?P<p1>AM|PM)\s*-\s*"
    r"(?P<h2>\d{1,2}):(?P<m2>\d{2}):?\s*(?P<p2>AM|PM)$"
)
TIME_TOKEN_RE = re.compile(r"\d{1,2}:\d{2}:(?:AM|PM)")
DAY_TAIL_RE = re.compile(r"(?P<day>Sat|Sun|Mon|Tue|Wed)$")
ROOM_TAIL_RE = re.compile(
    r"(?P<number>\d{3})(?:\s*\((?P<lab>Computer|Digital|Physics|Circuit) Lab\))?$"
)
PDFIUM_HEADER_RE = re.compile(
    r"^(?P<sl>\d+)\s+(?P<program>BSCSE|BSDS)\s+"
    r"(?P<code>[A-Z]{2,4} \d{4}[A-Z]?)\s+(?P<body>.+)$"
)
DUPLICATE_RE = re.compile(r"^(?P<name>.{3,}?)(?:\s*(?P=name))(?P<rest>.*)$")
ATTACHED_INITIALS_RE = re.compile(
    r"^(?P<name>.+?[a-z.)])(?P<initials>[A-Z][A-Za-z]{1,7})$"
)


@dataclass(frozen=True)
class _Row:
    sl: int
    page: int
    program: str
    code: str
    title: str
    section: str
    if_required: bool
    faculty: Faculty
    meetings: list[Meeting]
    credits: int


@dataclass(frozen=True)
class _PdfiumLine:
    sl: int
    program: str
    code: str
    rest: str
    rooms: list[str]
    days: list[str]
    times: list[str]
    tail: str
    credit: int


@dataclass
class ParseReport:
    rows: int
    repaired: int
    skipped: int
    warnings: list[dict]


def normalize_time(value: str) -> tuple[str, str] | None:
    text = " ".join(value.split())
    if text in {"", "-"}:
        return None
    match = TIME_RANGE_RE.match(text)
    if match is None:
        return None
    return (
        _to_24_hour(match["h1"], match["m1"], match["p1"]),
        _to_24_hour(match["h2"], match["m2"], match["p2"]),
    )


def normalize_section(value: str) -> tuple[str, bool]:
    text = " ".join(value.split())
    match = SECTION_RE.match(text)
    if match is None:
        return text, False
    return match["name"], match["flag"] is not None


def normalize_faculty(name: str, initials: str | None = None) -> Faculty:
    clean_name = " ".join((name or "").split())
    clean_initials = " ".join((initials or "").split()) or None
    if clean_initials is not None and (
        clean_initials == clean_name
        or " " in clean_initials
        or clean_initials.upper() == "TBA"
    ):
        clean_initials = None
    return Faculty(name=clean_name, initials=clean_initials)


def extract_catalog(
    pdf_path: Path,
    source_label: str | None = None,
    term: str = "Fall 2026",
) -> Catalog:
    catalog, _ = extract_catalog_with_report(pdf_path, source_label, term)
    return catalog


def extract_catalog_with_report(
    pdf_path: Path,
    source_label: str | None = None,
    term: str = "Fall 2026",
) -> tuple[Catalog, ParseReport]:
    pdf_path = Path(pdf_path)
    lines = _read_pdfium_lines(pdf_path)
    canonical_titles = _canonical_titles(lines)
    known_faculty = _known_faculty(lines)

    primary_rows = _read_primary_rows(pdf_path)
    parsed: list[_Row] = []
    pending: list[tuple[int, list[str], list[str]]] = []
    warnings: list[dict] = []

    for page, cells in primary_rows:
        row, reasons = _parse_primary_row(page, cells, canonical_titles, known_faculty)
        if row is not None:
            parsed.append(row)
            continue
        pending.append((page, cells, reasons))

    initials_by_name: dict[str, str] = {}
    for row in parsed:
        if row.faculty.initials and row.faculty.name not in initials_by_name:
            initials_by_name[row.faculty.name] = row.faculty.initials

    repaired = 0
    skipped = 0
    for page, cells, reasons in pending:
        sl_raw = cells[0] if cells else ""
        if not sl_raw.isdigit() or int(sl_raw) not in lines:
            warnings.append(_warning(sl_raw, page, "; ".join(reasons) or "unreadable row"))
            skipped += 1
            continue
        sl = int(sl_raw)
        row, line_reasons, note = _parse_pdfium_line(
            lines[sl], page, canonical_titles, initials_by_name
        )
        if row is None and "pdfium line truncated" in line_reasons:
            row, fallback_reasons, fallback_note = _parse_truncated_line(
                lines[sl], page, cells, canonical_titles
            )
            line_reasons = line_reasons + fallback_reasons
            note = fallback_note
        if row is None:
            detail = "; ".join(reasons + line_reasons)
            warnings.append(_warning(sl, page, detail or "unrepairable row"))
            skipped += 1
            continue
        parsed.append(row)
        repaired += 1
        if note is not None:
            warnings.append(_warning(sl, page, note))

    catalog = _build_catalog(parsed, term, source_label or pdf_path.name)
    report = ParseReport(
        rows=len(primary_rows),
        repaired=repaired,
        skipped=skipped,
        warnings=warnings,
    )
    return catalog, report


def _warning(sl: str | int, page: int, reason: str) -> dict:
    return {"sl": sl, "page": page, "reason": reason}


def _to_24_hour(hour: str, minute: str, period: str) -> str:
    value = int(hour)
    if period == "AM" and value == 12:
        value = 0
    elif period == "PM" and value != 12:
        value += 12
    return f"{value:02d}:{minute}"


def _to_24_hour_token(token: str) -> str:
    hour, minute, period = token.split(":")
    return _to_24_hour(hour, minute, period)


def _clean_room(value: str) -> str:
    return " ".join(value.split())


def _read_primary_rows(pdf_path: Path) -> list[tuple[int, list[str]]]:
    rows: list[tuple[int, list[str]]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables():
                for cells in table:
                    normalized = [" ".join((cell or "").split()) for cell in cells]
                    if not normalized or normalized[0] == "Sl":
                        continue
                    rows.append((page_number, normalized))
    return rows


def _read_pdfium_lines(pdf_path: Path) -> dict[int, str]:
    lines: dict[int, str] = {}
    with pdfium.PdfDocument(str(pdf_path)) as document:
        for page in document:
            text = page.get_textpage().get_text_range()
            for raw_line in text.splitlines():
                line = raw_line.strip()
                match = PDFIUM_HEADER_RE.match(line)
                if match is None:
                    continue
                sl = int(match["sl"])
                lines.setdefault(sl, line)
    return lines


def _split_line(line: str) -> _PdfiumLine | None:
    match = PDFIUM_HEADER_RE.match(line)
    if match is None:
        return None
    body = match["body"]
    credit_match = re.search(r"\s+(\d+)$", body)
    if credit_match is None:
        # Some overlapping-name rows print the credit directly after the
        # duplicated faculty name ("...Angkon Deb3") with no separating space.
        credit_match = re.search(r"(?<=\D)([1-4])$", body)
    if credit_match is None:
        return None
    credit = int(credit_match.group(1))
    body = body[: credit_match.start()]

    times = TIME_TOKEN_RE.findall(body)
    if not times:
        return None
    first = TIME_TOKEN_RE.search(body)
    last = list(TIME_TOKEN_RE.finditer(body))[-1]
    head = body[: first.start()].strip()
    tail = body[last.end() :].strip()
    if tail.startswith("-"):
        tail = tail[1:].strip()

    days: list[str] = []
    for _ in range(2):
        day_match = DAY_TAIL_RE.search(head)
        if day_match is None:
            break
        days.insert(0, day_match["day"])
        head = head[: day_match.start()].strip()

    rooms: list[str] = []
    for _ in range(2):
        room_match = ROOM_TAIL_RE.search(head)
        if room_match is None:
            break
        lab = room_match["lab"]
        rooms.insert(
            0,
            f"{room_match['number']} ({lab} Lab)" if lab else room_match["number"],
        )
        head = head[: room_match.start()].strip()

    return _PdfiumLine(
        sl=int(match["sl"]),
        program=match["program"],
        code=match["code"],
        rest=head,
        rooms=rooms,
        days=days,
        times=times,
        tail=tail,
        credit=credit,
    )


def _raw_title(rest: str) -> tuple[str, str | None, bool]:
    rest = rest.strip()
    match = re.match(
        r"^(?P<title>.+?)\s+(?P<section>[A-Z]{1,2})\s*"
        r"\((?P<flag>[Ii]f\s+[Rr]equired)\)$",
        rest,
    )
    if match:
        return match["title"], match["section"], True
    match = re.match(r"^(?P<title>.+?)\s*\((?P<flag>[Ii]f\s+[Rr]equired)\)$", rest)
    if match:
        return match["title"], None, True
    match = re.match(
        r"^(?P<title>.+?Laboratory)\s*(?P<section>[A-Z]{1,2})$", rest
    )
    if match:
        return match["title"], match["section"], False
    match = re.match(r"^(?P<title>.+)\s+(?P<section>[A-Z]{1,2})$", rest)
    if match:
        return match["title"], match["section"], False
    match = re.match(r"^(?P<title>.+?[a-z)])(?P<section>[A-Z]{1,2})$", rest)
    if match:
        return match["title"], match["section"], False
    return rest, None, False


def _split_section_remainder(text: str) -> tuple[bool, str | None]:
    text = text.strip()
    match = re.fullmatch(
        r"(?P<section>[A-Z]{1,2})?\s*\((?P<flag>[Ii]f\s+[Rr]equired)\)", text
    )
    if match:
        return True, match["section"]
    match = re.fullmatch(r"(?P<section>[A-Z]{1,2})", text)
    if match:
        return False, match["section"]
    return False, None


def _split_title_section(
    rest: str, canonical: str | None
) -> tuple[str, str | None, bool]:
    rest = rest.strip()
    if canonical is not None and rest.startswith(canonical):
        flag, section = _split_section_remainder(rest[len(canonical) :])
        return canonical, section, flag
    return _raw_title(rest)


def _canonical_titles(lines: dict[int, str]) -> dict[str, str]:
    candidates: dict[str, Counter] = defaultdict(Counter)
    for line in lines.values():
        parts = _split_line(line)
        if parts is None:
            continue
        title, _, _ = _split_title_section(parts.rest, None)
        candidates[parts.code][title] += 1
    return {
        code: counter.most_common(1)[0][0] for code, counter in candidates.items()
    }


def _known_faculty(lines: dict[int, str]) -> set[str]:
    names: set[str] = set()
    for line in lines.values():
        parts = _split_line(line)
        if parts is None or not parts.tail:
            continue
        name, _ = _parse_faculty_text(parts.tail)
        if name:
            names.add(name)
    return names


def _split_duplicate(text: str) -> tuple[str, str]:
    match = DUPLICATE_RE.match(text.strip())
    if match is None:
        return text.strip(), ""
    return match["name"].strip(), match["rest"].strip()


def _looks_like_initials(token: str) -> bool:
    if re.fullmatch(r"[A-Z][A-Za-z]{1,7}", token) is None:
        return False
    return sum(char.isupper() for char in token) >= 2


def _split_initials(text: str) -> tuple[str, str | None]:
    match = ATTACHED_INITIALS_RE.match(text)
    if match and _looks_like_initials(match["initials"]):
        return match["name"].strip(), match["initials"]
    head, separator, tail = text.rpartition(" ")
    if separator and _looks_like_initials(tail):
        return head.strip(), tail
    return text.strip(), None


def _parse_faculty_text(text: str) -> tuple[str, str | None]:
    name, remainder = _split_duplicate(text)
    name, initials = _split_initials(name)
    if initials is None and _looks_like_initials(remainder):
        initials = remainder
    if name.upper() == "TBA":
        return "TBA", None
    return name, initials


def _parse_primary_row(
    page: int,
    cells: list[str],
    canonical_titles: dict[str, str],
    known_faculty: set[str],
) -> tuple[_Row | None, list[str]]:
    if len(cells) != 14:
        return None, [f"expected 14 cells, found {len(cells)}"]
    (
        sl_raw,
        program,
        code,
        title,
        section_raw,
        room1_raw,
        room2_raw,
        day1_raw,
        day2_raw,
        time1_raw,
        time2_raw,
        name_raw,
        initials_raw,
        credit_raw,
    ) = cells
    reasons: list[str] = []

    if not sl_raw.isdigit():
        reasons.append("invalid serial")
    if program not in {"BSCSE", "BSDS"}:
        reasons.append("invalid program")
    if CODE_RE.match(code) is None:
        reasons.append("invalid course code")

    canonical = canonical_titles.get(code)
    if canonical is not None:
        if title == canonical:
            pass
        elif canonical.startswith(title) and title:
            title = canonical
        else:
            reasons.append("title mismatch")
    elif not title:
        reasons.append("missing title")

    section, if_required = normalize_section(section_raw)
    if re.fullmatch(r"[A-Z]{1,2}", section) is None:
        reasons.append("invalid section")

    room1 = _clean_room(room1_raw)
    room2 = _clean_room(room2_raw)
    if ROOM_RE.match(room1) is None:
        reasons.append("invalid room")
    if DAY_RE.match(day1_raw) is None:
        reasons.append("invalid day")

    times = normalize_time(time1_raw)
    if times is None:
        reasons.append("invalid time")
    has_second_day = bool(day2_raw)
    if has_second_day:
        if DAY_RE.match(day2_raw) is None:
            reasons.append("invalid second day")
        if ROOM_RE.match(room2) is None:
            reasons.append("invalid second room")
        second_times = normalize_time(time2_raw)
        if second_times is None:
            reasons.append("invalid second time")
    else:
        second_times = None
        if time2_raw not in {"", "-"}:
            reasons.append("unexpected second time")

    credits = int(credit_raw) if credit_raw.isdigit() else 0
    if not 1 <= credits <= 4:
        reasons.append("invalid credit")

    name = " ".join(name_raw.split())
    if not name:
        reasons.append("missing faculty")
    elif name != "TBA" and known_faculty and name not in known_faculty:
        reasons.append("faculty mismatch")

    if reasons or times is None:
        return None, reasons

    meetings = [Meeting(day=day1_raw, start=times[0], end=times[1], room=room1)]
    if has_second_day and second_times is not None:
        meetings.append(
            Meeting(
                day=day2_raw,
                start=second_times[0],
                end=second_times[1],
                room=room2 or room1,
            )
        )

    faculty = normalize_faculty(name, initials_raw)
    return (
        _Row(
            sl=int(sl_raw),
            page=page,
            program=program,
            code=code,
            title=title,
            section=section,
            if_required=if_required,
            faculty=faculty,
            meetings=meetings,
            credits=credits,
        ),
        [],
    )


def _parse_truncated_line(
    line: str,
    page: int,
    cells: list[str],
    canonical_titles: dict[str, str],
) -> tuple[_Row | None, list[str], str | None]:
    """Repair a pdfium line that lost its credit/faculty tail.

    A few overprinted rows end at the final time, so ``_split_line`` cannot
    find a credit token.  The credit and faculty are still intact in the
    pdfplumber row; re-parse the pdfium line with that credit appended and
    take the faculty from the primary row.
    """
    if len(cells) != 14:
        return None, ["fallback expected 14 cells"], None

    credit_raw = cells[13].strip()
    if not credit_raw.isdigit() or not 1 <= int(credit_raw) <= 4:
        return None, ["fallback invalid credit"], None

    parts = _split_line(f"{line} {credit_raw}")
    if parts is None:
        return None, ["fallback line unreadable"], None

    title, section, if_required = _split_title_section(
        parts.rest, canonical_titles.get(parts.code)
    )
    if not title or section is None:
        return None, ["fallback title/section unreadable"], None
    if len(parts.days) != len(parts.times) // 2:
        return None, ["fallback days/times mismatch"], None
    if not parts.rooms:
        return None, ["fallback room missing"], None

    name = " ".join(cells[11].split())
    if not name:
        return None, ["fallback faculty missing"], None
    initials_raw = " ".join(cells[12].split()) or None
    faculty = normalize_faculty(name, initials_raw)

    meetings: list[Meeting] = []
    for index, day in enumerate(parts.days):
        start = _to_24_hour_token(parts.times[index * 2])
        end = _to_24_hour_token(parts.times[index * 2 + 1])
        if not start < end:
            return None, ["fallback start not before end"], None
        room = parts.rooms[index] if index < len(parts.rooms) else parts.rooms[0]
        meetings.append(Meeting(day=day, start=start, end=end, room=room))

    return (
        _Row(
            sl=parts.sl,
            page=page,
            program=parts.program,
            code=parts.code,
            title=title,
            section=section,
            if_required=if_required,
            faculty=faculty,
            meetings=meetings,
            credits=parts.credit,
        ),
        [],
        "pdfium line truncated; repaired from primary row",
    )


def _parse_pdfium_line(
    line: str,
    page: int,
    canonical_titles: dict[str, str],
    initials_by_name: dict[str, str],
) -> tuple[_Row | None, list[str], str | None]:
    parts = _split_line(line)
    if parts is None:
        return None, ["pdfium line truncated"], None

    title, section, if_required = _split_title_section(
        parts.rest, canonical_titles.get(parts.code)
    )
    if not title or section is None:
        return None, ["pdfium title/section unreadable"], None
    if len(parts.days) != len(parts.times) // 2:
        return None, ["pdfium days/times mismatch"], None

    note: str | None = None
    rooms = list(parts.rooms)
    if not rooms:
        rooms = ["TBA"]
        note = "room missing; recorded as TBA"

    if not parts.tail:
        faculty = Faculty(name="TBA", initials=None)
        note = "faculty missing; recorded as TBA"
    else:
        name, initials = _parse_faculty_text(parts.tail)
        if not name:
            return None, ["pdfium faculty unreadable"], None
        if initials is None:
            initials = initials_by_name.get(name)
        faculty = normalize_faculty(name, initials)

    meetings: list[Meeting] = []
    for index, day in enumerate(parts.days):
        start = _to_24_hour_token(parts.times[index * 2])
        end = _to_24_hour_token(parts.times[index * 2 + 1])
        if not start < end:
            return None, ["pdfium start not before end"], None
        room = rooms[index] if index < len(rooms) else rooms[0]
        meetings.append(Meeting(day=day, start=start, end=end, room=room))

    if not 1 <= parts.credit <= 4:
        return None, ["pdfium invalid credit"], None

    return (
        _Row(
            sl=parts.sl,
            page=page,
            program=parts.program,
            code=parts.code,
            title=title,
            section=section,
            if_required=if_required,
            faculty=faculty,
            meetings=meetings,
            credits=parts.credit,
        ),
        [],
        note,
    )


def _meeting_minutes(meeting: Meeting) -> int:
    start_hour, start_minute = (int(value) for value in meeting.start.split(":"))
    end_hour, end_minute = (int(value) for value in meeting.end.split(":"))
    return (end_hour * 60 + end_minute) - (start_hour * 60 + start_minute)


def _course_kind(rows: list[_Row], title: str, credits: int) -> str:
    if credits == 1 or "Laboratory" in title:
        return "lab"
    if any(
        len(row.meetings) == 1
        and _meeting_minutes(row.meetings[0]) >= 150
        and "lab" in row.meetings[0].room.casefold()
        for row in rows
    ):
        return "lab"
    return "theory"


def _build_catalog(rows: list[_Row], term: str, source: str) -> Catalog:
    by_code: dict[str, list[_Row]] = defaultdict(list)
    for row in rows:
        by_code[row.code].append(row)

    courses: list[Course] = []
    for code, code_rows in by_code.items():
        title = code_rows[0].title
        credits = code_rows[0].credits
        for row in code_rows:
            if row.title != title or row.credits != credits:
                raise ValueError(f"inconsistent metadata for course {code}")

        sections: list[Section] = []
        seen: dict[str, Section] = {}
        for row in code_rows:
            section = Section(
                name=row.section,
                if_required=row.if_required,
                faculty=row.faculty,
                meetings=row.meetings,
            )
            previous = seen.get(row.section)
            if previous is not None:
                if previous == section:
                    continue
                raise ValueError(f"conflicting duplicate section {code}/{row.section}")
            seen[row.section] = section
            sections.append(section)

        courses.append(
            Course(
                code=code,
                title=title,
                credits=credits,
                programs=sorted({row.program for row in code_rows}),
                kind=_course_kind(code_rows, title, credits),
                sections=sections,
            )
        )

    return Catalog(
        term=term,
        programs=sorted({program for course in courses for program in course.programs}),
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source=source,
        courses=courses,
    )
