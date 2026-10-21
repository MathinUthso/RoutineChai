"use client";

import { useEffect, useId, useRef } from "react";
import {
  DAYS,
  DAY_NAMES,
  MAX_SESSIONS_OPTIONS,
  TIME_PREFERENCE_HINTS,
  TIME_PREFERENCE_LABELS,
  type ConstraintIssue,
} from "@/lib/schedule";
import type { Constraints, Day, TimePreference } from "@/lib/types";
import { Chip } from "./chip";
import { AlertIcon, CloseIcon, PlusIcon } from "./icons";

type ConstraintFormProps = {
  value: Constraints;
  issues: ConstraintIssue[];
  onChange: (next: Constraints) => void;
};

type SegmentOption = { value: string; label: string; srLabel?: string };

function AngleChevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
    >
      <path d="M4 6.5L8 10l4-3.5" />
    </svg>
  );
}

function Segmented({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex border border-rule bg-paper">
        {options.map((option, index) => {
          const checked = option.value === value;

          return (
            <label
              key={option.value}
              className={`relative cursor-pointer select-none ${
                index > 0 ? "border-l border-rule" : ""
              } ${checked ? "bg-green" : "hover:bg-paper-raised"}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
                aria-label={option.srLabel}
              />
              <span
                className={`flex min-h-11 items-center px-3.5 text-[0.8125rem] leading-none transition-colors duration-[var(--duration-quick)] ${
                  checked ? "text-paper" : "text-ink-soft"
                }`}
              >
                {option.label}
              </span>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green"
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Clause({
  number,
  label,
  hint,
  children,
}: {
  number: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 px-4 py-5 md:grid-cols-[8.75rem_minmax(0,1fr)] md:gap-6">
      <div>
        <p className="mono-label tabular text-ink-faint">{number}</p>
        <p className="mt-1 text-[0.875rem] font-medium leading-snug text-ink">{label}</p>
      </div>
      <div className="min-w-0">
        {hint && (
          <p className="mb-2.5 max-w-[52ch] text-[0.8125rem] leading-relaxed text-ink-faint">
            {hint}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mono-label mt-2 flex items-start gap-1.5 leading-relaxed text-coral-ink"
    >
      <AlertIcon className="mt-px h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}

export function ConstraintForm({ value, issues, onChange }: ConstraintFormProps) {
  const baseId = useId();
  const pendingFocus = useRef<number | null>(null);
  const rowRefs = useRef<(HTMLSelectElement | null)[]>([]);

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const node = rowRefs.current[index];
    if (!node) return;
    node.focus();
    pendingFocus.current = null;
  }, [value.blocked.length]);

  const daysError = issues.find((issue) => issue.field === "allowedDays");
  const blockedIssue = (index: number) =>
    issues.find((issue) => issue.field === "blocked" && issue.index === index);

  const set = (patch: Partial<Constraints>) => onChange({ ...value, ...patch });

  const toggleDay = (day: Day) => {
    const allowed = value.allowed_days.includes(day);
    set({
      allowed_days: allowed
        ? value.allowed_days.filter((item) => item !== day)
        : [...value.allowed_days, day],
    });
  };

  const toggleOffDay = (day: Day) => {
    set({
      preferred_off_days: value.preferred_off_days.includes(day)
        ? value.preferred_off_days.filter((item) => item !== day)
        : [...value.preferred_off_days, day],
    });
  };

  const addWindow = () => {
    const day = value.allowed_days[0] ?? "Sat";
    const next = [...value.blocked, { day, start: "08:30", end: "11:10" }];
    const last = next.length - 1;
    set({ blocked: next });
    pendingFocus.current = last;
  };

  const updateWindow = (index: number, patch: Partial<Constraints["blocked"][number]>) => {
    set({
      blocked: value.blocked.map((window, at) =>
        at === index ? { ...window, ...patch } : window,
      ),
    });
  };

  const removeWindow = (index: number) => {
    set({ blocked: value.blocked.filter((_, at) => at !== index) });
  };

  return (
    <div className="border border-rule bg-paper-raised">
      <div className="divide-y divide-rule">
        <Clause
          number="01"
          label="Teaching days"
          hint="Classes run Saturday through Wednesday. At least one day must stay open."
        >
          <fieldset>
            <legend className="sr-only">Allowed teaching days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <Chip
                  key={day}
                  pressed={value.allowed_days.includes(day)}
                  label={DAY_NAMES[day]}
                  title={DAY_NAMES[day]}
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </Chip>
              ))}
            </div>
            {daysError && <FieldError id={`${baseId}-days-error`}>{daysError.message}</FieldError>}
          </fieldset>
        </Clause>

        <Clause
          number="02"
          label="Session ceiling"
          hint="Cap how many class meetings may land on a single day."
        >
          <Segmented
            legend="Maximum sessions per day"
            name={`${baseId}-sessions`}
            value={String(value.max_sessions_per_day)}
            onChange={(next) => set({ max_sessions_per_day: Number(next) })}
            options={MAX_SESSIONS_OPTIONS.map((count) => ({
              value: String(count),
              label: String(count),
              srLabel: `${count} ${count === 1 ? "session" : "sessions"} per day`,
            }))}
          />
          <p className="mono-label mt-2 text-ink-faint">
            {value.max_sessions_per_day} per day · {value.allowed_days.length} teaching days
          </p>
        </Clause>

        <Clause number="03" label="Time of day" hint="A ranking preference, not a hard filter.">
          <Segmented
            legend="Time of day preference"
            name={`${baseId}-time`}
            value={value.time_preference}
            onChange={(next) => set({ time_preference: next as TimePreference })}
            options={(["morning", "afternoon", "any"] as TimePreference[]).map((preference) => ({
              value: preference,
              label: TIME_PREFERENCE_LABELS[preference],
            }))}
          />
          <p className="mono-label mt-2 leading-relaxed text-ink-faint">
            {TIME_PREFERENCE_HINTS[value.time_preference]}
          </p>
        </Clause>

        <Clause
          number="04"
          label="Preferred off days"
          hint="Optional. The solver avoids these days when another arrangement scores as well."
        >
          <fieldset>
            <legend className="sr-only">Preferred off days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const allowed = value.allowed_days.includes(day);
                const pressed = value.preferred_off_days.includes(day);

                return (
                  <Chip
                    key={day}
                    pressed={pressed}
                    label={`${DAY_NAMES[day]} preferred off`}
                    title={allowed ? DAY_NAMES[day] : "Not an allowed teaching day"}
                    disabled={!allowed}
                    onClick={() => toggleOffDay(day)}
                  >
                    {day}
                  </Chip>
                );
              })}
            </div>
            <p className="mono-label mt-2 leading-relaxed text-ink-faint">
              {value.preferred_off_days.length === 0
                ? "No day marked off"
                : `${formatDays(value.preferred_off_days)} marked off`}
            </p>
          </fieldset>
        </Clause>

        <Clause
          number="05"
          label="Blocked windows"
          hint="Hours you cannot attend — another class, a commute, a shift. Sections overlapping a window are excluded."
        >
          {value.blocked.length === 0 ? (
            <p className="border border-dashed border-rule-strong/70 px-3.5 py-4 text-[0.8125rem] leading-relaxed text-ink-faint">
              No hours blocked. The solver may place a section anywhere inside the allowed days.
            </p>
          ) : (
            <div className="border border-rule bg-paper">
              <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 border-b border-rule px-3 py-2 sm:grid">
                <span className="mono-label text-ink-faint">Day</span>
                <span className="mono-label text-ink-faint">From</span>
                <span className="mono-label text-ink-faint">To</span>
                <span className="sr-only">Remove</span>
              </div>

              <ul className="divide-y divide-rule">
                {value.blocked.map((window, index) => {
                  const issue = blockedIssue(index);
                  const errorId = `${baseId}-window-${index}-error`;
                  const dayId = `${baseId}-window-${index}-day`;
                  const startId = `${baseId}-window-${index}-start`;
                  const endId = `${baseId}-window-${index}-end`;

                  return (
                    <li
                      key={index}
                      className="grid gap-2 px-3 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] sm:items-start"
                    >
                      <div className="relative">
                        <label htmlFor={dayId} className="sr-only">
                          Day for blocked window {index + 1}
                        </label>
                        <select
                          id={dayId}
                          ref={(node) => {
                            rowRefs.current[index] = node;
                          }}
                          value={window.day}
                          onChange={(event) =>
                            updateWindow(index, { day: event.target.value as Day })
                          }
                          aria-invalid={issue ? true : undefined}
                          aria-describedby={issue ? errorId : undefined}
                          className="h-11 w-full appearance-none border border-rule bg-paper pl-2.5 pr-7 font-mono text-[0.8125rem] text-ink transition-colors focus:border-green"
                        >
                          {DAYS.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                        <AngleChevron />
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:contents">
                        <div>
                          <span className="mono-label mb-1 block text-ink-faint sm:hidden">
                            From
                          </span>
                          <label htmlFor={startId} className="sr-only">
                            Start time for blocked window {index + 1}
                          </label>
                          <input
                            id={startId}
                            type="time"
                            value={window.start}
                            step={300}
                            onChange={(event) => updateWindow(index, { start: event.target.value })}
                            aria-invalid={issue ? true : undefined}
                            aria-describedby={issue ? errorId : undefined}
                            className={`h-11 w-full border bg-paper px-2.5 font-mono text-[0.8125rem] tabular text-ink transition-colors focus:border-green ${
                              issue ? "border-coral" : "border-rule"
                            }`}
                          />
                        </div>
                        <div>
                          <span className="mono-label mb-1 block text-ink-faint sm:hidden">
                            To
                          </span>
                          <label htmlFor={endId} className="sr-only">
                            End time for blocked window {index + 1}
                          </label>
                          <input
                            id={endId}
                            type="time"
                            value={window.end}
                            step={300}
                            onChange={(event) => updateWindow(index, { end: event.target.value })}
                            aria-invalid={issue ? true : undefined}
                            aria-describedby={issue ? errorId : undefined}
                            className={`h-11 w-full border bg-paper px-2.5 font-mono text-[0.8125rem] tabular text-ink transition-colors focus:border-green ${
                              issue ? "border-coral" : "border-rule"
                            }`}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeWindow(index)}
                        aria-label={`Remove blocked window ${index + 1}, ${window.day} ${window.start} to ${window.end}`}
                        className="grid h-11 w-11 place-items-center justify-self-start border border-rule text-ink-faint transition-colors hover:border-coral hover:bg-coral-tint hover:text-coral-ink sm:justify-self-end"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>

                      {issue && (
                        <div className="sm:col-span-4">
                          <FieldError id={errorId}>{issue.message}</FieldError>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-rule px-3 py-1.5">
                <button
                  type="button"
                  onClick={addWindow}
                  className="mono-label inline-flex min-h-11 items-center gap-1.5 text-green transition-colors hover:text-green-deep"
                >
                  <PlusIcon className="h-3 w-3" />
                  Add blocked window
                </button>
              </div>
            </div>
          )}

          {value.blocked.length === 0 && (
            <button
              type="button"
              onClick={addWindow}
              className="mono-label mt-2 inline-flex min-h-11 items-center gap-1.5 text-green transition-colors hover:text-green-deep"
            >
              <PlusIcon className="h-3 w-3" />
              Add blocked window
            </button>
          )}
        </Clause>
      </div>
    </div>
  );
}

function formatDays(days: Day[]) {
  return DAYS.filter((day) => days.includes(day)).join(", ");
}
