import type { Constraints, CoursePreference, Day, Meeting, TimePreference } from "./types";

/** Registrar week: Saturday through Wednesday only. */
export const DAYS: Day[] = ["Sat", "Sun", "Mon", "Tue", "Wed"];

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
  return { allowed_sections: [], preferred_faculty: [] };
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
  return `${meeting.day} ${meeting.start}–${meeting.end} · ${meeting.room}`;
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
        ? `${blocked[0].day} ${blocked[0].start}–${blocked[0].end}`
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
