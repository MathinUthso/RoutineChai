"use client";

import { useState } from "react";
import { emptyPreference } from "@/lib/schedule";
import type { Course, CoursePreference, Faculty } from "@/lib/types";
import { Chip } from "./chip";

type SectionPreferencesProps = {
  courses: Course[];
  value: Record<string, CoursePreference>;
  onChange: (code: string, next: CoursePreference) => void;
};

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      className={`shrink-0 text-ink-faint transition-transform duration-[var(--duration-quick)] ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M4 6.5L8 10l4-3.5" />
    </svg>
  );
}

function uniqueFaculty(course: Course): Faculty[] {
  const seen = new Map<string, Faculty>();
  for (const section of course.sections) {
    if (!seen.has(section.faculty.name)) seen.set(section.faculty.name, section.faculty);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function overrideCount(preference: CoursePreference | undefined) {
  if (!preference) return 0;
  return (
    preference.allowed_sections.length +
    preference.preferred_faculty.length +
    preference.excluded_faculty.length
  );
}

function panelIdFor(code: string) {
  return `prefs-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function SectionPreferences({ courses, value, onChange }: SectionPreferencesProps) {
  const [openCode, setOpenCode] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="section-preferences-title"
      className="border border-rule bg-paper-raised shadow-sheet"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
        <h3 id="section-preferences-title" className="mono-label text-ink">
          Section preferences
        </h3>
        <p className="mono-label tabular text-ink-faint">
          {courses.length} {courses.length === 1 ? "course" : "courses"} · auto by default
        </p>
      </div>

      <p className="max-w-[68ch] px-4 pt-3.5 text-[0.8125rem] leading-relaxed text-ink-soft">
        Auto uses every standard section. Pin sections or set faculty preferences per course.
        Excluded faculty are removed before the solver runs.
      </p>

      {courses.length === 0 ? (
        <div className="mx-4 my-4 border border-dashed border-rule-strong/70 px-3.5 py-5">
          <p className="text-[0.875rem] text-ink">No courses on the docket.</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">
            Go back to Step 01 and add at least one course before setting section preferences.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {courses.map((course) => {
            const preference = value[course.code] ?? emptyPreference();
            const count = overrideCount(preference);
            const open = openCode === course.code;
            const panelId = panelIdFor(course.code);
            const sortedSections = [...course.sections].sort((a, b) =>
              a.name.localeCompare(b.name, "en", { numeric: true }),
            );
            const faculty = uniqueFaculty(course);
            const conditional = course.sections.filter((section) => section.if_required).length;

            const toggleSection = (name: string) => {
              const pinned = preference.allowed_sections.includes(name);
              const section = sortedSections.find((item) => item.name === name);
              onChange(course.code, {
                ...preference,
                allowed_sections: pinned
                  ? preference.allowed_sections.filter((item) => item !== name)
                  : [...preference.allowed_sections, name],
                excluded_faculty:
                  !pinned && section
                    ? preference.excluded_faculty.filter(
                        (item) => item !== section.faculty.name,
                      )
                    : preference.excluded_faculty,
              });
            };

            const togglePreferredFaculty = (name: string) => {
              const preferred = preference.preferred_faculty.includes(name);
              onChange(course.code, {
                ...preference,
                preferred_faculty: preferred
                  ? preference.preferred_faculty.filter((item) => item !== name)
                  : [...preference.preferred_faculty, name],
                excluded_faculty: preference.excluded_faculty.filter((item) => item !== name),
              });
            };

            const toggleExcludedFaculty = (name: string) => {
              const excluded = preference.excluded_faculty.includes(name);
              const sectionsTaught = new Set(
                course.sections
                  .filter((section) => section.faculty.name === name)
                  .map((section) => section.name),
              );
              onChange(course.code, {
                ...preference,
                excluded_faculty: excluded
                  ? preference.excluded_faculty.filter((item) => item !== name)
                  : [...preference.excluded_faculty, name],
                preferred_faculty: preference.preferred_faculty.filter((item) => item !== name),
                allowed_sections: excluded
                  ? preference.allowed_sections
                  : preference.allowed_sections.filter((item) => !sectionsTaught.has(item)),
              });
            };

            return (
              <li key={course.code}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  onClick={() => setOpenCode(open ? null : course.code)}
                  className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors duration-[var(--duration-quick)] hover:bg-paper/70"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-[0.75rem] font-medium text-ink">
                        {course.code}
                      </span>
                      <span className="truncate text-[0.875rem] leading-snug text-ink-soft">
                        {course.title}
                      </span>
                    </span>
                    <span className="mono-label mt-1 block text-ink-faint tabular">
                      {course.sections.length} {course.sections.length === 1 ? "section" : "sections"}
                      {conditional > 0 ? ` · ${conditional} conditional` : ""}
                    </span>
                  </span>
                  <span
                    className={`mono-label tabular ${count > 0 ? "text-coral-ink" : "text-ink-faint"}`}
                  >
                    {count === 0 ? "Auto" : `${count} override${count === 1 ? "" : "s"}`}
                  </span>
                  <DisclosureChevron open={open} />
                </button>

                {open && (
                  <div id={panelId} className="border-t border-rule/80 bg-paper/45 px-4 py-4">
                    <fieldset>
                      <legend className="mono-label text-ink">Section pins</legend>
                      <p className="mt-1.5 max-w-[58ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                        Pin any section to restrict the solver to it. Conditional sections — marked
                        cond. — are only eligible when explicitly pinned.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {sortedSections.map((section) => (
                          <Chip
                            key={section.name}
                            pressed={preference.allowed_sections.includes(section.name)}
                            label={`Section ${section.name}${
                              section.if_required ? ", conditional" : ""
                            }`}
                            title={
                              section.if_required
                                ? "Conditional section — eligible only when pinned"
                                : "Standard section"
                            }
                            onClick={() => toggleSection(section.name)}
                          >
                            <span className="tabular">{section.name}</span>
                            {section.if_required && (
                              <span className="border-l border-current/35 pl-1.5 text-[9px] tracking-[0.08em] opacity-80">
                                cond.
                              </span>
                            )}
                          </Chip>
                        ))}
                      </div>
                    </fieldset>

                    <div className="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2">
                      <fieldset>
                        <legend className="mono-label text-ink">Preferred faculty</legend>
                        <p className="mt-1.5 max-w-[42ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                          Ranking bonus. Other sections stay eligible.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {faculty.map((person) => (
                            <Chip
                              key={person.name}
                              pressed={preference.preferred_faculty.includes(person.name)}
                              label={`Prefer ${person.name}`}
                              title={person.name}
                              onClick={() => togglePreferredFaculty(person.name)}
                            >
                              {person.initials && (
                                <span className="tracking-[0.04em]">{person.initials}</span>
                              )}
                              <span className="max-w-[9.5rem] truncate normal-case tracking-[0.01em]">
                                {person.name}
                              </span>
                            </Chip>
                          ))}
                        </div>
                      </fieldset>

                      <fieldset className="border-t border-rule pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                        <legend className="mono-label text-coral-ink">Not preferred faculty</legend>
                        <p className="mt-1.5 max-w-[42ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                          Hard filter. Matching sections are removed.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {faculty.map((person) => (
                            <Chip
                              key={person.name}
                              pressed={preference.excluded_faculty.includes(person.name)}
                              label={`Exclude ${person.name}`}
                              title={person.name}
                              tone="coral"
                              mark="cross"
                              onClick={() => toggleExcludedFaculty(person.name)}
                            >
                              {person.initials && (
                                <span className="tracking-[0.04em]">{person.initials}</span>
                              )}
                              <span className="max-w-[9.5rem] truncate normal-case tracking-[0.01em]">
                                {person.name}
                              </span>
                            </Chip>
                          ))}
                        </div>
                      </fieldset>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                      <p className="mono-label leading-relaxed text-ink-faint">
                        {count === 0
                          ? "Every standard section eligible"
                          : `${preference.allowed_sections.length} pinned · ${preference.preferred_faculty.length} preferred · ${preference.excluded_faculty.length} excluded`}
                      </p>
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => onChange(course.code, emptyPreference())}
                        className="mono-label inline-flex min-h-11 items-center border border-rule-strong px-3 text-ink transition-colors hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint"
                      >
                        Reset to Auto
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
