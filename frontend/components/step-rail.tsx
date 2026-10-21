"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "@/lib/motion";
import { CheckIcon, LockIcon } from "./icons";

type StepId = 1 | 2 | 3;

type StepRailProps = {
  step: StepId;
  selectedCount: number;
  hasResult: boolean;
  onSelect: (step: 1 | 2 | 3) => void;
};

const steps: { id: StepId; label: string }[] = [
  { id: 1, label: "Courses" },
  { id: 2, label: "Constraints" },
  { id: 3, label: "Timetable" },
];

export function StepRail({ step, selectedCount, hasResult, onSelect }: StepRailProps) {
  const reduceMotion = useReducedMotion();
  const [hint, setHint] = useState<{ atStep: StepId; text: string } | null>(null);
  const activeHint = hint?.atStep === step ? hint.text : null;

  const handleSelect = (target: StepId) => {
    if (target === 3 && !hasResult) {
      setHint({ atStep: step, text: "Generate a timetable before opening this step." });
      return;
    }
    if (target === 2 && selectedCount === 0) {
      setHint({ atStep: step, text: "Add at least one course before setting constraints." });
      return;
    }

    setHint(null);
    onSelect(target);
  };

  return (
    <div className="border-b border-rule bg-paper-raised/60">
      <nav aria-label="Routine planning steps" className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)]">
        <ol className="grid grid-cols-3">
          {steps.map((item) => {
            const isActive = item.id === step;
            const isLocked =
              (item.id === 2 && selectedCount === 0) || (item.id === 3 && !hasResult);
            const isComplete = item.id < step;

            return (
              <li key={item.id} className="border-r border-rule/70 last:border-r-0">
                <button
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  aria-disabled={isLocked || undefined}
                  onClick={() => handleSelect(item.id)}
                  className="group press relative flex w-full flex-col gap-1 px-3 py-3.5 text-left first:pl-0 sm:flex-row sm:items-baseline sm:gap-3 sm:px-4 sm:py-4"
                >
                  <span
                    className={`mono-label tabular flex items-center gap-1.5 transition-colors duration-[var(--duration-quick)] ${
                      isActive ? "text-green" : isComplete ? "text-ink-soft" : "text-ink-faint"
                    }`}
                  >
                    {String(item.id).padStart(2, "0")}
                    {isLocked && <LockIcon className="h-3 w-3" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={`truncate text-[0.9375rem] leading-tight transition-colors duration-[var(--duration-quick)] ${
                        isActive
                          ? "font-medium text-ink"
                          : "text-ink-soft group-hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`mono-label ${
                        isActive ? "text-green" : isLocked ? "text-ink-faint" : "text-ink-faint"
                      }`}
                    >
                      {isActive ? (
                        "In progress"
                      ) : isComplete ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckIcon className="h-2.5 w-2.5" />
                          Complete
                        </span>
                      ) : isLocked ? (
                        "Locked"
                      ) : (
                        "Open"
                      )}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 bottom-0 h-[2px] origin-left bg-green transition-transform duration-[var(--duration-base)] ease-[var(--ease-ledger)] ${
                      isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="h-[3px] bg-rule/60" aria-hidden>
          <motion.div
            className="h-full bg-green"
            initial={false}
            animate={{ width: `${(step / steps.length) * 100}%` }}
            transition={reduceMotion ? { duration: 0 } : spring.rail}
          />
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`mono-label flex min-h-[1.75rem] items-center gap-1.5 pt-2 leading-relaxed ${
            activeHint ? "text-coral-ink" : "text-ink-faint"
          }`}
        >
          {activeHint && <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-coral" />}
          {activeHint}
        </p>
      </nav>
    </div>
  );
}
