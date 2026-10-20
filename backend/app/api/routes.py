from __future__ import annotations

from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.models.catalog import Catalog, Course, Day
from app.models.requests import GenerateRequest, GenerateResult
from app.services.scheduler import generate

DAYS = get_args(Day)


class TimeSlot(BaseModel):
    start: str
    end: str


class MetaResponse(BaseModel):
    term: str
    programs: list[str]
    days: list[str]
    time_slots: list[TimeSlot]
    generated_at: str


class CourseSummary(BaseModel):
    code: str
    title: str
    credits: int
    programs: list[str]
    kind: str
    section_count: int
    faculty_initials: list[str]


def get_catalog(request: Request) -> Catalog:
    return request.app.state.catalog


health_router = APIRouter()


@health_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


router = APIRouter(prefix="/api")


@router.get("/meta", response_model=MetaResponse)
def get_meta(catalog: Catalog = Depends(get_catalog)) -> MetaResponse:
    slots = sorted(
        {
            (meeting.start, meeting.end)
            for course in catalog.courses
            for section in course.sections
            for meeting in section.meetings
        }
    )
    return MetaResponse(
        term=catalog.term,
        programs=catalog.programs,
        days=list(DAYS),
        time_slots=[TimeSlot(start=start, end=end) for start, end in slots],
        generated_at=catalog.generated_at,
    )


@router.get("/catalog", response_model=Catalog)
def get_catalog_export(catalog: Catalog = Depends(get_catalog)) -> Catalog:
    """Full catalog used by the browser to build the course docket."""
    return catalog


@router.get("/courses", response_model=list[CourseSummary])
def list_courses(
    catalog: Catalog = Depends(get_catalog),
    program: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[CourseSummary]:
    needle = (q or "").strip().casefold()
    summaries: list[CourseSummary] = []

    for course in catalog.courses:
        if program and program not in course.programs:
            continue
        if needle and needle not in course.code.casefold() and needle not in course.title.casefold():
            continue

        initials: list[str] = []
        for section in course.sections:
            if section.faculty.initials and section.faculty.initials not in initials:
                initials.append(section.faculty.initials)

        summaries.append(
            CourseSummary(
                code=course.code,
                title=course.title,
                credits=course.credits,
                programs=list(course.programs),
                kind=course.kind,
                section_count=len(course.sections),
                faculty_initials=initials,
            )
        )

    return summaries


@router.get("/courses/{code}", response_model=Course)
def get_course(code: str, catalog: Catalog = Depends(get_catalog)) -> Course:
    for course in catalog.courses:
        if course.code == code:
            return course
    raise HTTPException(status_code=404, detail=f"Unknown course: {code}")


@router.post("/generate", response_model=GenerateResult)
def generate_routines(
    payload: GenerateRequest,
    catalog: Catalog = Depends(get_catalog),
) -> GenerateResult:
    known = {course.code for course in catalog.courses}
    for item in payload.courses:
        if item.code not in known:
            raise HTTPException(status_code=422, detail=f"Unknown course code: {item.code}")

    try:
        return generate(catalog, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
