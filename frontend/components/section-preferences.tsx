"use client";

import { useState } from "react";
import {
  DAYS,
  DAY_NAMES,
  emptyManualProject,
  emptyPreference,
  formatMeeting,
  formatTimeRange,
  isProjectCourse,
} from "@/lib/schedule";
import type { Course, CoursePreference, Faculty, Section } from "@/lib/types";
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

function sectionSlots(section: Section) {
  if (section.meetings.length === 0) return "No meeting time listed";
  return section.meetings
    .map((meeting) => `${meeting.day} ${formatTimeRange(meeting.start, meeting.end)}`)
    .join(" · ");
}

function sectionNamesLabel(names: string[]) {
  if (names.length === 0) return "Section TBA";
  return `${names.length === 1 ? "Section" : "Sections"} ${names.join(", ")}`;
}

function overrideCount(preference: CoursePreference | undefined) {
  if (!preference) return 0;
  return (
    preference.allowed_sections.length +
    preference.excluded_sections.length +
    preference.preferred_faculty.length +
    preference.excluded_faculty.length +
    (preference.manual_project ? 1 : 0)
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
          <p className="text-[0.875rem] text-ink">No courses selected yet.</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">
            Add at least one course before setting section preferences.
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
            const sectionsFor = (name: string) =>
              sortedSections
                .filter((section) => section.faculty.name === name)
                .map((section) => section.name);
            const faculty = uniqueFaculty(course);
            const conditional = course.sections.filter((section) => section.if_required).length;
            const projectCourse = isProjectCourse(course);
            const manualProject = preference.manual_project;
            const manualActive = Boolean(manualProject);
            const manualId = `manual-${panelId}`;

            const toggleManualProject = () => {
              onChange(course.code, {
                ...preference,
                manual_project: manualActive ? null : emptyManualProject(),
              });
            };

            const updateManualProject = (
              patch: Partial<NonNullable<CoursePreference["manual_project"]>>,
            ) => {
              if (!manualProject) return;
              onChange(course.code, {
                ...preference,
                manual_project: { ...manualProject, ...patch },
              });
            };

            const toggleSection = (name: string) => {
              const pinned = preference.allowed_sections.includes(name);
              const section = sortedSections.find((item) => item.name === name);
              onChange(course.code, {
                ...preference,
                allowed_sections: pinned
                  ? preference.allowed_sections.filter((item) => item !== name)
                  : [...preference.allowed_sections, name],
                excluded_sections: pinned
                  ? preference.excluded_sections
                  : preference.excluded_sections.filter((item) => item !== name),
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
                    {manualActive
                      ? "Manual"
                      : count === 0
                        ? "Auto"
                        : `${count} override${count === 1 ? "" : "s"}`}
                  </span>
                  <DisclosureChevron open={open} />
                </button>

                {open && (
                  <div id={panelId} className="border-t border-rule/80 bg-paper/45 px-4 py-4">
                    {projectCourse && (
                      <fieldset
                        aria-describedby={manualProject ? manualId : undefined}
                        className="border border-rule bg-paper-raised px-3.5 py-3"
                      >
                        <legend className="mono-label text-ink">Project slot</legend>
                        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
                          <p className="max-w-[54ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                            Enter the section and weekly meeting assigned by your project
                            supervisor. This replaces the catalog sections for this course and is
                            checked for clashes.
                          </p>
                          <button
                            type="button"
                            onClick={toggleManualProject}
                            className="mono-label inline-flex min-h-9 items-center border border-rule-strong px-2.5 text-ink transition-colors hover:border-ink hover:bg-paper"
                          >
                            {manualActive ? "Use catalog sections" : "Enter manually"}
                          </button>
                        </div>

                        {manualProject && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                            <label className="block">
                              <span className="mono-label text-ink-faint">Section</span>
                              <input
                                type="text"
                                value={manualProject.section}
                                onChange={(event) =>
                                  updateManualProject({ section: event.target.value })
                                }
                                placeholder="e.g. A"
                                maxLength={16}
                                autoComplete="off"
                                className="mt-1.5 h-10 w-full border border-rule bg-paper px-2.5 text-[0.875rem] text-ink outline-none transition-colors focus:border-ink"
                              />
                            </label>
                            <label className="block">
                              <span className="mono-label text-ink-faint">Day</span>
                              <select
                                value={manualProject.day}
                                onChange={(event) =>
                                  updateManualProject({
                                    day: event.target.value as NonNullable<
                                      CoursePreference["manual_project"]
                                    >["day"],
                                  })
                                }
                                className="mt-1.5 h-10 w-full border border-rule bg-paper px-2 text-[0.875rem] text-ink outline-none transition-colors focus:border-ink"
                              >
                                {DAYS.map((day) => (
                                  <option key={day} value={day}>
                                    {DAY_NAMES[day]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="mono-label text-ink-faint">Start</span>
                              <input
                                type="time"
                                value={manualProject.start}
                                onChange={(event) =>
                                  updateManualProject({ start: event.target.value })
                                }
                                step={300}
                                className="mt-1.5 h-10 w-full border border-rule bg-paper px-2 font-mono text-[0.8125rem] tabular text-ink outline-none transition-colors focus:border-ink"
                              />
                            </label>
                            <label className="block">
                              <span className="mono-label text-ink-faint">End</span>
                              <input
                                type="time"
                                value={manualProject.end}
                                onChange={(event) =>
                                  updateManualProject({ end: event.target.value })
                                }
                                step={300}
                                className="mt-1.5 h-10 w-full border border-rule bg-paper px-2 font-mono text-[0.8125rem] tabular text-ink outline-none transition-colors focus:border-ink"
                              />
                            </label>
                          </div>
                        )}

                        {manualProject && (
                          <p id={manualId} className="mono-label mt-2.5 leading-relaxed text-ink-faint">
                            {DAY_NAMES[manualProject.day]} ·{" "}
                            {formatTimeRange(manualProject.start, manualProject.end)} · room TBA.
                            Faculty exclusions still apply when the section matches a catalog
                            section.
                          </p>
                        )}
                      </fieldset>
                    )}

                    {!manualActive && (
                      <fieldset className={projectCourse ? "mt-4" : undefined}>
                        <legend className="mono-label text-ink">Section pins</legend>
                        <p className="mt-1.5 max-w-[58ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                          Pin any section to restrict the solver to it. Conditional sections — marked
                          cond. — are only eligible when explicitly pinned. Sections you mark as
                          full on the timetable tab are listed here so you can restore them.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {sortedSections.map((section) => (
                            <Chip
                              key={section.name}
                              pressed={preference.allowed_sections.includes(section.name)}
                              label={`Section ${section.name}${
                                section.if_required ? ", conditional" : ""
                              }. ${sectionSlots(section)}.`}
                              title={`${section.meetings.map(formatMeeting).join(" · ") || "No meeting time listed"}${
                                section.if_required ? " · Conditional section" : ""
                              }`}
                              onClick={() => toggleSection(section.name)}
                            >
                              <span className="flex min-w-0 flex-col items-start gap-1 text-left">
                                <span className="flex flex-wrap items-baseline gap-x-1.5">
                                  <span className="tabular">{section.name}</span>
                                  {section.if_required && (
                                    <span className="border-l border-current/35 pl-1.5 text-[9px] tracking-[0.08em] opacity-80">
                                      cond.
                                    </span>
                                  )}
                                </span>
                                <span className="max-w-[20rem] whitespace-normal text-[9.5px] normal-case leading-snug tracking-[0.01em] opacity-80">
                                  {sectionSlots(section)}
                                </span>
                              </span>
                            </Chip>
                          ))}
                        </div>

                        {preference.excluded_sections.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                            <span className="mono-label text-coral-ink">Marked full</span>
                            {preference.excluded_sections.map((name) => (
                              <button
                                key={name}
                                type="button"
                                aria-label={`Restore section ${name} for ${course.code}`}
                                onClick={() =>
                                  onChange(course.code, {
                                    ...preference,
                                    excluded_sections: preference.excluded_sections.filter(
                                      (item) => item !== name,
                                    ),
                                  })
                                }
                                className="press inline-flex min-h-9 items-center gap-1.5 border border-coral/50 bg-coral-tint/40 px-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-coral-ink hover:border-coral hover:bg-coral-tint/70"
                              >
                                <span className="line-through">{name}</span>
                                <span>restore</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    )}

                    <div
                      className={`mt-5 grid gap-x-6 gap-y-5 ${
                        manualActive ? "" : "md:grid-cols-2"
                      }`}
                    >
                      {!manualActive && (
                        <fieldset>
                          <legend className="mono-label text-ink">Preferred faculty</legend>
                          <p className="mt-1.5 max-w-[42ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                            Ranking bonus. Other sections stay eligible.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {faculty.map((person) => {
                              const sectionLabel = sectionNamesLabel(sectionsFor(person.name));
                              return (
                                <Chip
                                  key={person.name}
                                  pressed={preference.preferred_faculty.includes(person.name)}
                                  label={`Prefer ${person.name}. ${sectionLabel}.`}
                                  title={`${person.name} · ${sectionLabel}`}
                                  onClick={() => togglePreferredFaculty(person.name)}
                                >
                                  <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                                    <span className="flex max-w-[13rem] items-baseline gap-1.5">
                                      {person.initials && (
                                        <span className="shrink-0 tracking-[0.04em]">
                                          {person.initials}
                                        </span>
                                      )}
                                      <span className="truncate normal-case tracking-[0.01em]">
                                        {person.name}
                                      </span>
                                    </span>
                                    <span className="max-w-[13rem] truncate text-[9px] normal-case tracking-[0.04em] opacity-75">
                                      {sectionLabel}
                                    </span>
                                  </span>
                                </Chip>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}

                      <fieldset
                        className={
                          manualActive
                            ? "border-t border-rule pt-5"
                            : "border-t border-rule pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0"
                        }
                      >
                        <legend className="mono-label text-coral-ink">Not preferred faculty</legend>
                        <p className="mt-1.5 max-w-[42ch] text-[0.8125rem] leading-relaxed text-ink-faint">
                          Hard filter. Matching sections are removed.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {faculty.map((person) => {
                            const sectionLabel = sectionNamesLabel(sectionsFor(person.name));
                            return (
                              <Chip
                                key={person.name}
                                pressed={preference.excluded_faculty.includes(person.name)}
                                label={`Exclude ${person.name}. ${sectionLabel}.`}
                                title={`${person.name} · ${sectionLabel}`}
                                tone="coral"
                                mark="cross"
                                onClick={() => toggleExcludedFaculty(person.name)}
                              >
                                <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                                  <span className="flex max-w-[13rem] items-baseline gap-1.5">
                                    {person.initials && (
                                      <span className="shrink-0 tracking-[0.04em]">
                                        {person.initials}
                                      </span>
                                    )}
                                    <span className="truncate normal-case tracking-[0.01em]">
                                      {person.name}
                                    </span>
                                  </span>
                                  <span className="max-w-[13rem] truncate text-[9px] normal-case tracking-[0.04em] opacity-75">
                                    {sectionLabel}
                                  </span>
                                </span>
                              </Chip>
                            );
                          })}
                        </div>
                      </fieldset>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                      <p className="mono-label leading-relaxed text-ink-faint">
                        {manualActive
                          ? `Manual project slot · ${preference.excluded_faculty.length} excluded`
                          : count === 0
                            ? "Every standard section eligible"
                            : `${preference.allowed_sections.length} pinned · ${preference.excluded_sections.length} full · ${preference.preferred_faculty.length} preferred · ${preference.excluded_faculty.length} excluded`}
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
