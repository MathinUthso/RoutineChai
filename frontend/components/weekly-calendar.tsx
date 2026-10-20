"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DAYS, DAY_NAMES, minutesOfDay } from "@/lib/schedule";
import type { Day, Meeting, Routine, RoutineCourse } from "@/lib/types";

/** Teaching day window: first bell 08:30, last dismissal 16:30. */
const RANGE_START = 8 * 60 + 30;
const RANGE_END = 16 * 60 + 30;
const SPAN = RANGE_END - RANGE_START;
const BODY_HEIGHT = "30rem";
const TIP_WIDTH = 264;
/** Shortest sliver drawn for a meeting clamped entirely outside the window. */
const MIN_SLIVER = 20;

type Tone = "clay" | "moss" | "slate" | "sand" | "rose" | "iris";

/** Deterministic, low-saturation course tints defined in app/globals.css. */
const TONE_CLASS: Record<Tone, { block: string; code: string }> = {
  clay: { block: "bg-course-clay border-l-course-clay-ink", code: "text-course-clay-ink" },
  moss: { block: "bg-course-moss border-l-course-moss-ink", code: "text-course-moss-ink" },
  slate: { block: "bg-course-slate border-l-course-slate-ink", code: "text-course-slate-ink" },
  sand: { block: "bg-course-sand border-l-course-sand-ink", code: "text-course-sand-ink" },
  rose: { block: "bg-course-rose border-l-course-rose-ink", code: "text-course-rose-ink" },
  iris: { block: "bg-course-iris border-l-course-iris-ink", code: "text-course-iris-ink" },
};

const TONES = Object.keys(TONE_CLASS) as Tone[];

function toneFor(code: string): Tone {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return TONES[(hash >>> 0) % TONES.length];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percentOf(minutes: number) {
  return ((minutes - RANGE_START) / SPAN) * 100;
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Clock-aligned rules: every 30 minutes from 09:00 to 16:00. */
const RULES = Array.from({ length: (RANGE_END - RANGE_START - 30) / 30 }, (_, index) => {
  const minutes = RANGE_START + 30 + index * 30;
  return { minutes, hour: minutes % 60 === 0 };
});

/** 08:30, hourly marks, 16:30. Half-hours stay unlabelled to keep the gutter quiet. */
const TIME_LABELS = [
  RANGE_START,
  ...Array.from(
    { length: 8 },
    (_, index) => RANGE_START + 30 + index * 60,
  ),
  RANGE_END,
];

type PlacedMeeting = {
  key: string;
  course: RoutineCourse;
  meeting: Meeting;
  tone: Tone;
  top: number;
  height: number;
  clamped: boolean;
};

type TipState = {
  id: string;
  left: number;
  top: number;
  placement: "top" | "bottom";
};

function roomOf(meeting: Meeting) {
  return meeting.room.trim() || "TBA";
}

function meetingSentence(course: RoutineCourse, meeting: Meeting) {
  return [
    `${DAY_NAMES[meeting.day]} ${meeting.start} to ${meeting.end}`,
    `${course.code} ${course.title}`,
    `section ${course.section}`,
    course.kind === "lab" ? "lab session" : "theory class",
    `room ${roomOf(meeting)}`,
    course.faculty,
  ].join(", ");
}

function meetingTitle(course: RoutineCourse, meeting: Meeting) {
  return [
    `${course.code} · ${course.title}`,
    `${DAY_NAMES[meeting.day]} ${meeting.start}–${meeting.end} · ${roomOf(meeting)}`,
    `${course.faculty} · Section ${course.section} · ${course.kind === "lab" ? "Lab" : "Theory"}`,
  ].join("\n");
}

export function WeeklyCalendar({ routine }: { routine: Routine }) {
  const reduceMotion = useReducedMotion();
  const headingId = useId();
  const [tip, setTip] = useState<TipState | null>(null);

  const placed = useMemo<PlacedMeeting[]>(() => {
    const list: PlacedMeeting[] = [];

    routine.courses.forEach((course, courseIndex) => {
      const tone = toneFor(course.code);

      course.meetings.forEach((meeting, meetingIndex) => {
        const rawStart = minutesOfDay(meeting.start);
        const rawEnd = minutesOfDay(meeting.end);
        if (rawStart === null) return;

        const fallbackEnd = rawStart + 45;
        const start = clamp(rawStart, RANGE_START, RANGE_END - MIN_SLIVER);
        let end = clamp(rawEnd ?? fallbackEnd, RANGE_START + MIN_SLIVER, RANGE_END);
        if (end <= start) end = Math.min(RANGE_END, start + MIN_SLIVER);

        list.push({
          key: `${course.code}-${meeting.day}-${meeting.start}-${courseIndex}-${meetingIndex}`,
          course,
          meeting,
          tone,
          top: percentOf(start),
          height: ((end - start) / SPAN) * 100,
          clamped: rawStart < RANGE_START || (rawEnd ?? fallbackEnd) > RANGE_END,
        });
      });
    });

    return list.sort(
      (a, b) =>
        DAYS.indexOf(a.meeting.day) - DAYS.indexOf(b.meeting.day) ||
        (minutesOfDay(a.meeting.start) ?? 0) - (minutesOfDay(b.meeting.start) ?? 0),
    );
  }, [routine]);

  const byDay = useMemo(() => {
    const map = new Map<Day, PlacedMeeting[]>();
    for (const day of DAYS) map.set(day, []);
    for (const item of placed) map.get(item.meeting.day)?.push(item);
    return map;
  }, [placed]);

  const dayLoad = useMemo(
    () =>
      DAYS.map((day) => {
        const items = byDay.get(day) ?? [];
        const starts = items.map((item) => minutesOfDay(item.meeting.start) ?? RANGE_START);
        const ends = items.map((item) => minutesOfDay(item.meeting.end) ?? RANGE_END);
        return {
          day,
          count: items.length,
          span: items.length
            ? `${formatClock(Math.min(...starts))}–${formatClock(Math.max(...ends))}`
            : "—",
        };
      }),
    [byDay],
  );

  const active = tip ? placed.find((item) => item.key === tip.id) ?? null : null;

  const hideTip = useCallback(() => setTip(null), []);

  const showTip = useCallback((button: HTMLButtonElement, id: string) => {
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fitsAbove = rect.top >= 190;
    const fitsBelow = viewportHeight - rect.bottom >= 190;
    const placement: "top" | "bottom" = fitsAbove || !fitsBelow ? "top" : "bottom";
    const left = clamp(
      rect.left + rect.width / 2 - TIP_WIDTH / 2,
      8,
      Math.max(8, viewportWidth - TIP_WIDTH - 8),
    );

    setTip({
      id,
      left,
      top: placement === "top" ? rect.top - 8 : rect.bottom + 8,
      placement,
    });
  }, []);

  /** A scrolled or resized tooltip would point at nothing. */
  useEffect(() => {
    if (!tip) return;

    const clear = () => setTip(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);

    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [tip]);

  return (
    <section aria-labelledby={headingId} className="border-b border-rule">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-2.5">
        <h4 id={headingId} className="mono-label text-ink">
          Weekly grid
        </h4>
        <p className="mono-label tabular text-ink-faint">Sat–Wed · 08:30–16:30</p>
      </div>

      {placed.length === 0 ? (
        <div className="mx-5 mt-1 mb-5 border border-dashed border-rule-strong/70 px-4 py-5">
          <p className="text-[0.9375rem] text-ink">No classes on this sheet.</p>
          <p className="mt-1 max-w-[52ch] text-[0.8125rem] leading-relaxed text-ink-faint">
            The solver returned a routine without scheduled sessions. Check the course ledger or
            re-run the solver with a different constraint set.
          </p>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Weekly timetable, Saturday to Wednesday, 08:30 to 16:30. Scroll sideways for later days."
            tabIndex={0}
            onScroll={hideTip}
            className="overflow-x-auto overscroll-x-contain bg-paper/45 outline-offset-0"
          >
            <div className="min-w-[34rem]">
              <div className="grid grid-cols-[3rem_repeat(5,minmax(0,1fr))] border-b border-rule">
                <div aria-hidden className="sticky left-0 z-20 bg-paper-raised" />
                {DAYS.map((day) => {
                  const load = dayLoad.find((entry) => entry.day === day);
                  return (
                    <div key={day} className="border-l border-rule px-1 py-2 text-center">
                      <p className="mono-label text-ink">{day}</p>
                      <p className="mono-label mt-0.5 tabular text-ink-faint">
                        {load && load.count > 0 ? String(load.count).padStart(2, "0") : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[3rem_repeat(5,minmax(0,1fr))]">
                <div
                  aria-hidden
                  className="sticky left-0 z-20 h-[30rem] border-r border-rule bg-paper-raised"
                >
                  {TIME_LABELS.map((minutes, index) => (
                    <span
                      key={minutes}
                      style={{ top: `${percentOf(minutes)}%` }}
                      className={`absolute right-1.5 font-mono text-[0.625rem] leading-none tabular text-ink-faint ${
                        index === 0
                          ? ""
                          : index === TIME_LABELS.length - 1
                            ? "-translate-y-full"
                            : "-translate-y-1/2"
                      }`}
                    >
                      {formatClock(minutes)}
                    </span>
                  ))}
                </div>

                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="relative border-l border-rule"
                    style={{ height: BODY_HEIGHT }}
                  >
                    <span aria-hidden className="absolute inset-0">
                      {RULES.map((rule) => (
                        <span
                          key={rule.minutes}
                          style={{ top: `${percentOf(rule.minutes)}%` }}
                          className={`absolute inset-x-0 border-t ${
                            rule.hour ? "border-rule" : "border-rule/35"
                          }`}
                        />
                      ))}
                      <span className="absolute inset-x-0 bottom-0 border-t border-rule" />
                    </span>

                    {(byDay.get(day) ?? []).map((item) => {
                      const tone = TONE_CLASS[item.tone];
                      return (
                        <motion.button
                          key={item.key}
                          type="button"
                          aria-label={meetingSentence(item.course, item.meeting)}
                          aria-describedby={
                            tip?.id === item.key ? "meeting-tooltip" : undefined
                          }
                          title={meetingTitle(item.course, item.meeting)}
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={
                            reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }
                          }
                          onPointerEnter={(event) => showTip(event.currentTarget, item.key)}
                          onPointerLeave={hideTip}
                          onFocus={(event) => showTip(event.currentTarget, item.key)}
                          onBlur={hideTip}
                          style={{
                            top: `calc(${item.top}% + 1px)`,
                            height: `calc(${item.height}% - 2px)`,
                          }}
                          className={`absolute inset-x-[3px] z-10 flex min-h-7 flex-col overflow-hidden rounded-[2px] border border-rule-strong/45 border-l-[3px] px-1.5 py-1 text-left transition-[box-shadow,filter] duration-[var(--duration-quick)] hover:z-20 hover:shadow-row hover:brightness-[0.985] focus-visible:z-20 ${tone.block}`}
                        >
                          <span className="flex items-baseline justify-between gap-1">
                            <span
                              className={`truncate font-mono text-[0.6875rem] font-medium leading-tight ${tone.code}`}
                            >
                              {item.course.code}
                            </span>
                            <span className="shrink-0 border border-ink/15 px-0.5 font-mono text-[0.5625rem] leading-[1.3] text-ink-soft">
                              {item.course.section}
                            </span>
                          </span>
                          <span className="mt-0.5 truncate font-mono text-[0.625rem] leading-tight text-ink-soft">
                            {roomOf(item.meeting)}
                          </span>
                          {item.course.kind === "lab" && (
                            <span className="mono-label mt-auto text-[0.5rem] text-ink-faint">Lab</span>
                          )}
                          {item.clamped && (
                            <span className="sr-only">Partially outside the 08:30–16:30 window.</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-rule px-4 py-2.5 sm:hidden">
            <p className="mono-label text-ink-faint">Day load</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {dayLoad.map((entry) => (
                <li
                  key={entry.day}
                  className="font-mono text-[0.6875rem] leading-snug tabular text-ink-soft"
                >
                  <span className="text-ink-faint">{entry.day}</span>{" "}
                  {entry.count === 0 ? "—" : `${entry.count} · ${entry.span}`}
                </li>
              ))}
            </ul>
            <p className="mono-label mt-2 leading-relaxed text-ink-faint">
              Scroll the grid sideways for later days.
            </p>
          </div>

          <div className="sr-only">
            <h5>Meetings on this sheet</h5>
            <ul>
              {placed.map((item) => (
                <li key={`sr-${item.key}`}>{meetingSentence(item.course, item.meeting)}.</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tip &&
        active &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="meeting-tooltip"
            role="tooltip"
            style={{ left: tip.left, top: tip.top, width: TIP_WIDTH }}
            className={`pointer-events-none fixed z-50 border border-ink/15 bg-paper-raised px-3 py-2.5 shadow-sheet ${
              tip.placement === "top" ? "-translate-y-full" : ""
            }`}
          >
            <p className="mono-label text-ink-faint">
              {active.course.code} · Section {active.course.section}
            </p>
            <p className="mt-1 text-[0.8125rem] font-medium leading-snug text-ink">
              {active.course.title}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 font-mono text-[0.6875rem] leading-relaxed">
              <dt className="text-ink-faint">When</dt>
              <dd className="tabular text-ink">
                {active.meeting.day} {active.meeting.start}–{active.meeting.end}
              </dd>
              <dt className="text-ink-faint">Room</dt>
              <dd className="text-ink">{roomOf(active.meeting)}</dd>
              <dt className="text-ink-faint">Faculty</dt>
              <dd className="text-ink">{active.course.faculty}</dd>
              <dt className="text-ink-faint">Type</dt>
              <dd className="text-ink">
                {active.course.kind === "lab" ? "Lab" : "Theory"} · {active.course.credits.toFixed(1)} cr
              </dd>
            </dl>
          </div>,
          document.body,
        )}
    </section>
  );
}
