"use client";

import { useId } from "react";
import type { Program } from "@/lib/types";

type ProgramToggleProps = {
  values: Program[];
  programs: Program[];
  counts: Record<string, number>;
  disabled?: boolean;
  onChange: (values: Program[]) => void;
};

export function ProgramToggle({ values, programs, counts, disabled, onChange }: ProgramToggleProps) {
  const name = useId();
  const selected = new Set(values);

  const toggle = (program: Program) => {
    if (selected.has(program)) {
      if (values.length === 1) return;
      onChange(values.filter((value) => value !== program));
      return;
    }
    onChange([...values, program]);
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mono-label mb-2 text-ink-faint">Programs</legend>
      <div className="inline-flex border border-rule bg-paper-raised">
        {programs.map((program, index) => {
          const optionId = `${name}-${index}`;
          const checked = selected.has(program);
          const lastChecked = checked && values.length === 1;

          return (
            <label
              key={program}
              htmlFor={optionId}
              title={
                lastChecked
                  ? "Keep at least one program selected"
                  : checked
                    ? `Remove ${program} courses from the list`
                    : `Include ${program} courses`
              }
              className={`press relative select-none border-r border-rule px-3 py-2 text-[0.8125rem] leading-none last:border-r-0 ${
                checked ? "bg-green text-paper" : "text-ink-soft hover:bg-paper/70 hover:text-ink"
              } ${disabled ? "cursor-not-allowed opacity-60" : lastChecked ? "cursor-default" : "cursor-pointer"}`}
            >
              <input
                id={optionId}
                type="checkbox"
                name={name}
                value={program}
                checked={checked}
                disabled={disabled || lastChecked}
                onChange={() => toggle(program)}
                className="peer sr-only"
              />
              <span className="pointer-events-none flex items-baseline gap-1.5">
                {program}
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
      <p className="mono-label mt-2 leading-relaxed text-ink-faint">
        
      </p>
    </fieldset>
  );
}
