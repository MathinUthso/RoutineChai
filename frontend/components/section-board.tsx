"use client";

import { useState } from "react";
import { TONE_CLASS, toneFor } from "@/lib/course-tone";
import { formatMeeting } from "@/lib/schedule";
import { catalogSlotMinutes, sectionOptions, sectionSummary } from "@/lib/section-plan";
import type {
  CatalogResponse,
  Constraints,
  Course,
  CoursePreference,
  Routine,
  RoutineCourse,
} from "@/lib/types";

type SectionBoardProps = {
  routine: Routine;
  catalog: CatalogResponse | null;
  constraints: Constraints;
  preferences: Record<string, CoursePreference>;
  pending: { code: string; section: string } | null;
  error: string | null;
  onSwap: (code: string, section: string) => void;
  onMarkFull: (code: string, section: string) => void;
  onRestore: (code: string, section: string) => void;
};

const LEGEND = [
  ["Current", "border-green bg-green text-paper"],
  ["Ready", "border-green/60 bg-green-tint/40 text-ink"],
  ["Conditional", "border-dashed border-coral/60 bg-paper text-coral-ink"],
  ["Conflict", "border-rule/60 bg-paper-sunk text-ink-faint"],
  ["Full", "border-coral/50 bg-coral-tint/40 text-coral-ink line-through"],
] as const;

function statusClass(status: string, marking: boolean) {
  if (status === "current") {
    return marking
      ? "border-coral bg-coral text-paper hover:bg-coral-ink"
      : "border-green bg-green text-paper";
  }
  if (status === "ready") {
    return marking
      ? "border-coral/60 bg-paper text-ink hover:border-coral hover:bg-coral-tint/35"
      : "border-green/60 bg-green-tint/35 text-ink hover:border-green hover:bg-green-tint/70";
  }
  if (status === "conditional") {
    return marking
      ? "border-dashed border-coral/60 bg-paper text-ink hover:bg-coral-tint/35"
      : "border-dashed border-coral/70 bg-coral-tint/25 text-coral-ink hover:border-coral hover:bg-coral-tint/45";
  }
  if (status === "excluded") {
    return "border-coral/55 bg-coral-tint/40 text-coral-ink line-through hover:border-coral";
  }
  return "cursor-not-allowed border-rule/50 bg-paper-sunk text-ink-faint";
}

function optionLabel(
  routineCourse: RoutineCourse,
  sectionName: string,
  status: string,
  marking: boolean,
  reason: string | null,
): string {
  if (status === "excluded") return `Restore ${routineCourse.code} section ${sectionName}`;
  if (marking) {
    return `Mark ${routineCourse.code} section ${sectionName} full and re-rank`;
  }
  return `Swap ${routineCourse.code} to section ${sectionName}${reason ? `. ${reason}` : ""}`;
}

export function SectionBoard({
  routine,
  catalog,
  constraints,
  preferences,
  pending,
  error,
  onSwap,
  onMarkFull,
  onRestore,
}: SectionBoardProps) {
  const [marking, setMarking] = useState(false);
  const [onlyReady, setOnlyReady] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const slotMinutes = catalogSlotMinutes(catalog);
  const busy = pending !== null;

  return (
    <section
      aria-labelledby="section-board-title"
      className="border border-rule bg-paper-raised shadow-sheet"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h3
          id="section-board-title"
          className="mono-label text-ink"
          title="Swap one section without losing the rest of the plan. Mark a section full and the solver re-ranks the remaining combinations."
        >
          Section board
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={onlyReady}
            onClick={() => setOnlyReady((value) => !value)}
            className={`press mono-label inline-flex min-h-9 items-center border px-2 ${
              onlyReady
                ? "border-green bg-green-tint/60 text-green-deep"
                : "border-rule-strong text-ink hover:border-ink hover:bg-paper"
            }`}
          >
            Ready only
          </button>
          <button
            type="button"
            aria-pressed={marking}
            onClick={() => setMarking((value) => !value)}
            className={`press mono-label inline-flex min-h-9 items-center border px-2 ${
              marking
                ? "border-coral bg-coral text-paper hover:bg-coral-ink"
                : "border-rule-strong text-ink hover:border-coral hover:text-coral-ink"
            }`}
          >
            {marking ? "Marking full" : "Mark full"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule/70 bg-paper/40 px-4 py-2">
        {showLegend ? (
          LEGEND.map(([label, swatch]) => (
            <span key={label} className="mono-label flex items-center gap-1.5 text-ink-faint">
              <span aria-hidden className={`h-2.5 w-2.5 border ${swatch}`} />
              {label}
            </span>
          ))
        ) : (
          <span className="mono-label text-ink-faint">Section status</span>
        )}
        <button
          type="button"
          aria-expanded={showLegend}
          onClick={() => setShowLegend((value) => !value)}
          className="cue-underline mono-label ml-auto text-ink-faint hover:text-ink"
        >
          {showLegend ? "Hide key" : "Show key"}
        </button>
      </div>

      <p className="mono-label border-b border-rule/70 px-4 py-2 text-ink-faint" aria-live="polite">
        {pending
          ? `Checking ${pending.code} ${pending.section}…`
          : marking
            ? "Pick any section to mark it full"
            : "Pick a ready section to swap"}
      </p>

      {error && (
        <p role="alert" className="border-b border-coral/50 px-4 py-2 text-[0.8125rem] text-coral-ink">
          {error}
        </p>
      )}

      <div className="divide-y divide-rule/70">
        {routine.courses.map((routineCourse) => {
          const course: Course | undefined = catalog?.courses.find(
            (item) => item.code === routineCourse.code,
          );
          const preference = preferences[routineCourse.code];
          const excludedSections = preference?.excluded_sections ?? [];
          const options = course
            ? sectionOptions({
                course,
                routineCourse,
                routine,
                constraints,
                slotMinutes,
                excludedSections,
                excludedFaculty: preference?.excluded_faculty ?? [],
              })
            : [];
          const readyCount = options.filter(
            (option) => option.status === "ready" || option.status === "conditional",
          ).length;

          return (
            <div key={routineCourse.code} className="ledger-auto px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex min-w-0 items-baseline gap-1.5">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[toneFor(routineCourse.code)].dot}`}
                  />
                  <span className="font-mono text-[0.75rem] font-medium text-ink">
                    {routineCourse.code}
                  </span>
                  <span className="inline-flex border border-green/45 bg-green-tint/45 px-1.5 py-0.5 font-mono text-[0.65rem] text-green-deep">
                    {routineCourse.section}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="mono-label tabular text-ink-faint">
                    {routineCourse.manual
                      ? "Manual slot"
                      : `${readyCount} ${readyCount === 1 ? "swap" : "swaps"}`}
                  </span>
                  {!routineCourse.manual && (
                    <>
                      <span aria-hidden className="mono-label text-ink-faint/50">
                        ·
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        title="Remove this section from the solver and re-rank the remaining plans."
                        onClick={() => onMarkFull(routineCourse.code, routineCourse.section)}
                        className="cue-underline mono-label text-coral-ink disabled:opacity-50"
                      >
                        Mark full
                      </button>
                    </>
                  )}
                </div>
              </div>

              <p
                className="mono-label mt-1 truncate text-ink-faint"
                title={`${routineCourse.title} · ${routineCourse.faculty} · ${routineCourse.meetings
                  .map(formatMeeting)
                  .join(" · ")}`}
              >
                {routineCourse.faculty} · {routineCourse.meetings.map(formatMeeting).join(" · ")}
              </p>

              {routineCourse.manual ? (
                <p className="mt-2 border border-dashed border-rule px-2.5 py-2 text-[0.8125rem] text-ink-soft">
                  Manual project slot. Change it in Step 02.
                </p>
              ) : options.length === 0 ? (
                <p className="mt-2 text-[0.8125rem] text-ink-faint">
                  No catalog sections for this course.
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {options
                    .filter(
                      (option) =>
                        !onlyReady ||
                        option.status === "ready" ||
                        option.status === "conditional" ||
                        option.status === "current" ||
                        option.status === "excluded",
                    )
                    .map(({ section, status, reason }) => {
                      const isPending =
                        pending?.code === routineCourse.code && pending.section === section.name;
                      const interactive =
                        status === "current"
                          ? marking
                          : status === "excluded" ||
                            status === "ready" ||
                            status === "conditional";
                      return (
                        <button
                          key={section.name}
                          type="button"
                          disabled={!interactive || busy}
                          aria-label={optionLabel(routineCourse, section.name, status, marking, reason)}
                          title={
                            reason ?? section.meetings.map(formatMeeting).join(" · ")
                          }
                          onClick={() => {
                            if (status === "excluded") {
                              onRestore(routineCourse.code, section.name);
                            } else if (marking) {
                              onMarkFull(routineCourse.code, section.name);
                            } else if (status === "ready" || status === "conditional") {
                              onSwap(routineCourse.code, section.name);
                            }
                          }}
                          className={`press relative flex min-h-9 min-w-[3.2rem] flex-col items-start justify-center border px-1.5 py-1 text-left transition-colors ${statusClass(
                            status,
                            marking,
                          )} ${isPending ? "animate-pulse" : ""}`}
                        >
                          <span className="flex items-baseline gap-1 font-mono text-[0.72rem]">
                            {status === "ready" && (
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green" />
                            )}
                            {(status === "clash" || status === "filtered") && (
                              <span
                                aria-hidden
                                className="text-[0.6rem] leading-none text-coral-ink/60"
                              >
                                ×
                              </span>
                            )}
                            {section.name}
                            {section.if_required && (
                              <span className="text-[0.5rem] tracking-[0.08em] opacity-75">
                                cond.
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[0.56rem] tabular opacity-75">
                            {isPending ? "checking" : sectionSummary(section)}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
