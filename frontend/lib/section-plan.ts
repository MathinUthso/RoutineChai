import { formatGap, formatTime, minutesOfDay } from "./schedule";
import type {
  BlockedWindow,
  CatalogResponse,
  Constraints,
  Course,
  Meeting,
  Routine,
  RoutineCourse,
  Section,
} from "./types";

export type SectionStatus = "current" | "ready" | "conditional" | "clash" | "filtered" | "excluded";

export type SectionOption = {
  section: Section;
  status: SectionStatus;
  reason: string | null;
};

export type SectionOptionInput = {
  course: Course;
  routineCourse: RoutineCourse;
  routine: Routine;
  constraints: Constraints;
  slotMinutes: number;
  excludedSections: string[];
  excludedFaculty: string[];
};

const DAY_LABELS: Record<string, string> = {
  Sat: "Saturday",
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
};

export function catalogSlotMinutes(catalog: CatalogResponse | null): number {
  if (!catalog) return 79;
  let shortest = Number.POSITIVE_INFINITY;
  for (const course of catalog.courses) {
    for (const section of course.sections) {
      for (const meeting of section.meetings) {
        const start = minutesOfDay(meeting.start);
        const end = minutesOfDay(meeting.end);
        if (start !== null && end !== null && end > start) {
          shortest = Math.min(shortest, end - start);
        }
      }
    }
  }
  return Number.isFinite(shortest) ? shortest : 79;
}

export function longestGapMinutes(meetings: Meeting[], slotMinutes: number): number {
  const byDay = new Map<string, [number, number][]>();
  for (const meeting of meetings) {
    const start = minutesOfDay(meeting.start);
    const end = minutesOfDay(meeting.end);
    if (start === null || end === null || end <= start) continue;
    const intervals = byDay.get(meeting.day) ?? [];
    intervals.push([start, end]);
    byDay.set(meeting.day, intervals);
  }

  let longest = 0;
  for (const intervals of byDay.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < intervals.length; index += 1) {
      const gap = intervals[index][0] - intervals[index - 1][1];
      if (gap < slotMinutes) continue;
      longest = Math.max(longest, gap);
    }
  }
  return longest;
}

function overlaps(a: Meeting, b: Meeting): boolean {
  if (a.day !== b.day) return false;
  const aStart = minutesOfDay(a.start);
  const aEnd = minutesOfDay(a.end);
  const bStart = minutesOfDay(b.start);
  const bEnd = minutesOfDay(b.end);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

function blockedBy(meeting: Meeting, blocked: BlockedWindow[]): boolean {
  return blocked.some((window) => {
    if (window.day !== meeting.day) return false;
    const start = minutesOfDay(window.start);
    const end = minutesOfDay(window.end);
    const meetingStart = minutesOfDay(meeting.start);
    const meetingEnd = minutesOfDay(meeting.end);
    if (start === null || end === null || meetingStart === null || meetingEnd === null) return false;
    return meetingStart < end && start < meetingEnd;
  });
}

function sessionCount(meetings: Meeting[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const meeting of meetings) {
    counts.set(meeting.day, (counts.get(meeting.day) ?? 0) + 1);
  }
  return counts;
}

function sectionMeetings(section: Section): Meeting[] {
  return section.meetings ?? [];
}

export function sectionOptions({
  course,
  routineCourse,
  routine,
  constraints,
  slotMinutes,
  excludedSections,
  excludedFaculty,
}: SectionOptionInput): SectionOption[] {
  const current = routineCourse.section;
  const excluded = new Set(excludedSections);
  const blockedFaculty = new Set(
    excludedFaculty.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const others = routine.courses.filter((item) => item.code !== course.code);
  const otherMeetings = others.flatMap((item) => item.meetings);
  const allowedDays = new Set(constraints.allowed_days);
  const latestEnd = constraints.latest_end ? minutesOfDay(constraints.latest_end) : null;

  return [...course.sections]
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((section) => {
      if (excluded.has(section.name)) {
        return { section, status: "excluded" as const, reason: "Marked full" };
      }
      if (section.name === current) {
        return { section, status: "current" as const, reason: null };
      }
      if (
        blockedFaculty.has(section.faculty.name.trim().toLowerCase()) ||
        blockedFaculty.has((section.faculty.initials ?? "").trim().toLowerCase())
      ) {
        return {
          section,
          status: "filtered" as const,
          reason: `${section.faculty.name} is excluded`,
        };
      }

      const meetings = sectionMeetings(section);
      if (meetings.length === 0) {
        return { section, status: "filtered" as const, reason: "No meeting time listed" };
      }

      for (const meeting of meetings) {
        if (!allowedDays.has(meeting.day)) {
          return {
            section,
            status: "filtered" as const,
            reason: `Meets ${DAY_LABELS[meeting.day] ?? meeting.day}, outside your teaching days`,
          };
        }
        const end = minutesOfDay(meeting.end);
        if (latestEnd !== null && end !== null && end > latestEnd) {
          return {
            section,
            status: "filtered" as const,
            reason: `Ends after ${formatTime(constraints.latest_end ?? "")}`,
          };
        }
        if (blockedBy(meeting, constraints.blocked)) {
          return {
            section,
            status: "filtered" as const,
            reason: "Overlaps a blocked window",
          };
        }
      }

      for (const meeting of meetings) {
        const clash = others.find((item) =>
          item.meetings.some((otherMeeting) => overlaps(meeting, otherMeeting)),
        );
        if (clash) {
          return {
            section,
            status: "clash" as const,
            reason: `Clashes with ${clash.code}`,
          };
        }
      }

      const combined = [...otherMeetings, ...meetings];
      const counts = sessionCount(combined);
      for (const [day, count] of counts) {
        if (count > constraints.max_sessions_per_day) {
          return {
            section,
            status: "clash" as const,
            reason: `${count} classes on ${DAY_LABELS[day] ?? day} (cap ${constraints.max_sessions_per_day})`,
          };
        }
      }

      const campusDays = new Set(combined.map((meeting) => meeting.day)).size;
      if (constraints.max_campus_days !== null && campusDays > constraints.max_campus_days) {
        return {
          section,
          status: "filtered" as const,
          reason: `${campusDays} campus days (cap ${constraints.max_campus_days})`,
        };
      }

      const longest = longestGapMinutes(combined, slotMinutes);
      if (constraints.max_gap_minutes !== null && longest > constraints.max_gap_minutes) {
        return {
          section,
          status: "filtered" as const,
          reason: `Creates a ${formatGap(longest)} gap (cap ${formatGap(constraints.max_gap_minutes)})`,
        };
      }

      if (section.if_required) {
        return {
          section,
          status: "conditional" as const,
          reason: "Conditional section; pinning it makes it eligible",
        };
      }

      return { section, status: "ready" as const, reason: null };
    });
}

export function planLabel(rankIndex: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (rankIndex < alphabet.length) return `Plan ${alphabet[rankIndex]}`;
  return `Plan ${rankIndex + 1}`;
}

export function sectionSummary(section: Section): string {
  const meetings = sectionMeetings(section);
  if (meetings.length === 0) return "No meeting time";
  const first = meetings[0];
  return `${first.day} ${formatTime(first.start)}`;
}
