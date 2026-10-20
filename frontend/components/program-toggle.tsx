"use client";

import { useId } from "react";

type ProgramToggleProps = {
  value: string;
  programs: string[];
  counts: Record<string, number>;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function ProgramToggle({ value, programs, counts, disabled, onChange }: ProgramToggleProps) {
  const name = useId();

  return (
    <fieldset className="min-w-0">
      <legend className="mono-label mb-2 text-ink-faint">Program</legend>
      <div className="inline-flex border border-rule bg-paper-raised">
        {programs.map((program, index) => {
          const optionId = `${name}-${index}`;
          const checked = value === program;

          return (
            <label
              key={program}
              htmlFor={optionId}
              className={`relative cursor-pointer select-none px-3 py-2 text-[0.8125rem] leading-none transition-colors duration-[var(--duration-quick)] first:border-r first:border-rule ${
                checked ? "bg-green text-paper" : "text-ink-soft hover:bg-paper/70 hover:text-ink"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={program}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(program)}
                className="peer sr-only"
              />
              <span className="pointer-events-none flex items-baseline gap-1.5">
                {program === "all" ? "All programs" : program}
                <span
                  className={`font-mono text-[10px] tabular ${
                    checked ? "text-paper/70" : "text-ink-faint"
                  }`}
                >
                  {counts[program] ?? 0}
                </span>
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
