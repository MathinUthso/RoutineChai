# AGENTS.md

## Repository Overview
- **Project**: UIU Fall 2026 class routine / schedule web application.
- **Stack**: Next.js (App Router, TypeScript), FastAPI (Python 3.12), Tailwind CSS v4, Framer Motion.
- **Environment**: Windows (`win32`), PowerShell. Use PowerShell-compatible commands; avoid bash-specific syntax or unquoted paths with special characters.

## OpenCode Subagents & Routing
Repo-local subagents are configured in `.opencode/agents/`. Main agent plans and integrates; delegate focused tasks to subagents:

| Need | Subagent | Scope / Notes |
|---|---|---|
| Explore / trace / locate files | `scout` | Read-only; fast discovery without filling context |
| Architecture / feature plan | `planner` | Read-only spec and task breakdown |
| UI components & layouts | `ui-designer` | Builds accessible, responsive UI states |
| Scoped code implementation | `coder` | Implements assigned brief; no commits, minimal diff |
| Write & execute tests | `tester` | Focused test files; verifies failures and passes |
| Bug root-cause diagnosis | `debugger` | Diagnosis only; no direct fix |
| Review diff before commit | `reviewer` | Read-only audit for security, bugs, slop |
| Git branch / commits | `git-manager` | Conventional commits; never force-pushes |
| Docs & README updates | `docs-writer` | Markdown and documentation only |

### Standard Workflow
1. **Feature**: `planner` -> `coder` / `ui-designer` -> `tester` -> `reviewer` -> `git-manager`.
2. **Bug**: `debugger` -> `tester` (failing test) -> `coder` -> `reviewer` -> `git-manager`.
3. Skip `planner`/`reviewer` for trivial single-file fixes. Subagents must receive concise, explicit scopes.

## Development & Verification
- **Package Manager**: `npm` (default). Run commands from repository root.
- **Dev Server**: `npm run dev` (when initialized).
- **Lint & Typecheck**: Run narrow checks covering touched files (`npm run lint`, `npx tsc --noEmit`).
- **Dependencies**: Do not install new dependencies without clear necessity for the immediate task.

## Backend / Data Pipeline
- **Python env**: `.venv` at the repository root; run Python as `..\.venv\Scripts\python.exe` from `backend/`.
- **Backend tests**: `cd backend; ..\.venv\Scripts\python.exe -m pytest -q`.
- **Run API**: `cd backend; ..\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`.
- **Rebuild catalog**: `.\\.venv\\Scripts\\python.exe backend\\scripts\\extract_routine.py --pdf "doc\\Class Routine with faculty assign Fall 2026.pdf"`.
- **Generated artifacts**: `backend/app/data/routine.json` and `parse_report.json` are committed; do not hand-edit them.
- **Teaching week**: Saturday through Wednesday only; Thursday and Friday are weekends.
- **Data snapshot**: 791 rows, 303 repairs, 0 skips, 101 courses, 791 sections; three expected warnings are documented in `README.md`.
- **Frontend API base**: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`); backend CORS defaults to `http://localhost:3000`.

## Rules of Engagement
- **Terse output**: Deliver direct answers and diffs. Omit conversational filler, restating tasks, and recap summaries.
- **No slop**: No placeholder stubs, unused code, swallowed error handlers, or unnecessary abstractions.
- **Verify before completion**: Always run the relevant build/lint/typecheck command to confirm changes before finishing.
