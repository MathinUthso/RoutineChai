import type { Day, Meeting, Routine } from "./types";

/** Dhaka is UTC+06:00 all year; the campus calendar has no DST. */
const DHAKA_OFFSET_MINUTES = 6 * 60;

/** A conventional semester length; the UI marks these dates for registrar verification. */
const WEEKLY_OCCURRENCES = 16;

const WEEKDAY: Record<Day, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Sat: 6,
};

const BYDAY: Record<Day, string> = {
  Sun: "SU",
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Sat: "SA",
};

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

function stamp(date: Date, minutes: number) {
  const utc = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      Math.floor(minutes / 60),
      minutes % 60,
    ) -
      DHAKA_OFFSET_MINUTES * 60_000,
  );
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(
    utc.getUTCHours(),
  )}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`;
}

function utcStamp(value: Date) {
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(
    value.getUTCHours(),
  )}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`;
}

function minutesOf(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Next occurrence of a weekday in Dhaka, starting today when the class is still ahead. */
function nextDate(day: Day, now: Date, startMinutes: number) {
  const dhakaNow = new Date(now.getTime() + DHAKA_OFFSET_MINUTES * 60_000);
  const base = new Date(
    Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate(), 12),
  );
  const nowMinutes = dhakaNow.getUTCHours() * 60 + dhakaNow.getUTCMinutes();
  let delta = (WEEKDAY[day] - base.getUTCDay() + 7) % 7;
  if (delta === 0 && startMinutes <= nowMinutes) delta = 7;
  return new Date(base.getTime() + delta * 86_400_000);
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string) {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

function safeUid(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function eventFor(
  routine: Routine,
  course: Routine["courses"][number],
  meeting: Meeting,
  index: number,
  now: Date,
) {
  const start = minutesOf(meeting.start);
  const end = minutesOf(meeting.end);
  if (start === null || end === null || end <= start) return null;

  const date = nextDate(meeting.day, now, start);
  const description = [
    `Section ${course.section}${course.manual ? " (manual project slot)" : ""}`,
    `Faculty ${course.faculty}`,
    `Room ${meeting.room.trim() || "TBA"}`,
    "Generated from the UIU Fall 2026 routine planner.",
    `Weekly for ${WEEKLY_OCCURRENCES} occurrences from the next class date.`,
    "Verify term dates, holidays, and room changes with the registrar before relying on this calendar.",
  ].join("\n");

  return [
    "BEGIN:VEVENT",
    `UID:${safeUid(`${routine.id}-${course.code}-${meeting.day}-${meeting.start}-${index}`)}@uiu-routine.local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${stamp(date, start)}`,
    `DTEND:${stamp(date, end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[meeting.day]};COUNT=${WEEKLY_OCCURRENCES}`,
    `SUMMARY:${escapeText(`${course.code} · ${course.title}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(meeting.room.trim() || "TBA")}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ].map(fold);
}

export function buildRoutineCalendar(routine: Routine, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UIU Routine//Fall 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:UIU Fall 2026 routine",
    "X-WR-TIMEZONE:Asia/Dhaka",
    ...routine.courses.flatMap((course, courseIndex) =>
      course.meetings.flatMap((meeting, meetingIndex) =>
        eventFor(routine, course, meeting, courseIndex * 100 + meetingIndex, now) ?? [],
      ),
    ),
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function calendarFilename(routine: Routine): string {
  return `uiu-fall-2026-${safeUid(routine.id).slice(0, 60)}.ics`;
}
