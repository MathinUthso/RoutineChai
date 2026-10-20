# UIU Fall 2026 Smart Routine Generator

Parses the UIU Fall 2026 registrar PDF into a structured catalog, generates ranked weekly routines from student constraints, and serves the result through a FastAPI backend and a Next.js interface.

The registrar week is **Saturday through Wednesday**. Thursday and Friday are weekends.

## Stack

- **Parser:** Python 3.12, `pdfplumber` table geometry plus `pypdfium2` page-text repair.
- **Scheduler:** pure Python CSP with bitmask occupancy, MRV/forward checking, and weighted soft-constraint scoring.
- **API:** FastAPI, Pydantic v2, Uvicorn.
- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS v4, Framer Motion.
- **Tests:** pytest, httpx/TestClient.

## Quick Start

### 1. Backend

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Run the API:

```powershell
cd backend
..\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm install
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Start the UI:

```powershell
npm run dev
```

Open `http://localhost:3000`.

If the frontend runs on a different origin, add it to the backend's comma-separated `ALLOWED_ORIGINS` environment variable.

The UI is a three-step flow: **Courses → Constraints → Timetable**. The results step shows the top 10 ranked routines, a Sat–Wed week grid, section/faculty details, and score breakdowns.

## Data Pipeline

The committed catalog is generated from the registrar PDF:

```powershell
.\.venv\Scripts\python.exe backend\scripts\extract_routine.py --pdf "doc\Class Routine with faculty assign Fall 2026.pdf"
```

Outputs:

- `backend/app/data/routine.json` — structured catalog (committed generated artifact).
- `backend/app/data/parse_report.json` — repair/skip/warning report.

Current extraction result:

- 791 of 791 table rows parsed.
- 303 rows repaired from the clean pdfium line.
- 0 rows skipped.
- 101 courses, 791 sections, 1,296 meetings.
- Programs: `BSCSE`, `BSDS`.

The PDF overlays text runs, so a single extractor is not reliable. The parser uses pdfplumber for table structure, validates each row, and repairs ambiguous rows from pypdfium2 full-page text keyed by serial number. It merges duplicate sections by course code and rejects conflicting duplicates.

### Known data caveats

`parse_report.json` records three expected warnings:

- **SL 436** — the pdfium line is truncated before the faculty/credit; repaired from the primary row.
- **SL 723** — room is missing; recorded as `TBA`.
- **SL 750** — faculty is missing; recorded as `TBA`.

Seven sections are marked `if_required` (conditional). They are hidden by default and are only considered when explicitly pinned in a request.

Always verify the generated schedule against the official registrar notice before registration.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/meta` | Term, programs, days, time slots |
| `GET` | `/api/catalog` | Full catalog with sections and meetings |
| `GET` | `/api/courses` | Course summaries; optional `program` and `q` filters |
| `GET` | `/api/courses/{code}` | One course with sections |
| `POST` | `/api/generate` | Generate ranked routines |

`POST /api/generate` request:

```json
{
  "program": "BSCSE",
  "courses": [
    { "code": "CSE 1111" },
    { "code": "CSE 1112", "allowed_sections": ["F"] },
    { "code": "MATH 1151", "preferred_faculty": ["MTR"] }
  ],
  "constraints": {
    "blocked": [{ "day": "Mon", "start": "08:30", "end": "11:10" }],
    "max_sessions_per_day": 3,
    "allowed_days": ["Sat", "Sun", "Tue", "Wed"],
    "time_preference": "morning",
    "preferred_off_days": ["Mon"]
  },
  "limit": 10
}
```

A feasible request returns HTTP 200 with ranked `routines` and a `truncated` flag. An infeasible request also returns HTTP 200, with `routines: []` and `diagnostics`; invalid payloads and unknown courses return HTTP 422.

### Hard constraints

- Exactly one section per selected course.
- No overlapping meetings.
- Blocked day/time windows are excluded.
- Meetings must fall on allowed teaching days.
- At most `max_sessions_per_day` meetings per day.
- Course must be offered to the selected program.
- Conditional (`if_required`) sections are excluded unless explicitly allowed.

### Soft constraints

The scheduler ranks valid routines by weighted preferences for:

- Morning or afternoon classes.
- Preferred faculty.
- Compactness (less idle time on campus).
- Fewer campus days.
- Preferred off days.

`limit` accepts 1–50. Results are deterministic for the same catalog and request.

## Project Layout

```text
backend/
  app/
    api/          FastAPI routes
    models/       Pydantic catalog and request/result contracts
    services/     Parser, catalog loader, scheduler
    data/         Generated routine.json and parse_report.json
  scripts/        PDF extraction CLI
  tests/          Parser, scheduler, and API tests

frontend/
  app/            Next.js page, layout, global styles
  components/     Course picker, constraints, results, ledger UI
  lib/            API client, shared types, schedule helpers, motion tokens

doc/              Source registrar PDF
```

## Verification

Backend:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
```

Current suite: **77 passed**. It covers parser schema and PDF spot checks, hard-constraint rejection, soft-constraint ranking, randomized validity, pinned-section identity, program diagnostics, and API contracts.

Frontend:

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

There is no browser E2E suite yet; frontend verification is lint, typecheck, and production build.

## Scope and Limitations

- No database, authentication, or PDF upload.
- The catalog is an offline generated artifact, not a live registrar feed.
- The API trusts the committed catalog; rebuild it if the registrar publishes a newer PDF.
- Section/faculty preferences are optional; automatic selection is the default.
