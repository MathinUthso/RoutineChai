import { catalogSlotMinutes } from "@/lib/section-plan";
import { DAYS, minutesOfDay, PROJECT_COURSE_CODES } from "@/lib/schedule";
import type {
  CatalogResponse,
  Course,
  Day,
  ManualProject,
  Program,
  Routine,
  RoutineCourse,
  RoutineStats,
} from "@/lib/types";

/** Bumped when the payload shape changes; older tokens then stop decoding. */
export const SHARE_VERSION = 1;

const PROGRAMS: Program[] = ["BSCSE", "BSDS", "BSEEE"];

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const MAX_TOKEN_LENGTH = 2048;
const MAX_CODES = 24;
const MAX_MANUAL_SLOTS = 3;
const MAX_CODE_LENGTH = 32;
const MAX_SECTION_LENGTH = 16;

/** A shared routine, decoded from a link token. */
export type SharedPlan = {
  v: typeof SHARE_VERSION;
  /** Programs the plan was built for. May be empty if the payload omitted them. */
  p: Program[];
  /** Course code and section name pairs. */
  c: [string, string][];
  /** Manual project slots: code, section label, day, start, end. */
  m?: [string, string, Day, string, string][];
};

/** A course or section from the payload that the current catalog no longer has. */
export type SharedPlanMissing = {
  code: string;
  section: string;
};

/** One course of a shared plan, resolved against the catalog. */
export type ResolvedSharedCourse = {
  code: string;
  section: string;
  /** The manual project slot for this course, when it has one. */
  manual: ManualProject | null;
};

export type ResolvedSharedPlan = {
  /** Courses that resolved against the catalog, in payload order. */
  courses: ResolvedSharedCourse[];
  /** Courses or sections the current catalog no longer has. */
  missing: SharedPlanMissing[];
  /** The rebuilt routine, ready for the weekly grid and the .ics export. */
  routine: Routine;
  /** The programs to request, already valid for the current catalog. */
  programs: Program[];
};

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isProgram(value: unknown): value is Program {
  return typeof value === "string" && (PROGRAMS as string[]).includes(value);
}

function isDay(value: unknown): value is Day {
  return typeof value === "string" && (DAYS as string[]).includes(value);
}

function isClockTime(value: unknown): value is string {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return false;
  return minutesOfDay(value) !== null;
}

function asTuple(value: unknown, size: number): unknown[] | null {
  if (!isUnknownArray(value) || value.length !== size) return null;
  return value;
}

function dedupePrograms(programs: Program[]): Program[] {
  const seen = new Set<Program>();
  const result: Program[] = [];
  for (const program of programs) {
    if (seen.has(program)) continue;
    seen.add(program);
    result.push(program);
  }
  return result;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const standard = token.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = standard.length % 4;
  const padded = remainder === 0 ? standard : standard + "=".repeat(4 - remainder);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Packs the plan a student is looking at into a URL-safe token. The payload
 * stays compact because the token travels inside a shared link.
 */
export function encodeSharedPlan(routine: Routine, programs: Program[]): string {
  const courses: [string, string][] = routine.courses.map((course) => [
    course.code,
    course.section,
  ]);

  const manual: [string, string, Day, string, string][] = [];
  for (const course of routine.courses) {
    if (!course.manual) continue;
    const meeting = course.meetings[0];
    if (!meeting) continue;
    manual.push([course.code, course.section, meeting.day, meeting.start, meeting.end]);
  }

  const payload: SharedPlan = {
    v: SHARE_VERSION,
    p: dedupePrograms(programs),
    c: courses,
  };
  if (manual.length > 0) payload.m = manual;

  return toBase64Url(JSON.stringify(payload));
}

function readPrograms(value: unknown): Program[] {
  if (!isUnknownArray(value)) return [];

  const programs: Program[] = [];
  const seen = new Set<Program>();
  for (const entry of value) {
    // A program list that is not entirely valid is dropped whole; the
    // importer can derive the programs from the courses instead.
    if (!isProgram(entry)) return [];
    if (seen.has(entry)) continue;
    seen.add(entry);
    programs.push(entry);
  }
  return programs;
}

function readManualSlots(value: unknown): [string, string, Day, string, string][] | null {
  if (value === undefined || value === null) return [];
  if (!isUnknownArray(value)) return null;
  if (value.length > MAX_MANUAL_SLOTS) return null;

  const slots: [string, string, Day, string, string][] = [];
  const seenCodes = new Set<string>();
  for (const entry of value) {
    const tuple = asTuple(entry, 5);
    if (!tuple) return null;

    const [code, section, day, start, end] = tuple;
    if (typeof code !== "string" || !PROJECT_COURSE_CODES.has(code)) return null;
    if (!isBoundedText(section, MAX_SECTION_LENGTH)) return null;
    if (!isDay(day)) return null;
    if (!isClockTime(start) || !isClockTime(end)) return null;

    const startMinutes = minutesOfDay(start);
    const endMinutes = minutesOfDay(end);
    if (startMinutes === null || endMinutes === null) return null;
    if (endMinutes <= startMinutes) return null;

    if (seenCodes.has(code)) return null;
    seenCodes.add(code);
    slots.push([code, section, day, start, end]);
  }
  return slots;
}

/**
 * Reads a token that arrived from the public internet, so anything that is not
 * a well-formed payload of this version is rejected instead of trusted.
 */
export function decodeSharedPlan(token: string): SharedPlan | null {
  if (typeof token !== "string") return null;
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  if (!TOKEN_PATTERN.test(token)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(token));
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;

  const version = parsed.v;
  if (typeof version !== "number" || version !== SHARE_VERSION) return null;

  const rawCodes = parsed.c;
  if (!isUnknownArray(rawCodes) || rawCodes.length > MAX_CODES) return null;

  const codes: [string, string][] = [];
  const seenCodes = new Set<string>();
  for (const entry of rawCodes) {
    const pair = asTuple(entry, 2);
    if (!pair) return null;

    const [code, section] = pair;
    if (!isBoundedText(code, MAX_CODE_LENGTH)) return null;
    if (!isBoundedText(section, MAX_SECTION_LENGTH)) return null;

    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    codes.push([code, section]);
  }

  const manual = readManualSlots(parsed.m);
  if (!manual) return null;

  const plan: SharedPlan = {
    v: SHARE_VERSION,
    p: readPrograms(parsed.p),
    c: codes,
  };
  if (manual.length > 0) plan.m = manual;

  return plan;
}

export function sharedPlanUrl(token: string, origin?: string): string {
  return `${origin ?? ""}/share/${token}`;
}

function findSection(course: Course, name: string) {
  const wanted = name.trim().toLowerCase();
  return course.sections.find((section) => section.name.trim().toLowerCase() === wanted);
}

function formatClock(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

function summarize(courses: RoutineCourse[], slotMinutes: number): RoutineStats {
  const days = new Set<Day>();
  const byDay = new Map<Day, [number, number][]>();
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const course of courses) {
    for (const meeting of course.meetings) {
      days.add(meeting.day);

      const start = minutesOfDay(meeting.start);
      const end = minutesOfDay(meeting.end);
      if (start === null || end === null) continue;

      const intervals = byDay.get(meeting.day) ?? [];
      intervals.push([start, end]);
      byDay.set(meeting.day, intervals);

      if (earliest === null || start < earliest) earliest = start;
      if (latest === null || end > latest) latest = end;
    }
  }

  let gapMinutes = 0;
  for (const intervals of byDay.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < intervals.length; index += 1) {
      const gap = Math.max(0, intervals[index][0] - intervals[index - 1][1]);
      // A seam shorter than a class slot is not idle time.
      if (gap < slotMinutes) continue;
      gapMinutes += gap;
    }
  }

  return {
    campus_days: days.size,
    gap_minutes: gapMinutes,
    total_credits: courses.reduce((sum, course) => sum + course.credits, 0),
    earliest: earliest === null ? null : formatClock(earliest),
    latest: latest === null ? null : formatClock(latest),
  };
}

function resolvePrograms(
  planPrograms: Program[],
  courses: RoutineCourse[],
  catalog: CatalogResponse,
  catalogCourses: Map<string, Course>,
): Program[] {
  const offered = new Set(catalog.programs);
  const named = new Set(planPrograms.filter((program) => offered.has(program)));

  // The courses in the plan must stay eligible for the solver, so the programs
  // that offer them join the ones the token named.
  for (const course of courses) {
    for (const program of catalogCourses.get(course.code)?.programs ?? []) {
      named.add(program);
    }
  }

  const merged = catalog.programs.filter((program) => named.has(program));
  if (merged.length > 0) return merged;

  return catalog.programs.slice(0, 1);
}

/**
 * Rebuilds a shared plan against the catalog the receiver already fetched, so
 * titles, rooms, faculty and meeting times always come from the live sheet.
 */
export function resolveSharedPlan(
  plan: SharedPlan,
  catalog: CatalogResponse,
): ResolvedSharedPlan {
  const catalogCourses = new Map<string, Course>(
    catalog.courses.map((course): [string, Course] => [course.code, course]),
  );

  const manualSlots = plan.m ?? [];
  const manualCodes = new Set(manualSlots.map((slot) => slot[0]));

  const missing: SharedPlanMissing[] = [];
  const routineCourses: RoutineCourse[] = [];
  const resolvedCourses: ResolvedSharedCourse[] = [];

  for (const [code, section] of plan.c) {
    // A manual slot replaces the catalog sections of its course.
    if (manualCodes.has(code)) continue;

    const course = catalogCourses.get(code);
    if (!course) {
      missing.push({ code, section });
      continue;
    }

    const match = findSection(course, section);
    if (!match) {
      missing.push({ code, section });
      continue;
    }

    routineCourses.push({
      code: course.code,
      title: course.title,
      section: match.name,
      faculty: match.faculty.name,
      credits: course.credits,
      kind: course.kind,
      meetings: match.meetings,
      manual: false,
    });
    resolvedCourses.push({ code: course.code, section: match.name, manual: null });
  }

  for (const [code, label, day, start, end] of manualSlots) {
    const course = catalogCourses.get(code);
    if (!course) {
      missing.push({ code, section: label });
      continue;
    }

    const official = findSection(course, label);
    routineCourses.push({
      code: course.code,
      title: course.title,
      section: label,
      faculty: official ? official.faculty.name : "TBA",
      credits: course.credits,
      kind: course.kind,
      meetings: [{ day, start, end, room: "TBA" }],
      manual: true,
    });
    resolvedCourses.push({
      code: course.code,
      section: label,
      manual: { section: label, day, start, end },
    });
  }

  const routine: Routine = {
    id: routineCourses.map((course) => `${course.code}=${course.section}`).join("|"),
    // The score ranks a plan against the sender's own constraints, which are
    // deliberately left out of the shared payload, so it means nothing here.
    score: 0,
    breakdown: { time: 0, faculty: 0, compactness: 0, fewer_days: 0, off_days: 0 },
    stats: summarize(routineCourses, catalogSlotMinutes(catalog)),
    courses: routineCourses,
  };

  return {
    courses: resolvedCourses,
    missing,
    routine,
    programs: resolvePrograms(plan.p, routineCourses, catalog, catalogCourses),
  };
}
