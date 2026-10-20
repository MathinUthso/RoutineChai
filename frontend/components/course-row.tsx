"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Course } from "@/lib/types";
import { CheckIcon, PlusIcon } from "./icons";

type CourseRowProps = {
  course: Course;
  selected: boolean;
  onToggle: (code: string) => void;
};

export function CourseRow({ course, selected, onToggle }: CourseRowProps) {
  const reduceMotion = useReducedMotion();
  const sectionLabel = course.sections.length === 1 ? "section" : "sections";
  const isLab = course.kind === "lab";
  const conditional = course.sections.filter((section) => section.if_required).length;

  return (
    <li className="relative">
      {selected && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] bg-coral"
          initial={reduceMotion ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
          style={{ originY: 0 }}
        />
      )}

      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle(course.code)}
        className={`group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5 text-left transition-colors duration-[var(--duration-quick)] focus-visible:-outline-offset-2 sm:grid-cols-[4.75rem_minmax(0,1fr)_auto] sm:gap-x-5 ${
          selected ? "bg-paper" : "hover:bg-paper/55"
        }`}
      >
        <span
          className={`font-mono text-[0.8125rem] font-medium tracking-[0.02em] tabular transition-colors ${
            selected ? "text-green" : "text-ink"
          }`}
        >
          {course.code}
        </span>

        <span className="col-span-2 row-start-2 mt-0.5 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-1 sm:mt-0">
          <span className="text-[0.9375rem] leading-snug text-ink">{course.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="mono-label text-ink-faint">{course.programs.join(" · ")}</span>
            <span aria-hidden className="text-ink-faint/60">
              /
            </span>
            <span className="mono-label text-ink-faint tabular">
              {course.sections.length} {sectionLabel}
            </span>
            {isLab && (
              <span className="mono-label border border-coral/45 px-1 py-px text-coral-ink">
                Lab
              </span>
            )}
            {conditional > 0 && (
              <span className="mono-label text-coral-ink">
                {conditional} conditional
              </span>
            )}
          </span>
        </span>

        <span className="col-start-2 row-start-1 flex items-center gap-3 self-center sm:col-start-3 sm:row-start-1">
          <span className="flex items-baseline gap-1">
            <span
              className={`font-mono text-[0.9375rem] tabular ${selected ? "text-green" : "text-ink-soft"}`}
            >
              {course.credits.toFixed(1)}
            </span>
            <span className="mono-label text-ink-faint sm:hidden">cr</span>
          </span>
          <span
            aria-hidden
            className={`grid h-5 w-5 place-items-center border transition-colors duration-[var(--duration-quick)] ${
              selected
                ? "border-green bg-green text-paper"
                : "border-rule-strong text-ink-faint group-hover:border-green group-hover:text-green"
            }`}
          >
            {selected ? <CheckIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
          </span>
        </span>
      </button>
    </li>
  );
}
