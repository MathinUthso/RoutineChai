# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

UIU students planning their own Fall 2026 registration. They arrive with a set of courses in mind, limited hours they can attend, and a need to leave with a weekly routine they can actually follow.

## Product Purpose

Turn the official Fall 2026 registrar schedule into ranked, clash-free weekly routines. Success means a student can choose sections, state the hours and preferences that matter, page through every valid routine, and leave with a schedule that is valid, understandable, and ready to verify against the registrar notice.

## Positioning

The differentiator is the ranked solver, not a course catalog. The product enforces hard scheduling constraints first, then ranks the remaining routines by student preferences, so a neighboring course browser could not truthfully make the same promise.

## Operating Context

Students work from the registrar PDF and the generated catalog. The teaching week is Saturday through Wednesday; Thursday and Friday are weekends. Classes run in the registrar's time slots, and conditional sections are excluded unless explicitly pinned. Every generated routine must be checked against the official registrar notice before registration.

## Capabilities and Constraints

- Browse and search the Fall 2026 catalog for BSCSE, BSDS, and BSEEE, with course, section, faculty, room, and meeting details. Program selection is multi-select; the default is BSCSE only.
- Select courses, pin allowed sections, prefer or exclude faculty, block time windows, cap sessions per day, choose allowed days, and set morning/afternoon, compactness, off-day, and preferred-faculty preferences.
- Return numbered server-backed pages of 10 ranked routines with a Sat–Wed weekly grid, section/faculty details, readable 12-hour time cues, and score breakdowns.
- Refine a generated timetable live: sliders for the earliest start, latest end time, longest single gap, campus days, and classes per day re-rank the plans on the server while the previous list stays on screen.
- Present the timetable as three rails — live constraints and plans on the left, the plan and weekly grid in the middle, the section board on the right — and keep guidance in tooltips and metadata rows rather than paragraphs.
- Treat every ranked routine as a plan: `Plan A`, `Plan B`, `Plan C`, and the rest of the list as backups, with the section assignment of each course visible on the plan.
- Support rapid section picking with a section board: each course lists every catalog section as current, ready to swap, conditional, conflicting, or marked full. A swap re-scores the plan; marking a section full removes it from the solver and re-ranks the remaining combinations so the student can fall back from Plan A to a backup.
- Let students enter a project section and one weekly meeting for `CSE 4000A`, `DS 4000A`, or `EEE 4902`; the manual slot replaces catalog sections, inherits official faculty when the section matches, and participates in clash checks.
- Export every meeting in a routine as a weekly recurring `.ics` calendar, starting at the next occurrence and marked for registrar verification.
- Ask once, in a bottom-sheet dialog, whether the student's routine details may be kept in the browser. Nothing is stored before they agree: declining records only that the prompt was answered. On acceptance the courses, blocked hours, live caps, per-course section and faculty preferences, and the open plan are kept so a refresh restores the form and regenerates the plans instead of asking for everything again. Details never leave the device, and a "Forget saved details" control clears them.
- Hard constraints: exactly one section per selected course, no overlapping meetings, blocked windows excluded, allowed teaching days only, session caps, program eligibility, conditional sections excluded unless explicitly allowed, excluded faculty removed even when a section is pinned, sections marked full removed from the candidate pool, no meeting starting before the earliest-start time or ending after the latest-end time, and no single idle gap or campus-day count above the live caps. Manual project meetings obey the same checks.
- Conditional (`if_required`) sections stay hidden by default and are considered only when explicitly pinned.
- Results are deterministic for the same catalog and request. Infeasible requests return an empty routine list with diagnostics; invalid payloads and unknown courses are rejected.
- Never invent courses, sections, faculty, rooms, or meeting times. The catalog is generated from the official PDF and carries known data caveats.

## Brand Commitments

- Official UIU identity and the supplied UIU campus illustration are binding; preserve UIU attribution. The header uses three cropped building bands and deliberately excludes the character throw, blast, debris, and bounding frame.
- The catalog and its derived facts come from the official registrar PDF. Generated artifacts are not hand-edited.

## Evidence on Hand

- `doc/Class Routine with faculty assign Fall 2026.pdf` — CSE/DS source registrar PDF.
- `doc/EEEfall26classroutine.pdf` — BSEEE source offering PDF.
- `backend/app/data/routine.json` — generated catalog: 917 rows, 303 repairs, 0 skips, 161 courses, 917 sections, 1,507 meetings.
- `backend/app/data/parse_report.json` — extraction report with four known warnings: SL 436 truncated faculty/credit line, SL 723 missing room (`TBA`), SL 750 missing faculty (`TBA`), and EEE 4902 without a meeting time.
- `frontend/public/assets/uiu-buildings.webp` — cropped, transparent-sky UIU campus illustration used by the header.
- `assets/uiu.svg` — supplied UIU campus illustration source.
- The supplied throw and blast Lottie files are not used by the current header.

## Product Principles

1. **Validity before preference.** A routine that violates a hard constraint is not a candidate, no matter how well it scores.
2. **Show the work.** Rank, score, section choice, and warnings stay visible so the student can judge the result rather than trust a black box.
3. **The registrar is the source of truth.** Derived schedules are a planning aid; the official notice is the final check.
4. **Respect the student's real week.** Blocked hours, campus days, session load, and travel time are first-class constraints.
5. **Motion is decoration.** The scheduling flow stays usable and understandable without animation, and reduced-motion preferences are honored.
6. **Consent before storage.** The student's details are only kept after they agree, are readable and deletable at any time, and never travel to our server.
