"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { durations, panelVariants } from "@/lib/motion";
import { formatGap, formatMeeting } from "@/lib/schedule";
import type {
  Diagnostics,
  GenerateResult,
  Routine,
  ScoreBreakdown,
} from "@/lib/types";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import { WeeklyCalendar } from "./weekly-calendar";

type ResultStatus = "idle" | "loading" | "error" | "ready";

type ResultsPanelProps = {
  status: ResultStatus;
  result?: GenerateResult;
  error?: string;
  selectedId: string | null;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  onSelect: (id: string) => void;
  onBack: () => void;
  onRetry: () => void;
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
        <p className="mono-label text-coral-ink">No sheet could be issued</p>
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
            className="inline-flex min-h-11 items-center gap-2 bg-green px-4 text-[0.9375rem] text-paper transition-colors hover:bg-green-deep"
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
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {BREAKDOWN_LABELS.map(({ key, label }) => {
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
              <div
                className={`h-full ${value >= 70 ? "bg-green" : value >= 40 ? "bg-rule-strong" : "bg-coral"}`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}

function RoutineDetail({ routine }: { routine: Routine }) {
  return (
    <div className="border border-rule bg-paper-raised shadow-sheet">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div>
          <p className="mono-label text-ink-faint">Selected sheet</p>
          <h3 className="mt-1 text-[1.2rem] font-medium tracking-[-0.01em] text-ink">
            Issued routine
          </h3>
          <p className="mono-label mt-1 text-ink-faint">
            {routine.courses.length} courses · {routine.stats.campus_days} campus{" "}
            {routine.stats.campus_days === 1 ? "day" : "days"}
          </p>
        </div>
        <div className="text-right">
          <p className="mono-label text-ink-faint">Score</p>
          <p className={`font-mono text-[2rem] leading-none tabular ${scoreTone(routine.score)}`}>
            {routine.score.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
        {[
          ["Credits", routine.stats.total_credits.toFixed(1)],
          ["Gaps", formatGap(routine.stats.gap_minutes)],
          [
            "Span",
            routine.stats.earliest && routine.stats.latest
              ? `${routine.stats.earliest}–${routine.stats.latest}`
              : "—",
          ],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-3">
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
          <h4 className="mono-label text-ink">Course ledger</h4>
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
                  <p className="mono-label mt-1 text-ink-faint">
                    {course.kind === "lab" ? "Lab" : "Theory"} · {course.faculty}
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
    </div>
  );
}

export function ResultsPanel({
  status,
  result,
  error,
  selectedId,
  headingRef,
  onSelect,
  onBack,
  onRetry,
}: ResultsPanelProps) {
  const reduceMotion = useReducedMotion();
  const routines = result?.routines ?? [];
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];

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
            The issued sheet
          </h2>
        </div>
        <p className="mono-label tabular text-ink-faint" aria-live="polite">
          {status === "loading"
            ? "Consulting the solver"
            : status === "ready"
              ? `${routines.length} ${routines.length === 1 ? "option" : "options"}`
              : "Awaiting a request"}
        </p>
      </div>

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
              className="inline-flex min-h-11 items-center border border-ink px-4 text-[0.9375rem] text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-2 px-1 text-[0.9375rem] text-ink-soft hover:text-ink"
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
              ? `Showing routine ${selected.id}, score ${selected.score.toFixed(1)} of 100, ${selected.courses.length} courses.`
              : ""}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
            <div>
              <div className="flex items-baseline justify-between gap-3 border-y border-rule py-2">
                <h3 className="mono-label text-ink">Ranked options</h3>
                <span className="mono-label tabular text-ink-faint">
                  {result.truncated ? "top 10" : `${routines.length} total`}
                </span>
              </div>

              <ol className="mt-2 space-y-2">
                {routines.map((routine, index) => {
                  const active = routine.id === selected?.id;
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
                        className={`w-full border px-4 py-3 text-left transition-colors duration-[var(--duration-quick)] ${
                          active
                            ? "border-green bg-green-tint/45"
                            : "border-rule bg-paper-raised hover:border-rule-strong"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="mono-label text-ink-faint">
                            Rank {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className={`font-mono text-[1.15rem] leading-none tabular ${scoreTone(routine.score)}`}>
                            {routine.score.toFixed(1)}
                          </span>
                        </span>
                        <span className="mono-label mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ink-faint">
                          <span>{routine.stats.campus_days} days</span>
                          <span>{formatGap(routine.stats.gap_minutes)}</span>
                          <span>{routine.stats.total_credits.toFixed(1)} cr</span>
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {routine.courses.map((course) => (
                            <span key={course.code} className="font-mono text-[0.65rem] text-ink-soft">
                              {course.code}
                            </span>
                          ))}
                        </span>
                      </motion.button>
                    </li>
                  );
                })}
              </ol>

              {result.truncated && (
                <p className="mono-label mt-3 leading-relaxed text-ink-faint">
                  More valid sheets exist; the top 10 are shown.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex min-h-11 items-center gap-2 border border-rule-strong px-4 text-[0.9375rem] text-ink transition-colors hover:border-ink hover:bg-paper"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Adjust constraints
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-11 items-center gap-2 px-1 text-[0.9375rem] text-ink-soft hover:text-ink"
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
                  <RoutineDetail routine={selected} />
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
