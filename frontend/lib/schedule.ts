import type {
  Constraints,
  Course,
  CoursePreference,
  Day,
  ManualProject,
  Meeting,
  TimePreference,
} from "./types";

/** Registrar week: Saturday through Wednesday only. */
export const DAYS: Day[] = ["Sat", "Sun", "Mon", "Tue", "Wed"];

/** Courses whose section and weekly slot may be supplied by the student. */
export const PROJECT_COURSE_CODES = new Set(["CSE 4000A", "DS 4000A"]);

export function isProjectCourse(course: Course): boolean {
  return PROJECT_COURSE_CODES.has(course.code);
}

export function emptyManualProject(): ManualProject {
  return { section: "", day: "Sat", start: "09:00", end: "11:00" };
}

export const DAY_NAMES: Record<Day, string> = {
  Sat: "Saturday",
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
};

export const MAX_SESSIONS_OPTIONS = [1, 2, 3, 4] as const;

export const TIME_PREFERENCE_LABELS: Record<TimePreference, string> = {
  morning: "Mornings",
  afternoon: "Afternoons",
  any: "Any time",
};

export const TIME_PREFERENCE_HINTS: Record<TimePreference, string> = {
  morning: "Ranks sections inside 08:30–12:30.",
  afternoon: "Ranks sections inside 12:30–16:30.",
  any: "No time of day preference.",
};

export type ConstraintIssue = {
  field: "allowedDays" | "blocked";
  /** Index of the blocked window, when the issue belongs to one. */
  index?: number;
  message: string;
};

export function defaultConstraints(): Constraints {
  return {
    blocked: [],
    max_sessions_per_day: 3,
    allowed_days: [...DAYS],
    time_preference: "any",
    preferred_off_days: [],
  };
}

export function emptyPreference(): CoursePreference {
  return {
    allowed_sections: [],
    preferred_faculty: [],
    excluded_faculty: [],
    manual_project: null,
  };
}

/** Returns minutes since midnight for "HH:MM", or null when unparseable. */
export function minutesOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** 12-hour clock label, e.g. "2:00 PM" or "11:10 AM". */
export function formatTime(value: string): string {
  const minutes = minutesOfDay(value);
  if (minutes === null) return value;
  return formatClockLabel(minutes);
}

/** 12-hour clock label from minutes since midnight; suffix can be hidden on axes. */
export function formatClockLabel(minutes: number, includeSuffix = true): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const label = `${hours % 12 || 12}:${String(mins).padStart(2, "0")}`;
  return includeSuffix ? `${label} ${suffix}` : label;
}

/** Compact range, e.g. "2:00–4:30 PM" or "11:10 AM–1:40 PM". */
export function formatTimeRange(start: string, end: string): string {
  const startLabel = formatTime(start);
  const endLabel = formatTime(end);
  const startSuffix = startLabel.slice(-2);
  const endSuffix = endLabel.slice(-2);

  if (startSuffix === endSuffix) {
    return `${startLabel.slice(0, -3)}–${endLabel}`;
  }
  return `${startLabel}–${endLabel}`;
}

export function sortDays(days: Day[]): Day[] {
  return [...days].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
}

export function formatDayList(days: Day[]): string {
  return sortDays(days).join(", ");
}

export function formatGap(minutes: number): string {
  if (minutes <= 0) return "no gaps";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort(
    (a, b) =>
      DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
      (minutesOfDay(a.start) ?? 0) - (minutesOfDay(b.start) ?? 0),
  );
}

export function formatMeeting(meeting: Meeting): string {
  return `${meeting.day} ${formatTimeRange(meeting.start, meeting.end)} · ${meeting.room}`;
}

export function validateConstraints(constraints: Constraints): ConstraintIssue[] {
  const issues: ConstraintIssue[] = [];

  if (constraints.allowed_days.length === 0) {
    issues.push({
      field: "allowedDays",
      message: "Choose at least one teaching day.",
    });
  }

  constraints.blocked.forEach((window, index) => {
    const start = minutesOfDay(window.start);
    const end = minutesOfDay(window.end);

    if (start === null || end === null) {
      issues.push({
        field: "blocked",
        index,
        message: "Enter a start and end time.",
      });
      return;
    }

    if (start >= end) {
      issues.push({
        field: "blocked",
        index,
        message: "The end time must be after the start time.",
      });
    }
  });

  return issues;
}

export type PreferenceIssue = {
  code: string;
  message: string;
};

/**
 * A manual project slot replaces the catalog sections, so it must carry a
 * label and a well-formed weekly meeting before the solver can use it.
 */
export function validateManualProjects(
  courses: Course[],
  preferences: Record<string, CoursePreference>,
): PreferenceIssue[] {
  const issues: PreferenceIssue[] = [];

  for (const course of courses) {
    const manual = preferences[course.code]?.manual_project;
    if (!manual) continue;

    if (!isProjectCourse(course)) {
      issues.push({
        code: course.code,
        message: "Manual slots are only available for project courses.",
      });
      continue;
    }

    if (!manual.section.trim()) {
      issues.push({ code: course.code, message: "Enter the project section." });
    }

    const start = minutesOfDay(manual.start);
    const end = minutesOfDay(manual.end);
    if (start === null || end === null) {
      issues.push({ code: course.code, message: "Enter a start and end time." });
    } else if (start >= end) {
      issues.push({ code: course.code, message: "The meeting must end after it starts." });
    }

    if (!DAYS.includes(manual.day)) {
      issues.push({ code: course.code, message: "Choose a teaching day." });
    }
  }

  return issues;
}

/** Plain-language reading of the sheet for the summary column. */
export function describeConstraints(constraints: Constraints): {
  label: string;
  value: string;
}[] {
  const blocked = constraints.blocked;
  const blockedSummary =
    blocked.length === 0
      ? "None"
      : blocked.length === 1
        ? `${blocked[0].day} ${formatTimeRange(blocked[0].start, blocked[0].end)}`
        : `${blocked.length} windows`;

  return [
    {
      label: "Teaching days",
      value:
        constraints.allowed_days.length === 0
          ? "None"
          : formatDayList(constraints.allowed_days),
    },
    {
      label: "Session cap",
      value: `${constraints.max_sessions_per_day} per day`,
    },
    {
      label: "Time",
      value: TIME_PREFERENCE_HINTS[constraints.time_preference].replace(/\.$/, ""),
    },
    {
      label: "Off days",
      value:
        constraints.preferred_off_days.length === 0
          ? "None"
          : formatDayList(constraints.preferred_off_days),
    },
    { label: "Blocked", value: blockedSummary },
  ];
}
