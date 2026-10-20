from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.catalog import Day, Meeting

DEFAULT_ALLOWED_DAYS: tuple[Day, ...] = ("Sat", "Sun", "Mon", "Tue", "Wed")


class SelectedCourse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    allowed_sections: list[str] | None = None
    preferred_faculty: list[str] | None = None


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


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    program: Literal["BSCSE", "BSDS"]
    courses: list[SelectedCourse] = Field(min_length=1)
    constraints: Constraints = Field(default_factory=Constraints)
    limit: int = Field(default=10, ge=1, le=50)


class RoutineCourse(BaseModel):
    code: str
    title: str
    section: str
    faculty: str
    credits: int
    kind: Literal["theory", "lab"]
    meetings: list[Meeting]


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
