# AGENTS.md

## Repository Overview
- **Project**: UIU Fall 2026 class routine / schedule web application.
- **Stack**: React / Next.js (App Router, TypeScript).
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

## Rules of Engagement
- **Terse output**: Deliver direct answers and diffs. Omit conversational filler, restating tasks, and recap summaries.
- **No slop**: No placeholder stubs, unused code, swallowed error handlers, or unnecessary abstractions.
- **Verify before completion**: Always run the relevant build/lint/typecheck command to confirm changes before finishing.
