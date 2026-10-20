from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

Day = Literal["Sat", "Sun", "Mon", "Tue", "Wed"]


class Meeting(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: Day
    start: str  # HH:MM, 24-hour
    end: str
    room: str


class Faculty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    initials: str | None = None


class Section(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    if_required: bool = False
    faculty: Faculty
    meetings: list[Meeting]


class Course(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    title: str
    credits: int
    programs: list[Literal["BSCSE", "BSDS"]]
    kind: Literal["theory", "lab"]
    sections: list[Section]


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    term: str
    programs: list[str]
    generated_at: str
    source: str
    courses: list[Course]
