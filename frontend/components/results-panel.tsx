"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { buildRoutineCalendar, calendarFilename } from "@/lib/calendar";
import { durations, panelVariants } from "@/lib/motion";
import { formatGap, formatMeeting, formatTimeRange } from "@/lib/schedule";
import { catalogSlotMinutes, longestGapMinutes, planLabel } from "@/lib/section-plan";
import type {
  CatalogResponse,
  Constraints,
  CoursePreference,
  Diagnostics,
  GenerateResult,
  Routine,
  ScoreBreakdown,
} from "@/lib/types";
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon } from "./icons";
import { LiveRefine } from "./live-refine";
import { SectionBoard } from "./section-board";
import { WeeklyCalendar } from "./weekly-calendar";

type ResultStatus = "idle" | "loading" | "error" | "ready";

type ResultsPanelProps = {
  status: ResultStatus;
  result?: GenerateResult;
  error?: string;
  selectedId: string | null;
  page: number;
  pageLoading: boolean;
  pageError: { page: number; message: string } | null;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  constraints: Constraints;
  catalog: CatalogResponse | null;
  preferences: Record<string, CoursePreference>;
  customRoutine: Routine | null;
  liveBusy: boolean;
  liveError: string | null;
  pendingSwap: { code: string; section: string } | null;
  swapError: string | null;
  onConstraintsChange: (next: Constraints) => void;
  onSelect: (id: string) => void;
  onSwap: (code: string, section: string) => void;
  onMarkFull: (code: string, section: string) => void;
  onRestoreSection: (code: string, section: string) => void;
  onClearCustom: () => void;
  onBack: () => void;
  onRetry: () => void;
  onPageChange: (page: number) => void;
};

const BREAKDOWN_LABELS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "time", label: "Time of day" },
  { key: "faculty", label: "Faculty fit" },
  { key: "compactness", label: "Compactness" },
  { key: "fewer_days", label: "Fewer days" },
  { key: "off_days", label: "Off days" },
];

function scoreTone(score: number) {
  if (score >= 80) return "text-green";
  if (score >= 55) return "text-ink";
  return "text-coral-ink";
}

function pageItems(page: number, pageCount: number): (number | string)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const visible = new Set([0, pageCount - 1, page - 1, page, page + 1]);
  const pages = [...visible].filter((value) => value >= 0 && value < pageCount).sort((a, b) => a - b);
  const items: (number | string)[] = [];

  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1] > 1) {
      items.push(`gap-${pages[index - 1]}`);
    }
    items.push(value);
  });

  return items;
}

function DiagnosticsBlock({ diagnostics }: { diagnostics: Diagnostics[] }) {
  if (diagnostics.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-5 border border-coral/60 bg-coral-tint/30 px-4 py-3.5"
    >
      <p className="mono-label text-coral-ink">Solver notes</p>
      <ul className="mt-2 space-y-1.5">
        {diagnostics.map((item, index) => (
          <li key={`${item.reason}-${index}`} className="text-[0.8125rem] leading-relaxed text-ink-soft">
            {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyResult({
  diagnostics,
  onBack,
}: {
  diagnostics: Diagnostics[];
  onBack: () => void;
}) {
  return (
    <div className="mt-6 border border-rule bg-paper-raised shadow-sheet">
      <div className="border-b border-rule px-5 py-4">
        <p className="mono-label text-coral-ink">No routines found</p>
        <h3 className="mt-1 text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
          The constraints leave no valid timetable.
        </h3>
      </div>
      <div className="px-5 py-5">
        {diagnostics.length > 0 ? (
          <ul className="space-y-2">
            {diagnostics.map((item, index) => (
              <li
                key={`${item.reason}-${index}`}
                className="border-l-2 border-coral/70 pl-3 text-[0.875rem] leading-relaxed text-ink-soft"
              >
                {item.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.875rem] leading-relaxed text-ink-soft">
            No combination of sections satisfies the current rules.
          </p>
        )}

        <div className="mt-5 grid gap-2 border-t border-rule pt-4 sm:grid-cols-2">
          {[
            "Allow another teaching day.",
            "Raise the sessions-per-day cap.",
            "Remove or shorten a blocked window.",
            "Clear a section pin or faculty preference.",
          ].map((hint) => (
            <p key={hint} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-soft">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 bg-coral" />
              {hint}
            </p>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            className="press inline-flex min-h-11 items-center gap-2 bg-green px-4 text-[0.9375rem] text-paper hover:bg-green-deep"
          >
            Adjust constraints
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ routine }: { routine: Routine }) {
  const reduceMotion = useReducedMotion();

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {BREAKDOWN_LABELS.map(({ key, label }, index) => {
        const value = Math.max(0, Math.min(100, routine.breakdown[key]));
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="mono-label text-ink-faint">{label}</dt>
              <dd className="font-mono text-[0.75rem] tabular text-ink-soft">
                {value.toFixed(0)}
              </dd>
            </div>
            <div className="mt-1 h-[5px] overflow-hidden bg-paper-sunk" aria-hidden>
              <motion.div
                key={`${routine.id}-${key}`}
                className={`h-full origin-left ${
                  value >= 70 ? "bg-green" : value >= 40 ? "bg-rule-strong" : "bg-coral"
                }`}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.34,
                  delay: reduceMotion ? 0 : index * 0.045,
                  ease: [0.2, 0.7, 0.2, 1],
                }}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}

function downloadCalendar(routine: Routine) {
  const blob = new Blob([buildRoutineCalendar(routine)], {
    type: "text/calendar;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = calendarFilename(routine);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function RoutineDetail({
  routine,
  planName,
  catalog,
  constraints,
  preferences,
  pendingSwap,
  swapError,
  onSwap,
  onMarkFull,
  onRestoreSection,
}: {
  routine: Routine;
  planName: string;
  catalog: CatalogResponse | null;
  constraints: Constraints;
  preferences: Record<string, CoursePreference>;
  pendingSwap: { code: string; section: string } | null;
  swapError: string | null;
  onSwap: (code: string, section: string) => void;
  onMarkFull: (code: string, section: string) => void;
  onRestoreSection: (code: string, section: string) => void;
}) {
  const longestGap = longestGapMinutes(
    routine.courses.flatMap((course) => course.meetings),
    catalogSlotMinutes(catalog),
  );

  return (
    <div className="border border-rule bg-paper-raised shadow-sheet">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div>
          <p className="mono-label text-ink-faint">{planName}</p>
          <h3 className="mt-1 text-[1.2rem] font-medium tracking-[-0.01em] text-ink">
            Your timetable
          </h3>
          <p className="mono-label mt-1 text-ink-faint">
            {routine.courses.length} courses · {routine.stats.campus_days} campus{" "}
            {routine.stats.campus_days === 1 ? "day" : "days"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <div>
            <p className="mono-label text-ink-faint">Score</p>
            <p className={`font-mono text-[2rem] leading-none tabular ${scoreTone(routine.score)}`}>
              {routine.score.toFixed(1)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadCalendar(routine)}
            title="Download every class as a weekly .ics from the next occurrence. Verify dates before relying on it."
            className="press inline-flex min-h-9 items-center gap-1.5 border border-rule-strong px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink hover:border-ink hover:bg-paper focus-visible:border-ink"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Google Calendar
          </button>
        </div>
      </div>

      <p className="mono-label border-b border-rule px-5 py-2 leading-relaxed text-ink-faint">
        Calendar export repeats weekly for 16 classes from the next occurrence. Verify term dates
        and holidays before relying on it.
      </p>

      <div className="grid grid-cols-2 divide-x divide-y divide-rule border-b border-rule sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: "Credits", value: routine.stats.total_credits.toFixed(1) },
          {
            label: "Idle gaps",
            value: formatGap(routine.stats.gap_minutes),
            title: "Idle time between classes, counted only when it lasts a full class slot or more.",
          },
          {
            label: "Longest gap",
            value: formatGap(longestGap),
            title: "The longest single break on any teaching day.",
          },
          {
            label: "Span",
            value:
              routine.stats.earliest && routine.stats.latest
                ? formatTimeRange(routine.stats.earliest, routine.stats.latest)
                : "—",
          },
        ].map(({ label, value, title }) => (
          <div key={label} className="px-4 py-3" title={title}>
            <p className="mono-label text-ink-faint">{label}</p>
            <p className="mt-1 font-mono text-[0.95rem] tabular text-ink">{value}</p>
          </div>
        ))}
      </div>

      <WeeklyCalendar routine={routine} />

      <div className="px-5 pb-4">
        <h4 className="mono-label pt-3.5 text-ink">Score breakdown</h4>
        <Breakdown routine={routine} />
      </div>

      <div className="border-t border-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-3">
          <h4 className="mono-label text-ink">Courses</h4>
          <p className="mono-label tabular text-ink-faint">
            {routine.courses.length} courses · {routine.stats.total_credits.toFixed(1)} credits
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">Courses and meetings in routine {routine.id}</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="mono-label px-4 py-2.5 text-ink-faint">
                Course
              </th>
              <th scope="col" className="mono-label hidden px-4 py-2.5 text-ink-faint sm:table-cell">
                Section
              </th>
              <th scope="col" className="mono-label px-4 py-2.5 text-ink-faint">
                Meetings
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/70">
            {routine.courses.map((course) => (
              <tr key={course.code}>
                <td className="px-4 py-3 align-top">
                  <p className="font-mono text-[0.75rem] font-medium text-ink">{course.code}</p>
                  <p className="mt-0.5 max-w-[18rem] text-[0.8125rem] leading-snug text-ink-soft">
                    {course.title}
                  </p>
                  <p className="mono-label mt-1 flex flex-wrap items-center gap-1.5 text-ink-faint">
                    <span>
                      {course.kind === "lab" ? "Lab" : "Theory"} · {course.faculty}
                    </span>
                    {course.manual && (
                      <span className="border border-coral/45 px-1 py-0.5 text-[0.5625rem] tracking-[0.1em] text-coral-ink">
                        Manual
                      </span>
                    )}
                  </p>
                </td>
                <td className="hidden px-4 py-3 align-top sm:table-cell">
                  <span className="inline-flex border border-rule px-1.5 py-1 font-mono text-[0.75rem] text-ink">
                    {course.section}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <ul className="space-y-1">
                    {course.meetings.map((meeting, index) => (
                      <li
                        key={`${meeting.day}-${meeting.start}-${index}`}
                        className="font-mono text-[0.7rem] leading-relaxed tabular text-ink-soft"
                      >
                        {formatMeeting(meeting)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      <SectionBoard
        routine={routine}
        catalog={catalog}
        constraints={constraints}
        preferences={preferences}
        pending={pendingSwap}
        error={swapError}
        onSwap={onSwap}
        onMarkFull={onMarkFull}
        onRestore={onRestoreSection}
      />
    </div>
  );
}

export function ResultsPanel({
  status,
  result,
  error,
  selectedId,
  page,
  pageLoading,
  pageError,
  headingRef,
  constraints,
  catalog,
  preferences,
  customRoutine,
  liveBusy,
  liveError,
  pendingSwap,
  swapError,
  onConstraintsChange,
  onSelect,
  onSwap,
  onMarkFull,
  onRestoreSection,
  onClearCustom,
  onBack,
  onRetry,
  onPageChange,
}: ResultsPanelProps) {
  const reduceMotion = useReducedMotion();
  const routines = result?.routines ?? [];
  const rankedSelected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const selected = customRoutine ?? rankedSelected;
  const selectedRank = routines.findIndex((routine) => routine.id === rankedSelected?.id);
  const planName = customRoutine
    ? "Working plan"
    : selectedRank >= 0 && result
      ? planLabel(result.offset + selectedRank)
      : "Plan";
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const totalLabel = result ? `${result.total}${result.total_is_partial ? "+" : ""}` : "0";
  const rangeLabel =
    result && routines.length > 0
      ? `${result.offset + 1}–${result.offset + routines.length} of ${totalLabel}`
      : `0 of ${totalLabel}`;

  return (
    <section aria-labelledby="results-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="mono-label text-ink-faint">Step 03</p>
          <h2
            id="results-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1.5 text-title font-medium tracking-[-0.015em] focus:outline-none"
          >
            Plans &amp; backups
          </h2>
          <p className="mt-2 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-soft">
            Every plan is one complete section combination. Plan A is the strongest; the rest are
            your backups, ready when a section fills up.
          </p>
        </div>
        <p className="mono-label tabular text-ink-faint" aria-live="polite">
          {status === "loading"
            ? "Consulting the solver"
            : status === "ready"
              ? rangeLabel
              : "Awaiting a request"}
        </p>
      </div>

      {status === "ready" && (
        <LiveRefine
          constraints={constraints}
          busy={liveBusy || pageLoading}
          error={liveError}
          onChange={onConstraintsChange}
        />
      )}

      {status === "loading" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]" aria-busy>
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-24 animate-pulse border border-rule bg-paper-raised" />
            ))}
          </div>
          <div className="h-[26rem] animate-pulse border border-rule bg-paper-raised" />
          <p className="sr-only">Generating ranked timetables.</p>
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 border border-coral/60 bg-paper-raised px-5 py-5" role="alert">
          <p className="mono-label text-coral-ink">The solver did not answer</p>
          <h3 className="mt-1 text-[1.2rem] font-medium text-ink">The request could not be completed.</h3>
          <p className="mt-2 max-w-[64ch] text-[0.875rem] leading-relaxed text-ink-soft">
            {error ?? "Check that the API is running and try again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="press inline-flex min-h-11 items-center border border-ink px-4 text-[0.9375rem] text-ink hover:bg-ink hover:text-paper"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="press inline-flex min-h-11 items-center gap-2 px-1 text-[0.9375rem] text-ink-soft hover:text-ink"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to constraints
            </button>
          </div>
        </div>
      )}

      {status === "ready" && result && routines.length === 0 && (
        <EmptyResult diagnostics={result.diagnostics} onBack={onBack} />
      )}

      {status === "ready" && result && routines.length > 0 && (
        <>
          <DiagnosticsBlock diagnostics={result.diagnostics} />

          <p className="sr-only" aria-live="polite">
            {selected
              ? `Showing ${planName}, score ${selected.score.toFixed(1)} of 100, ${selected.courses.length} courses.`
              : ""}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
            <div>
              <div className="flex items-baseline justify-between gap-3 border-y border-rule py-2">
                <h3 className="mono-label text-ink">Plans, best first</h3>
                <span className="mono-label tabular text-ink-faint" aria-live="polite">
                  {pageLoading ? "Loading page…" : rangeLabel}
                </span>
              </div>

              {customRoutine && (
                <div className="mt-2 border border-green bg-green-tint/45 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mono-label text-green-deep">Working plan</span>
                    <span
                      className={`font-mono text-[1.15rem] leading-none tabular ${scoreTone(
                        customRoutine.score,
                      )}`}
                    >
                      {customRoutine.score.toFixed(1)}
                    </span>
                  </div>
                  <span className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
                    {customRoutine.courses.map((course) => (
                      <span key={course.code} className="font-mono text-[0.65rem] text-ink-soft">
                        {course.code}
                        <span className="text-green-deep"> · {course.section}</span>
                      </span>
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={onClearCustom}
                    className="cue-underline mono-label mt-2 text-ink-soft hover:text-ink"
                  >
                    Back to ranked plans
                  </button>
                </div>
              )}

              <ol
                className={`mt-2 space-y-2 transition-opacity duration-[var(--duration-quick)] ${
                  pageLoading ? "pointer-events-none opacity-55" : ""
                }`}
                aria-busy={pageLoading}
              >
                {routines.map((routine, index) => {
                  const active = !customRoutine && routine.id === rankedSelected?.id;
                  const label = planLabel(result.offset + index);
                  return (
                    <li key={routine.id}>
                      <motion.button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(routine.id)}
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { delay: Math.min(index * 0.035, 0.2), duration: 0.2 }
                        }
                        className={`group relative w-full border px-4 py-3 text-left transition-colors duration-[var(--duration-quick)] ${
                          active
                            ? "border-green bg-green-tint/45"
                            : "border-rule bg-paper-raised hover:border-rule-strong"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`absolute inset-y-0 left-0 w-[2px] origin-top bg-green transition-transform duration-[var(--duration-base)] ease-[var(--ease-ledger)] ${
                            active ? "scale-y-100" : "scale-y-0 group-hover:scale-y-100"
                          }`}
                        />
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="mono-label text-ink-faint">
                            {label}
                            {result.offset + index > 0 && (
                              <span className="ml-2 text-ink-faint/70">backup</span>
                            )}
                          </span>
                          <span className={`font-mono text-[1.15rem] leading-none tabular ${scoreTone(routine.score)}`}>
                            {routine.score.toFixed(1)}
                          </span>
                        </span>
                        <span className="mono-label mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ink-faint">
                          <span>{routine.stats.campus_days} days</span>
                          <span title="Idle time between classes, counted only when it lasts a full class slot or more">
                            {formatGap(routine.stats.gap_minutes)}
                          </span>
                          <span>{routine.stats.total_credits.toFixed(1)} cr</span>
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {routine.courses.map((course) => (
                            <span key={course.code} className="font-mono text-[0.65rem] text-ink-soft">
                              {course.code}
                              <span className="text-green-deep"> · {course.section}</span>
                            </span>
                          ))}
                        </span>
                      </motion.button>
                    </li>
                  );
                })}
              </ol>

              {pageError && (
                <div role="alert" className="mt-3 border border-coral/60 bg-coral-tint/25 px-3 py-2.5">
                  <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
                    {pageError.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => onPageChange(pageError.page)}
                    className="cue-underline mono-label mt-1.5 text-coral-ink"
                  >
                    Retry this page
                  </button>
                </div>
              )}

              <nav aria-label="Routine pages" className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                  disabled={pageLoading || page === 0}
                  aria-label="Previous page"
                  className="press inline-flex h-9 items-center gap-1 border border-rule px-2 font-mono text-[0.6875rem] text-ink hover:border-ink disabled:cursor-not-allowed disabled:border-rule/60 disabled:text-ink-faint"
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
                  Prev
                </button>

                {pageItems(page, pageCount).map((item) =>
                  typeof item === "string" ? (
                    <span key={item} aria-hidden className="px-0.5 text-ink-faint">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onPageChange(item)}
                      disabled={pageLoading}
                      aria-label={`Page ${item + 1}`}
                      aria-current={item === page ? "page" : undefined}
                      className={`press inline-flex h-9 min-w-9 items-center justify-center border px-2 font-mono text-[0.6875rem] tabular ${
                        item === page
                          ? "border-green bg-green text-paper"
                          : "border-rule text-ink hover:border-ink hover:bg-paper"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {item + 1}
                    </button>
                  ),
                )}

                {result.total_is_partial && page + 1 >= pageCount && result.truncated && (
                  <span aria-hidden className="px-0.5 text-ink-faint">
                    …
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                  disabled={
                    pageLoading ||
                    (!result.total_is_partial && page + 1 >= pageCount) ||
                    (result.total_is_partial && !result.truncated)
                  }
                  aria-label="Next page"
                  className="press inline-flex h-9 items-center gap-1 border border-rule px-2 font-mono text-[0.6875rem] text-ink hover:border-ink disabled:cursor-not-allowed disabled:border-rule/60 disabled:text-ink-faint"
                >
                  Next
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </button>
              </nav>

              {result.total_is_partial && (
                <p className="mono-label mt-2 leading-relaxed text-ink-faint">
                  The solver stopped at its search cap; the total is a lower bound.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="press inline-flex min-h-11 items-center gap-2 border border-rule-strong px-4 text-[0.9375rem] text-ink hover:border-ink hover:bg-paper"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Adjust constraints
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="cue-underline inline-flex min-h-11 items-center gap-2 px-1 text-[0.9375rem] text-ink-soft hover:text-ink"
                >
                  Re-run solver
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={reduceMotion ? false : panelVariants.enter}
                  animate={panelVariants.center}
                  exit={reduceMotion ? { opacity: 0 } : panelVariants.exit}
                  transition={{
                    duration: reduceMotion ? 0 : durations.panel,
                    ease: [0.2, 0.7, 0.2, 1],
                  }}
                >
                  <RoutineDetail
                    routine={selected}
                    planName={planName}
                    catalog={catalog}
                    constraints={constraints}
                    preferences={preferences}
                    pendingSwap={pendingSwap}
                    swapError={swapError}
                    onSwap={onSwap}
                    onMarkFull={onMarkFull}
                    onRestoreSection={onRestoreSection}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {status === "idle" && (
        <p className="mt-6 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
          Generate a timetable from Step 02 to see ranked options here.
        </p>
      )}
    </section>
  );
}
