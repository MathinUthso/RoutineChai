"use client";

import { formatGap, formatTime } from "@/lib/schedule";
import type { Constraints } from "@/lib/types";

type LiveRefineProps = {
  constraints: Constraints;
  busy: boolean;
  error?: string | null;
  onChange: (next: Constraints) => void;
};

const GAP_MAX = 240;
const END_MIN = 13 * 60;
const END_MAX = 16 * 60 + 30;

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function endMinutes(value: string | null): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return END_MAX;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Math.max(END_MIN, Math.min(END_MAX, minutes));
}

function Slider({
  name,
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  minimumLabel,
  maximumLabel,
  onChange,
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  minimumLabel: string;
  maximumLabel: string;
  onChange: (value: number) => void;
}) {
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="mono-label text-ink-faint">{label}</span>
        <span className="font-mono text-[0.6875rem] tabular text-ink">{valueLabel}</span>
      </span>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ledger-range w-full"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
      />
      <span className="flex justify-between font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-ink-faint">
        <span>{minimumLabel}</span>
        <span>{maximumLabel}</span>
      </span>
    </label>
  );
}

export function LiveRefine({ constraints, busy, error, onChange }: LiveRefineProps) {
  const gapValue = constraints.max_gap_minutes ?? GAP_MAX;
  const daysValue = constraints.max_campus_days ?? 5;
  const endValue = endMinutes(constraints.latest_end);
  const sessionValue = constraints.max_sessions_per_day;
  const activeCount =
    (constraints.max_gap_minutes !== null ? 1 : 0) +
    (constraints.max_campus_days !== null ? 1 : 0) +
    (constraints.latest_end !== null ? 1 : 0) +
    (constraints.max_sessions_per_day !== 3 ? 1 : 0);

  return (
    <section
      aria-labelledby="live-refine-title"
      className="border border-rule bg-paper-raised shadow-sheet"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h3
          id="live-refine-title"
          className="mono-label text-ink"
          title="Slide a rule and the plans re-rank. The last good list stays visible while the solver works."
        >
          Live constraints
        </h3>
        <span className="mono-label tabular text-ink-faint" aria-live="polite">
          {busy ? "Re-ranking…" : activeCount > 0 ? `${activeCount} active` : "Open"}
        </span>
      </div>

      <div className="grid gap-x-5 gap-y-4 px-4 py-4">
        <Slider
          name="max-gap"
          label="Longest gap"
          value={gapValue}
          min={0}
          max={GAP_MAX}
          step={15}
          valueLabel={
            gapValue >= GAP_MAX ? "No cap" : gapValue === 0 ? "No gap" : `≤ ${formatGap(gapValue)}`
          }
          minimumLabel="No gap"
          maximumLabel="Any"
          onChange={(value) =>
            onChange({ ...constraints, max_gap_minutes: value >= GAP_MAX ? null : value })
          }
        />
        <Slider
          name="latest-end"
          label="Latest end"
          value={endValue}
          min={END_MIN}
          max={END_MAX}
          step={15}
          valueLabel={endValue >= END_MAX ? "No cap" : `By ${formatTime(hhmm(endValue))}`}
          minimumLabel={formatTime(hhmm(END_MIN))}
          maximumLabel="Any"
          onChange={(value) =>
            onChange({ ...constraints, latest_end: value >= END_MAX ? null : hhmm(value) })
          }
        />
        <Slider
          name="campus-days"
          label="Campus days"
          value={daysValue}
          min={1}
          max={5}
          step={1}
          valueLabel={
            daysValue >= 5 ? "No cap" : `≤ ${daysValue} ${daysValue === 1 ? "day" : "days"}`
          }
          minimumLabel="1 day"
          maximumLabel="Any"
          onChange={(value) =>
            onChange({ ...constraints, max_campus_days: value >= 5 ? null : value })
          }
        />
        <Slider
          name="classes-per-day"
          label="Classes / day"
          value={sessionValue}
          min={1}
          max={4}
          step={1}
          valueLabel={`≤ ${sessionValue} / day`}
          minimumLabel="1"
          maximumLabel="4"
          onChange={(value) => onChange({ ...constraints, max_sessions_per_day: value })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
        <span className="mono-label text-ink-faint">Re-ranks live</span>
        <button
          type="button"
          disabled={activeCount === 0 || busy}
          onClick={() =>
            onChange({
              ...constraints,
              max_gap_minutes: null,
              max_campus_days: null,
              latest_end: null,
              max_sessions_per_day: 3,
            })
          }
          className="mono-label inline-flex min-h-9 items-center border border-rule-strong px-2.5 text-ink transition-colors hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint"
        >
          Clear rules
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-coral/50 px-4 py-2 text-[0.8125rem] text-coral-ink"
        >
          {error}
        </p>
      )}
    </section>
  );
}
