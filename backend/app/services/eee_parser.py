"""Extract the BSEEE course-offering PDF.

The EEE registrar export has one row per section printed as a single text
line::

    EEE 3403 Microprocessor and Interfacing A 3 531 (Embedded System Lab)Sat T 11:11:AM - 12:30:PM SMLK BSEEE

The layout differs from the CSE/DS routine: no serial, no separate second
room/day/time column, and the day cell keeps both meetings while the time is
shared.  Day cells are abbreviated: ``S W`` means Sunday + Wednesday and
``Sat T`` means Saturday + Tuesday.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pypdfium2 as pdfium

from app.models.catalog import Catalog, Course, Faculty, Meeting, Program, Section
from app.services.parser import ParseReport

PROGRAM: Program = "BSEEE"

CODE_PREFIX_RE = re.compile(r"^[A-Z]{2,4} \d{3,4}[A-Z]?\s")
ROW_RE = re.compile(
    r"^(?P<code>[A-Z]{2,4} \d{3,4}[A-Z]?)\s+"
    r"(?P<body>.+?)\s+(?P<credit>[1-4])\s+"
    r"(?:(?P<room>\d{3}(?:\s*\([^)]*Lab\))?)(?=\s*[A-Z]))?"
    r"\s*(?P<days>(?:(?:Sat|Sun|Mon|Tue|Wed)(?:\s+(?:S|M|T|W))?)"
    r"|(?:(?:S|M|T|W)(?:\s+(?:S|M|T|W))?))"
    r"\s+(?P<time>\d{1,2}:\d{2}:(?:AM|PM)\s*-\s*\d{1,2}:\d{2}:(?:AM|PM))"
    r"\s+(?:(?P<faculty>[A-Za-z][A-Za-z]{1,7})\s+)?BSEEE$"
)
PLACEHOLDER_RE = re.compile(
    r"^(?P<code>[A-Z]{2,4} \d{3,4}[A-Z]?)\s+"
    r"(?P<body>.+?)\s+(?P<credit>[1-4])\s+"
    r"(?P<time>00:00:(?:AM|PM)\s*-\s*00:00:(?:AM|PM))"
    r"\s+(?:(?P<faculty>[A-Za-z][A-Za-z]{1,7})\s+)?BSEEE$"
)
SECTION_RE = re.compile(r"^(?P<title>.+?)\s+(?P<section>[A-Z]{1,2})$")
TIME_RE = re.compile(
    r"^(?P<h1>\d{1,2}):(?P<m1>\d{2}):(?P<p1>AM|PM)\s*-\s*"
    r"(?P<h2>\d{1,2}):(?P<m2>\d{2}):(?P<p2>AM|PM)$"
)

# ``S`` is Sunday: the CSE/DS routine only pairs Saturday with Tuesday and
# Sunday with Wednesday, so a literal Saturday + Wednesday reading would be
# impossible for the registrar grid.
DAY_TOKENS: dict[str, str] = {
    "Sat": "Sat",
    "Sun": "Sun",
    "Mon": "Mon",
    "Tue": "Tue",
    "Wed": "Wed",
    "S": "Sun",
    "M": "Mon",
    "T": "Tue",
    "W": "Wed",
}


@dataclass(frozen=True)
class _Row:
    code: str
    title: str
    section: str
    credits: int
    faculty: Faculty
    meetings: list[Meeting]


def _to_24_hour(hour: str, minute: str, period: str) -> str:
    value = int(hour)
    if period == "AM" and value == 12:
        value = 0
    elif period == "PM" and value != 12:
        value += 12
    return f"{value:02d}:{minute}"


def _times(text: str) -> tuple[str, str] | None:
    match = TIME_RE.match(" ".join(text.split()))
    if match is None:
        return None
    return (
        _to_24_hour(match["h1"], match["m1"], match["p1"]),
        _to_24_hour(match["h2"], match["m2"], match["p2"]),
    )


def parse_eee_line(line: str) -> tuple[_Row | None, str | None]:
    """Parse one BSEEE offering line.

    Returns ``(row, note)``.  ``row`` is ``None`` when the line is not an EEE
    offering (headers, page furniture).  A row with no meetings is a valid
    project course whose time is still unannounced.
    """
    text = " ".join(line.split())
    placeholder = PLACEHOLDER_RE.match(text)
    match = ROW_RE.match(text)
    if placeholder is None and match is None:
        return None, None

    selected = placeholder or match
    assert selected is not None

    body = selected["body"].strip()
    section_match = SECTION_RE.match(body)
    if section_match is None:
        return None, "title/section unreadable"
    title = section_match["title"].strip()
    section = section_match["section"]

    token = (selected["faculty"] or "").strip()
    faculty = Faculty(name=token, initials=token) if token else Faculty(name="TBA", initials=None)

    if placeholder is not None:
        return (
            _Row(
                code=selected["code"],
                title=title,
                section=section,
                credits=int(selected["credit"]),
                faculty=faculty,
                meetings=[],
            ),
            "no meeting time in source; recorded without meetings",
        )

    assert match is not None
    days = [DAY_TOKENS[token] for token in match["days"].split()]
    times = _times(match["time"])
    if times is None or times[0] >= times[1]:
        return None, f"invalid time: {match['time']!r}"

    room = match["room"] or "TBA"
    meetings = [Meeting(day=day, start=times[0], end=times[1], room=room) for day in days]
    return (
        _Row(
            code=match["code"],
            title=title,
            section=section,
            credits=int(match["credit"]),
            faculty=faculty,
            meetings=meetings,
        ),
        None,
    )


def _kind(title: str, credits: int, meetings: list[Meeting]) -> str:
    if credits == 1 or "Laboratory" in title:
        return "lab"
    for meeting in meetings:
        start_h, start_m = (int(value) for value in meeting.start.split(":"))
        end_h, end_m = (int(value) for value in meeting.end.split(":"))
        if (end_h * 60 + end_m) - (start_h * 60 + start_m) >= 150 and "lab" in meeting.room.casefold():
            return "lab"
    return "theory"


def extract_eee_catalog_with_report(
    pdf_path: Path,
    term: str = "Fall 2026",
    source_label: str | None = None,
) -> tuple[Catalog, ParseReport]:
    pdf_path = Path(pdf_path)
    rows: list[_Row] = []
    warnings: list[dict] = []
    candidates = 0
    skipped = 0
    index = 0

    with pdfium.PdfDocument(str(pdf_path)) as document:
        for page_number, page in enumerate(document, start=1):
            text = page.get_textpage().get_text_range()
            for raw_line in text.splitlines():
                line = " ".join(raw_line.split())
                if not line or not line.endswith(f" {PROGRAM}"):
                    continue
                if CODE_PREFIX_RE.match(line) is None:
                    continue
                candidates += 1
                index += 1
                row, note = parse_eee_line(line)
                if row is None:
                    warnings.append(
                        {
                            "source": pdf_path.name,
                            "sl": index,
                            "page": page_number,
                            "reason": note or "unreadable row",
                        }
                    )
                    skipped += 1
                    continue
                rows.append(row)
                if note is not None:
                    warnings.append(
                        {
                            "source": pdf_path.name,
                            "sl": index,
                            "page": page_number,
                            "reason": note,
                        }
                    )

    by_code: dict[str, list[_Row]] = defaultdict(list)
    for row in rows:
        by_code[row.code].append(row)

    courses: list[Course] = []
    for code in sorted(by_code):
        code_rows = by_code[code]
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
                if_required=False,
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
                programs=[PROGRAM],
                kind=_kind(title, credits, [meeting for row in code_rows for meeting in row.meetings]),
                sections=sections,
            )
        )

    catalog = Catalog(
        term=term,
        programs=[PROGRAM],
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source=source_label or pdf_path.name,
        courses=courses,
    )
    report = ParseReport(
        rows=candidates,
        repaired=0,
        skipped=skipped,
        warnings=warnings,
    )
    return catalog, report
