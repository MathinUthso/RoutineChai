"use client";

import { useEffect } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { Course } from "@/lib/types";
import { spring } from "@/lib/motion";
import { ArrowRightIcon, CloseIcon } from "./icons";

const BAND_MIN = 12;
const BAND_MAX = 18;

type DocketProps = {
  selected: Course[];
  catalogSize: number;
  busy: boolean;
  onRemove: (code: string) => void;
  onClear: () => void;
  onReview: () => void;
};

function bandFor(total: number) {
  if (total === 0) {
    return { label: "No credit load yet", tone: "text-ink-faint", dot: "bg-rule-strong" };
  }
  if (total < BAND_MIN) {
    return {
      label: `Part-time · ${(BAND_MIN - total).toFixed(1)} below 12.0`,
      tone: "text-ink-soft",
      dot: "bg-coral",
    };
  }
  if (total <= BAND_MAX) {
    return {
      label: "Full-time band · 12.0 to 18.0 credits",
      tone: "text-green",
      dot: "bg-green",
    };
  }
  return {
    label: `Overload · ${(total - BAND_MAX).toFixed(1)} over 18.0, approval required`,
    tone: "text-coral-ink",
    dot: "bg-coral",
  };
}

export function Docket({ selected, catalogSize, busy, onRemove, onClear, onReview }: DocketProps) {
  const reduceMotion = useReducedMotion();
  const totalCredits = selected.reduce((sum, course) => sum + course.credits, 0);
  const sectionCount = selected.reduce((sum, course) => sum + course.sections.length, 0);
  const labCount = selected.filter((course) => course.kind === "lab").length;
  const band = bandFor(totalCredits);
  const fill = `${Math.min(totalCredits, BAND_MAX) / BAND_MAX * 100}%`;
  const empty = selected.length === 0;

  const creditValue = useMotionValue(totalCredits);
  const creditLabel = useTransform(creditValue, (value) => value.toFixed(1));

  useEffect(() => {
    if (reduceMotion) {
      creditValue.set(totalCredits);
      return;
    }
    const controls = animate(creditValue, totalCredits, {
      type: "spring",
      stiffness: 280,
      damping: 32,
      mass: 0.8,
    });
    return () => controls.stop();
  }, [creditValue, reduceMotion, totalCredits]);

  return (
    <aside aria-labelledby="docket-title" className="lg:sticky lg:top-6 lg:self-start">
      <div className="border border-rule bg-paper-raised shadow-sheet">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
          <h2 id="docket-title" className="mono-label text-ink">
            Selected courses
          </h2>
          <div className="flex items-baseline gap-3">
            <span className="mono-label tabular text-ink-faint">
              {String(selected.length).padStart(2, "0")} / {String(catalogSize).padStart(2, "0")}
            </span>
            {!empty && (
              <button
                type="button"
                onClick={onClear}
                className="cue-underline mono-label text-ink-faint hover:text-coral-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pt-4 pb-5">
          <AnimatePresence initial={false} mode="popLayout">
            {empty ? (
              <motion.div
                key="empty"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
                className="border border-dashed border-rule-strong/70 px-3.5 py-5"
              >
                <p className="text-[0.875rem] text-ink">No courses selected yet.</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">
                  Pick a course and it lands here, with credits and lab sections tallied.
                </p>
              </motion.div>
            ) : (
              <motion.ul
                key="chips"
                layout={!reduceMotion}
                className="flex flex-wrap gap-1.5"
                aria-label="Selected courses"
              >
                <AnimatePresence initial={false}>
                  {selected.map((course) => (
                    <motion.li
                      key={course.code}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                      transition={reduceMotion ? { duration: 0 } : spring.select}
                      className="flex items-stretch border border-rule bg-paper"
                    >
                      <span className="flex items-center gap-2 py-1 pl-2">
                        <span className="font-mono text-[0.75rem] font-medium text-ink">
                          {course.code}
                        </span>
                        <span className="font-mono text-[10px] tabular text-ink-faint">
                          {course.credits.toFixed(1)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(course.code)}
                        aria-label={`Remove ${course.code}, ${course.title}`}
                        className="press grid w-7 place-items-center self-stretch border-l border-rule text-ink-faint hover:bg-coral-tint hover:text-coral-ink"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>

          <dl className="mt-4 grid grid-cols-3 divide-x divide-rule border-y border-rule">
            <div className="py-3 pr-2">
              <dt className="mono-label text-ink-faint">Credits</dt>
              <dd className="mt-1.5 flex items-baseline gap-1">
                <motion.span className="font-mono text-figure leading-none tabular text-ink">
                  {creditLabel}
                </motion.span>
              </dd>
            </div>
            <div className="px-3 py-3">
              <dt className="mono-label text-ink-faint">Labs</dt>
              <dd className="mt-1.5 font-mono text-figure leading-none tabular text-ink">
                <motion.span
                  key={labCount}
                  initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : spring.select}
                  className="inline-block"
                >
                  {String(labCount).padStart(2, "0")}
                </motion.span>
              </dd>
            </div>
            <div className="py-3 pl-3">
              <dt className="mono-label text-ink-faint">Sections</dt>
              <dd className="mt-1.5 font-mono text-figure leading-none tabular text-ink">
                <motion.span
                  key={sectionCount}
                  initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : spring.select}
                  className="inline-block"
                >
                  {String(sectionCount).padStart(2, "0")}
                </motion.span>
              </dd>
            </div>
          </dl>

          <div className="mt-3.5">
            <div aria-hidden className="relative h-[6px] overflow-hidden bg-paper-sunk">
              <div className="absolute inset-y-0 left-0 right-0 bg-green-tint" />
              <motion.div
                className={`absolute inset-y-0 left-0 ${totalCredits > BAND_MAX ? "bg-coral" : "bg-green"}`}
                initial={false}
                animate={{ width: fill }}
                transition={reduceMotion ? { duration: 0 } : spring.layout}
              />
            </div>
            <div className="mono-label mt-1.5 flex justify-between text-ink-faint tabular">
              <span>0.0</span>
              <span className="text-green">12.0 min</span>
              <span>18.0</span>
            </div>
            <p className={`mono-label mt-2 flex items-start gap-2 leading-relaxed ${band.tone}`}>
              <span aria-hidden className={`mt-[3px] h-1.5 w-1.5 shrink-0 ${band.dot}`} />
              {band.label}
            </p>
          </div>

          <button
            type="button"
            onClick={onReview}
            disabled={empty || busy}
            className="group press mt-4 flex w-full items-center justify-between gap-3 bg-green px-4 py-3 text-paper hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-coral disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:text-ink-faint"
          >
            <span className="text-[0.9375rem] font-medium">Set constraints</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-[var(--duration-quick)] group-enabled:group-hover:translate-x-0.5" />
          </button>
          <p className="mono-label mt-2 min-h-[1.1rem] leading-relaxed text-ink-faint">
            {empty ? "Select at least one course to continue" : "Next: confirm courses, then constraints"}
          </p>
        </div>
      </div>
    </aside>
  );
}
