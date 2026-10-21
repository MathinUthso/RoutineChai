# routineChai — UIU Fall 2026 Routine Planner

Parses the UIU Fall 2026 registrar PDF into a structured catalog, generates ranked weekly routines from student constraints, and serves the result through a FastAPI backend and a Next.js interface. The web app, the Render service (`RoutineChai`), and the Vercel project (`routine-chai`) all ship under the same name.

The registrar week is **Saturday through Wednesday**. Thursday and Friday are weekends.

## Stack

- **Parser:** Python 3.12, `pdfplumber` table geometry plus `pypdfium2` page-text repair.
- **Scheduler:** pure Python CSP with bitmask occupancy, MRV/forward checking, and weighted soft-constraint scoring.
- **API:** FastAPI, Pydantic v2, Uvicorn.
- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS v4, Framer Motion.
- **Tests:** pytest, httpx/TestClient.

## Quick Start

### One command

After installing the backend venv and frontend dependencies, run both services from the repository root:

```powershell
.\dev.ps1
```

The script starts Uvicorn and Next.js together, points the frontend at the selected backend port, sets the backend CORS origin to the selected frontend port, waits for both services, and keeps them running until `Ctrl+C`. It stops both process trees on exit. If a default port is busy, it uses the next available port and prints a warning.

Verify the full startup without leaving servers running:

```powershell
.\dev.ps1 -Check
```

Choose explicit ports when needed:

```powershell
.\dev.ps1 -BackendPort 8010 -FrontendPort 3100
```

If PowerShell blocks local scripts, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1
```

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

The UI is a three-step flow: **Courses → Constraints → Timetable**. Programs are a multi-select (BSCSE default, BSDS and BSEEE optional), so a student can combine courses from more than one program. The results step shows server-backed pages of 10 ranked plans, a Sat–Wed week grid, section/faculty details, and score breakdowns. Each plan can be downloaded as a weekly Google Calendar `.ics` file.

The timetable step is built for fast section picking:

- **Three rails** — live constraints and the plan list on the left, the plan and its weekly grid in the middle, the section board on the right. Explanations live in tooltips and metadata rows instead of paragraphs.
- **Live constraints** — five sliders (earliest start, latest end, longest single gap, campus days, classes per day) re-rank the plans on the server as they move; the previous list stays on screen while the solver works.
- **Plans and backups** — every ranked routine is one complete section combination, labelled `Plan A`, `Plan B`, `Plan C`, and so on. The rest of the list is the backup ladder, and paging walks the remaining combinations.
- **Section board** — for the open plan, every catalog section of every course is listed as *current*, *ready to swap*, *conditional*, *conflict*, or *marked full*. Swapping one section re-scores the plan server-side; marking a section full removes it from the solver and re-ranks the remaining combinations, which is how a student falls back from Plan A to Plan B when the registrar fills a section.

## Data Pipeline

The committed catalog is generated from the two registrar PDFs:

```powershell
.\.venv\Scripts\python.exe backend\scripts\extract_routine.py --pdf "doc\Class Routine with faculty assign Fall 2026.pdf" --eee-pdf "doc\EEEfall26classroutine.pdf"
```

Outputs:

- `backend/app/data/routine.json` — structured catalog (committed generated artifact).
- `backend/app/data/parse_report.json` — repair/skip/warning report.

Current extraction result:

- 917 of 917 offering rows parsed.
- 303 CSE/DS rows repaired from the clean pdfium line.
- 0 rows skipped.
- 161 courses, 917 sections, 1,507 meetings.
- Programs: `BSCSE`, `BSDS`, `BSEEE`.

The CSE/DS PDF overlays text runs, so a single extractor is not reliable. That parser uses pdfplumber for table structure, validates each row, and repairs ambiguous rows from pypdfium2 full-page text keyed by serial number. It merges duplicate sections by course code and rejects conflicting duplicates.

The BSEEE offering PDF is read line by line with pypdfium2. Its day cells are abbreviated pairs sharing one time: `S W` means Sunday + Wednesday, `Sat T` means Saturday + Tuesday. A course code that appears in both PDFs is merged into one entry: programs, sections, and meetings are unioned, while conflicting titles, credits, or section meetings fail the build. Shared service courses such as `BDS 1201`, `ENG 1011`, and `ENG 1013` keep course-level program tags, so a section is selectable when its course is tagged for at least one selected program.

### Known data caveats

`parse_report.json` records four expected warnings:

- **SL 436** — the pdfium line is truncated before the faculty/credit; repaired from the primary row.
- **SL 723** — room is missing; recorded as `TBA`.
- **SL 750** — faculty is missing; recorded as `TBA`.
- **EEE 4902** — the EEE PDF has no meeting time; imported with no meetings and offered as a manual project slot.

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
  "programs": ["BSCSE"],
  "courses": [
    { "code": "CSE 1111" },
    { "code": "CSE 1112", "allowed_sections": ["F"] },
    { "code": "CSE 2213", "excluded_sections": ["A"] },
    { "code": "MATH 1151", "preferred_faculty": ["MTR"], "excluded_faculty": ["AR"] },
    {
      "code": "CSE 4000A",
      "manual_project": {
        "section": "A",
        "day": "Sat",
        "start": "09:00",
        "end": "11:00"
      }
    }
  ],
  "constraints": {
    "blocked": [{ "day": "Mon", "start": "08:30", "end": "11:10" }],
    "max_sessions_per_day": 3,
    "allowed_days": ["Sat", "Sun", "Tue", "Wed"],
    "time_preference": "morning",
    "preferred_off_days": ["Mon"],
    "max_gap_minutes": 90,
    "max_campus_days": 4,
    "earliest_start": "09:00",
    "latest_end": "15:00"
  },
  "limit": 10,
  "offset": 0
}
```

A feasible request returns HTTP 200 with ranked `routines`, `total`, `offset`, `limit`, `truncated`, and `total_is_partial`. `truncated` means more routines exist beyond this page; `total_is_partial` means the solver hit its search cap and `total` is a lower bound. An infeasible request also returns HTTP 200, with `routines: []` and `diagnostics`; invalid payloads and unknown courses return HTTP 422.

`programs` accepts one or more of `BSCSE`, `BSDS`, `BSEEE`; duplicates are collapsed. Any course tagged for at least one selected program is eligible. The UI defaults to `BSCSE` only and shows every program tagged in the catalog.

`manual_project` is limited to `CSE 4000A`, `DS 4000A`, and `EEE 4902`. It replaces the registrar sections for that course with one student-entered weekly meeting, inherits the official faculty when the section matches the catalog, uses `TBA` otherwise, and participates in clash and exclusion checks. Room is always `TBA`.

### Hard constraints

- Exactly one section per selected course.
- No overlapping meetings.
- Blocked day/time windows are excluded.
- Meetings must fall on allowed teaching days.
- At most `max_sessions_per_day` meetings per day.
- Course must be offered to at least one selected program.
- Conditional (`if_required`) sections are excluded unless explicitly allowed.
- Sections taught by `excluded_faculty` are removed, even when pinned.
- Sections named in `excluded_sections` are removed, even when pinned.
- No meeting may start before `earliest_start` or end after `latest_end`.
- A plan may not contain a single idle gap longer than `max_gap_minutes`, and may not span more than `max_campus_days` teaching days.
- Manual project meetings replace the catalog sections and still obey clash, day, session-cap, and faculty-exclusion rules.

`max_gap_minutes`, `max_campus_days`, `earliest_start`, and `latest_end` are optional; omitting them means no cap. The timetable step drives them from the live sliders, and `excluded_sections` from the section board's *mark full* action.

### Soft constraints

The scheduler ranks valid routines by weighted preferences for:

- Morning or afternoon classes.
- Preferred faculty.
- Compactness (less idle time on campus).
- Fewer campus days.
- Preferred off days.

An idle gap is free time between classes on the same day that lasts at least one class slot — the shortest meeting in the catalog, 79 minutes for Fall 2026. Shorter seams between back-to-back periods are not counted in `gap_minutes` or in compactness.

`limit` accepts 1–50 and `offset` selects the server-side page. Results are deterministic for the same catalog and request.

The timetable export is a single `.ics` file with one weekly recurring event per meeting (16 occurrences) starting at the next occurrence. Times are emitted in UTC for Asia/Dhaka (UTC+06:00). Verify term dates and holidays with the registrar before relying on the calendar.

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

doc/              Source registrar PDFs
```

## Deployment

The API and the UI are deployed separately: FastAPI on Render, Next.js on Vercel.

| Piece | URL |
| --- | --- |
| UI (Vercel) | https://routine-chai.vercel.app |
| API (Render) | https://routinechai.onrender.com |
| Health check | https://routinechai.onrender.com/health |

### Backend on Render

The API runs as a Render Web Service named `RoutineChai`, created from this repository with these
settings:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |
| Instance Type | Free |
| Region | Singapore |

Environment variables:

- `ALLOWED_ORIGINS` — comma-separated browser origins allowed to call the API. Set it to the
  Vercel origin, for example `https://routine-chai.vercel.app,http://localhost:3000`. Origins must
  match exactly, with no trailing slash, no trailing dot, and no wildcard.
- `PYTHON_VERSION` — `3.12`.

Render restarts the API when `ALLOWED_ORIGINS` changes.

### Frontend on Vercel

The UI is the Vercel project `routine-chai`, deployed with the Vercel CLI. The project has no GitHub
integration, so pushing to `main` does **not** redeploy it.

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm install` |

Set the environment variable `NEXT_PUBLIC_API_BASE_URL` to the Render URL,
`https://routinechai.onrender.com`, with no trailing slash. The value is inlined at build time, so
redeploy the project after changing it.

Deploy from the **repository root**, not from `frontend/`. The Root Directory is `frontend`, so a
deploy started inside `frontend/` resolves the build root to `frontend/frontend` and fails with
`The specified Root Directory "frontend" does not exist`. The CLI link file lives in
`frontend/.vercel`; copy it to the root first:

```powershell
# from the repository root
Copy-Item frontend\.vercel\project.json .vercel\project.json
$env:VERCEL_OIDC_TOKEN = (Get-Content frontend\.env.local | Select-String 'VERCEL_OIDC_TOKEN="([^"]+)"').Matches[0].Groups[1].Value
npx vercel --prod --yes
```

The `VERCEL_OIDC_TOKEN` in `frontend/.env.local` expires after 12 hours. Check it with
`npx vercel whoami`, and refresh it by rerunning `npx vercel link` from `frontend/`, which rewrites
the token in place.

### Verifying a deployment

```powershell
curl https://routinechai.onrender.com/health
curl https://routinechai.onrender.com/api/meta
```

Open the Vercel URL, confirm the catalog loads, and generate a routine. A CORS error in the
browser console means `ALLOWED_ORIGINS` does not exactly match the Vercel origin.

Render's free instances sleep after inactivity, so the first request can take a minute. Point a
free cron job at `/health` every ten minutes if that is a problem.

## Verification

Backend:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
```

Current suite: **122 passed**. It covers parser schema and PDF spot checks, BSEEE parsing and catalog merging, hard-constraint rejection, multi-program eligibility, gap classification, soft-constraint ranking, randomized validity, pinned-section identity, program diagnostics, and API contracts.

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
