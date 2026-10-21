from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.catalog import Day, Meeting, Program

DEFAULT_ALLOWED_DAYS: tuple[Day, ...] = ("Sat", "Sun", "Mon", "Tue", "Wed")
TIME_PATTERN = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class ManualProject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section: str = Field(min_length=1, max_length=16)
    day: Day
    start: str = Field(pattern=TIME_PATTERN)
    end: str = Field(pattern=TIME_PATTERN)

    @model_validator(mode="after")
    def validate_meeting(self) -> ManualProject:
        if self.end <= self.start:
            raise ValueError("manual project meeting must end after it starts")
        return self


class SelectedCourse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    allowed_sections: list[str] | None = None
    excluded_sections: list[str] | None = None
    preferred_faculty: list[str] | None = None
    excluded_faculty: list[str] | None = None
    manual_project: ManualProject | None = None


class BlockedInterval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: Day
    start: str  # HH:MM
    end: str


class Constraints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    blocked: list[BlockedInterval] = Field(default_factory=list)
    max_sessions_per_day: int = Field(default=3, ge=1)
    allowed_days: list[Day] = Field(default_factory=lambda: list(DEFAULT_ALLOWED_DAYS))
    time_preference: Literal["morning", "afternoon", "any"] = "any"
    preferred_off_days: list[Day] = Field(default_factory=list)
    # Live refinements shown on the timetable tab. None means "no cap".
    max_gap_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    max_campus_days: int | None = Field(default=None, ge=1, le=5)
    earliest_start: str | None = Field(default=None, pattern=TIME_PATTERN)
    latest_end: str | None = Field(default=None, pattern=TIME_PATTERN)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programs: list[Program] = Field(min_length=1)
    courses: list[SelectedCourse] = Field(min_length=1)
    constraints: Constraints = Field(default_factory=Constraints)
    limit: int = Field(default=10, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=100_000)

    @field_validator("programs")
    @classmethod
    def dedupe_programs(cls, value: list[Program]) -> list[Program]:
        return list(dict.fromkeys(value))


class RoutineCourse(BaseModel):
    code: str
    title: str
    section: str
    faculty: str
    credits: int
    kind: Literal["theory", "lab"]
    meetings: list[Meeting]
    manual: bool = False


class RoutineStats(BaseModel):
    campus_days: int
    gap_minutes: int
    total_credits: int
    earliest: str | None
    latest: str | None


class ScoreBreakdown(BaseModel):
    time: float
    faculty: float
    compactness: float
    fewer_days: float
    off_days: float


class Routine(BaseModel):
    id: str
    score: float
    breakdown: ScoreBreakdown
    stats: RoutineStats
    courses: list[RoutineCourse]


class Diagnostics(BaseModel):
    reason: Literal["no_solution", "courses_without_candidates", "conflicting_pairs"]
    courses_without_candidates: list[str]
    conflicting_pairs: list[tuple[str, str]]
    message: str


class GenerateResult(BaseModel):
    routines: list[Routine]
    diagnostics: list[Diagnostics]
    truncated: bool
    total: int
    total_is_partial: bool = False
    offset: int
    limit: int
