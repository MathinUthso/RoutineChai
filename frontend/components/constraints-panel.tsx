"use client";

import { describeConstraints, type ConstraintIssue } from "@/lib/schedule";
import type { Constraints, Course, CoursePreference, Program } from "@/lib/types";
import { ConstraintForm } from "./constraint-form";
import { SectionPreferences } from "./section-preferences";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon } from "./icons";

type ConstraintsPanelProps = {
  selected: Course[];
  constraints: Constraints;
  issues: ConstraintIssue[];
  preferences: Record<string, CoursePreference>;
  /** Program selected in Step 01. */
  program: Program;
  status: "idle" | "loading" | "error";
  error?: string;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  onConstraintsChange: (next: Constraints) => void;
  onPreferenceChange: (code: string, next: CoursePreference) => void;
  onBack: () => void;
  onGenerate: () => void;
  onRetry: () => void;
};

export function ConstraintsPanel({
  selected,
  constraints,
  issues,
  preferences,
  program,
  status,
  error,
  headingRef,
  onConstraintsChange,
  onPreferenceChange,
  onBack,
  onGenerate,
  onRetry,
}: ConstraintsPanelProps) {
  const totalCredits = selected.reduce((sum, course) => sum + course.credits, 0);
  const labs = selected.filter((course) => course.kind === "lab").length;
  const sections = selected.reduce((sum, course) => sum + course.sections.length, 0);
  const requestProgram: Program = program === "BSDS" ? "BSDS" : "BSCSE";
  const excluded = selected.filter((course) => !course.programs.includes(requestProgram));
  const reading = describeConstraints(constraints);
  const overload = totalCredits > 18;
  const partTime = totalCredits > 0 && totalCredits < 12;
  const busy = status === "loading";
  const disabled = selected.length === 0 || issues.length > 0 || busy;

  const hint = (() => {
    if (busy) return "Consulting the solver — the sheet will open on Step 03.";
    if (selected.length === 0) return "Select at least one course in Step 01.";
    if (issues.length > 0) {
      return `Resolve ${issues.length} open ${issues.length === 1 ? "item" : "items"} before the sheet can be issued.`;
    }
    if (excluded.length > 0) {
      return `Up to 10 options · issued for ${requestProgram}; ${excluded.length} selected ${
        excluded.length === 1 ? "course is" : "courses are"
      } not offered.`;
    }
    return `Up to 10 options · issued for ${requestProgram}`;
  })();

  return (
    <section aria-labelledby="constraints-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="mono-label text-ink-faint">Step 02</p>
          <h2
            id="constraints-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1.5 text-title font-medium tracking-[-0.015em] focus:outline-none"
          >
            Set the constraints
          </h2>
        </div>
        <p className="mono-label tabular text-ink-faint">
          {String(selected.length).padStart(2, "0")} courses · {totalCredits.toFixed(1)} credits
        </p>
      </div>

      <p className="mt-2 max-w-[64ch] text-[0.9375rem] leading-relaxed text-ink-soft">
        Keep the hours you can attend, then annotate the courses that need a particular section or
        teacher. The solver reads these as rules first, preferences second.
      </p>

      {status === "error" && (
        <div
          role="alert"
          className="mt-5 flex flex-col items-start gap-3 border border-coral/60 bg-coral-tint/35 px-4 py-4 sm:flex-row sm:gap-4"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-coral-ink" />
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-medium text-ink">
              The solver did not answer
            </h3>
            <p className="mt-1 max-w-[56ch] text-[0.875rem] leading-relaxed text-ink-soft">
              {error ?? "The routine service did not return a result. Check the API and try again."}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mono-label mt-3 inline-flex min-h-11 items-center border border-ink px-3 text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <ConstraintForm value={constraints} issues={issues} onChange={onConstraintsChange} />

          <SectionPreferences
            courses={selected}
            value={preferences}
            onChange={onPreferenceChange}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="border border-rule bg-paper-raised shadow-sheet">
            <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
              <h3 className="mono-label text-ink">Docket under review</h3>
              <span className="mono-label tabular text-ink-faint">
                {String(selected.length).padStart(2, "0")} selected
              </span>
            </div>

            <div className="px-4 py-4">
              <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
                <div className="py-3 pr-2">
                  <dt className="mono-label text-ink-faint">Credits</dt>
                  <dd className="mt-1.5 font-mono text-[1.5rem] leading-none tabular text-ink">
                    {totalCredits.toFixed(1)}
                  </dd>
                </div>
                <div className="px-3 py-3">
                  <dt className="mono-label text-ink-faint">Labs</dt>
                  <dd className="mt-1.5 font-mono text-[1.5rem] leading-none tabular text-ink">
                    {String(labs).padStart(2, "0")}
                  </dd>
                </div>
                <div className="py-3 pl-3">
                  <dt className="mono-label text-ink-faint">Sections</dt>
                  <dd className="mt-1.5 font-mono text-[1.5rem] leading-none tabular text-ink">
                    {String(sections).padStart(2, "0")}
                  </dd>
                </div>
              </dl>

              {selected.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1" aria-label="Selected courses">
                  {selected.map((course) => (
                    <li
                      key={course.code}
                      className="font-mono text-[0.6875rem] tracking-[0.03em] text-ink-soft"
                    >
                      {course.code}
                      <span className="text-ink-faint"> · {course.credits.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {(overload || partTime) && (
                <p className="mono-label mt-3 flex items-start gap-2 leading-relaxed text-coral-ink">
                  <AlertIcon className="mt-px h-3 w-3 shrink-0" />
                  {overload
                    ? "Above the 18.0 credit band — registrar approval required."
                    : "Below the 12.0 full-time band — the routine will be part-time."}
                </p>
              )}

              <p className="mono-label mt-3 border-t border-rule pt-2.5 leading-relaxed text-ink-faint">
                Timetable program · <span className="text-ink">{requestProgram}</span>
              </p>

              {excluded.length > 0 && (
                <p className="mono-label mt-2 flex items-start gap-2 leading-relaxed text-coral-ink">
                  <AlertIcon className="mt-px h-3 w-3 shrink-0" />
                  Not offered to {requestProgram}; these will be set aside.
                </p>
              )}
            </div>
          </div>

          <div className="border border-rule bg-paper-raised">
            <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
              <h3 className="mono-label text-ink">Reading of the sheet</h3>
              <span className="mono-label tabular text-ink-faint">
                {String(reading.length).padStart(2, "0")} clauses
              </span>
            </div>
            <dl className="divide-y divide-rule/80 px-4">
              {reading.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <dt className="mono-label shrink-0 text-ink-faint">{row.label}</dt>
                  <dd className="text-right text-[0.8125rem] leading-snug text-ink-soft">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mono-label border-t border-rule px-4 py-2.5 leading-relaxed text-ink-faint">
              Section pins and excluded faculty are hard filters; preferred faculty ranks.
            </p>
          </div>

          {issues.length > 0 && (
            <div role="alert" className="border border-coral/60 bg-paper px-4 py-3">
              <p className="mono-label text-coral-ink">Before the sheet is issued</p>
              <ul className="mt-2 space-y-1.5">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.field}-${issue.index ?? "all"}-${index}`}
                    className="text-[0.8125rem] leading-snug text-ink-soft"
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-rule bg-paper-raised p-4">
            <button
              type="button"
              onClick={onGenerate}
              disabled={disabled}
              aria-busy={busy || undefined}
              className="group flex min-h-11 w-full items-center justify-between gap-3 bg-green px-4 py-3 text-paper transition-colors duration-[var(--duration-quick)] hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-coral disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:text-ink-faint"
            >
              <span className="text-[0.9375rem] font-medium">
                {busy ? "Consulting the solver…" : "Generate timetable"}
              </span>
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-[var(--duration-quick)] group-enabled:group-hover:translate-x-0.5" />
            </button>
            <p
              aria-live="polite"
              className={`mono-label mt-2 min-h-[1.1rem] leading-relaxed ${
                issues.length > 0 || excluded.length > 0 ? "text-coral-ink" : "text-ink-faint"
              }`}
            >
              {hint}
            </p>

            <button
              type="button"
              onClick={onBack}
              className="group mt-1 inline-flex min-h-11 items-center gap-2 text-[0.875rem] text-ink-soft transition-colors hover:text-ink"
            >
              <ArrowLeftIcon className="h-4 w-4 text-ink-faint transition-transform duration-[var(--duration-quick)] group-hover:-translate-x-0.5" />
              Back to courses
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
