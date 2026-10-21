"use client";

import { useEffect, useId, useRef } from "react";
import type { Course, Program } from "@/lib/types";
import { formatProgramList } from "@/lib/schedule";
import { CourseRow } from "./course-row";
import { ProgramToggle } from "./program-toggle";
import { AlertIcon, SearchIcon } from "./icons";

type CoursePickerProps = {
  status: "loading" | "error" | "ready";
  errorMessage?: string;
  courses: Course[];
  totalCourses: number;
  query: string;
  values: Program[];
  programs: Program[];
  counts: Record<string, number>;
  selectedCodes: Set<string>;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  onQueryChange: (query: string) => void;
  onProgramChange: (values: Program[]) => void;
  onToggle: (code: string) => void;
  onRetry: () => void;
};

export function CoursePicker({
  status,
  errorMessage,
  courses,
  totalCourses,
  query,
  values,
  programs,
  counts,
  selectedCodes,
  headingRef,
  onQueryChange,
  onProgramChange,
  onToggle,
  onRetry,
}: CoursePickerProps) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const programLabel = formatProgramList(programs);

  return (
    <section aria-labelledby="picker-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="mono-label text-ink-faint">Step 01</p>
          <h2
            id="picker-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1.5 text-title font-medium tracking-[-0.015em] focus:outline-none"
          >
            Select courses
          </h2>
        </div>
        <p className="mono-label tabular text-ink-faint">
          {status === "ready" ? `${courses.length} of ${totalCourses} shown` : "Reading catalog"}
        </p>
      </div>

      <p className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-soft">
        Courses use the sections listed in the official Fall 2026 routine. More sections give the
        solver more room to avoid clashes; section and faculty preferences come after this.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-[22rem]">
          <label htmlFor={searchId} className="mono-label mb-2 block text-ink-faint">
            Search
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  onQueryChange("");
                }
              }}
              placeholder="Code, title, or faculty…"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full border border-rule bg-paper-raised pl-9 pr-12 text-[0.9375rem] text-ink transition-colors duration-[var(--duration-quick)] placeholder:text-ink-faint hover:border-rule-strong focus:border-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
            />
            <kbd
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 border border-rule px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-faint sm:block"
            >
              /
            </kbd>
          </div>
        </div>

        <ProgramToggle
          values={values}
          programs={programs}
          counts={counts}
          disabled={status !== "ready"}
          onChange={onProgramChange}
        />
      </div>

      <div className="mt-6 border border-rule bg-paper-raised shadow-sheet">
        <div className="hidden border-b border-rule px-4 py-2 sm:grid sm:grid-cols-[4.75rem_minmax(0,1fr)_auto] sm:gap-x-5">
          <span className="mono-label text-ink-faint">Code</span>
          <span className="mono-label text-ink-faint">Course</span>
          <span className="mono-label flex items-center gap-3 text-ink-faint">
            <span>Cr.</span>
            <span className="w-5" aria-hidden />
          </span>
        </div>

        {status === "loading" && (
          <div aria-busy="true" aria-live="polite" className="divide-y divide-rule">
            <span className="sr-only">Loading the Fall 2026 catalog</span>
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-4 sm:grid-cols-[4.75rem_minmax(0,1fr)_auto] sm:gap-x-5"
              >
                <span className="h-2.5 w-16 bg-paper-sunk" />
                <span className="col-span-2 mt-2 space-y-2 sm:col-span-1 sm:mt-0">
                  <span className="block h-2.5 w-3/4 bg-paper-sunk" />
                  <span className="block h-2 w-1/3 bg-paper-sunk/70" />
                </span>
                <span className="h-2.5 w-6 justify-self-end bg-paper-sunk" />
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3 px-5 py-8 sm:flex-row sm:items-start sm:gap-4">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-coral-ink" />
            <div>
              <h3 className="text-[0.9375rem] font-medium text-ink">The catalog didn&rsquo;t load</h3>
              <p className="mt-1 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink-soft">
                {errorMessage ?? "The course catalog didn't load. Check the API base URL and try again."}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="press mono-label mt-3 border border-ink px-3 py-1.5 text-ink hover:bg-ink hover:text-paper"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {status === "ready" && courses.length > 0 && (
          <ul className="divide-y divide-rule">
            {courses.map((course) => (
              <CourseRow
                key={course.code}
                course={course}
                selected={selectedCodes.has(course.code)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}

        {status === "ready" && courses.length === 0 && (
          <div className="px-5 py-10">
            <p className="text-[0.9375rem] text-ink">
              No course matches{" "}
              <span className="font-mono text-[0.875rem] text-ink">{query ? `“${query}”` : programLabel}</span>.
            </p>
            <p className="mt-1.5 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink-soft">
              {query
                ? `Search covers titles, codes, and faculty names. ${totalCourses} courses available.`
                : `No course is offered to ${programLabel} in this catalog.`}
            </p>
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="press mono-label mt-4 border border-ink px-3 py-1.5 text-ink hover:bg-ink hover:text-paper"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mono-label mt-3 text-ink-faint">
        Section counts cover the full Fall 2026 catalog
      </p>
    </section>
  );
}
