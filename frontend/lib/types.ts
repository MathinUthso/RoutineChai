/**
 * Wire contract shared with the routine API. Field names stay snake_case so
 * payloads can be forwarded without translation.
 */

export type Day = "Sat" | "Sun" | "Mon" | "Tue" | "Wed";

export type Program = "BSCSE" | "BSDS" | "BSEEE";

export type CourseKind = "theory" | "lab";

export type TimePreference = "morning" | "afternoon" | "any";

export interface Faculty {
  name: string;
  initials: string | null;
}

export interface Meeting {
  day: Day;
  /** 24h clock, "HH:MM". */
  start: string;
  /** 24h clock, "HH:MM". */
  end: string;
  room: string;
}

export interface Section {
  name: string;
  /** Conditional sections are only considered when explicitly allowed. */
  if_required: boolean;
  faculty: Faculty;
  meetings: Meeting[];
}

export interface Course {
  code: string;
  title: string;
  credits: number;
  programs: Program[];
  kind: CourseKind;
  sections: Section[];
}

export interface CatalogResponse {
  term: string;
  programs: Program[];
  /** ISO 8601 timestamp. */
  generated_at: string;
  source: string;
  courses: Course[];
}

export interface BlockedWindow {
  day: Day;
  start: string;
  end: string;
}

export interface Constraints {
  blocked: BlockedWindow[];
  max_sessions_per_day: number;
  allowed_days: Day[];
  time_preference: TimePreference;
  preferred_off_days: Day[];
  /** Longest single idle gap allowed per day; null means no cap. */
  max_gap_minutes: number | null;
  /** Distinct teaching days allowed; null means no cap. */
  max_campus_days: number | null;
  /** No meeting may start before this 24h clock time; null means no cap. */
  earliest_start: string | null;
  /** No meeting may end after this 24h clock time; null means no cap. */
  latest_end: string | null;
}

export interface ManualProject {
  /** Section label supplied by the student for the project course. */
  section: string;
  day: Day;
  /** 24h clock, "HH:MM". */
  start: string;
  /** 24h clock, "HH:MM". */
  end: string;
}

export interface GenerateRequestCourse {
  code: string;
  /** Empty means every standard section is eligible. */
  allowed_sections: string[];
  /** Sections marked full; removed from the solver's candidates. */
  excluded_sections: string[];
  /** Faculty names or initials; empty means no preference. */
  preferred_faculty: string[];
  /** Faculty names or initials; matching sections are removed entirely. */
  excluded_faculty: string[];
  /** Project-only manual placement; replaces the catalog sections. */
  manual_project: ManualProject | null;
}

/** UI-side preference shape, submitted as `GenerateRequestCourse`. */
export interface CoursePreference {
  allowed_sections: string[];
  excluded_sections: string[];
  preferred_faculty: string[];
  excluded_faculty: string[];
  manual_project: ManualProject | null;
}

export interface GenerateRequest {
  /** Any course offered to at least one of these programs is eligible. */
  programs: Program[];
  courses: GenerateRequestCourse[];
  constraints: Constraints;
  /** Page size, 1–50. */
  limit: number;
  /** Zero-based routine offset for server-side paging. */
  offset: number;
}

export type DiagnosticsReason =
  | "no_solution"
  | "courses_without_candidates"
  | "conflicting_pairs";

export interface Diagnostics {
  reason: DiagnosticsReason;
  courses_without_candidates: string[];
  conflicting_pairs: [string, string][];
  message: string;
}

export interface RoutineCourse {
  code: string;
  title: string;
  section: string;
  faculty: string;
  credits: number;
  kind: CourseKind;
  meetings: Meeting[];
  /** True when the student supplied the project section and meeting. */
  manual: boolean;
}

export interface RoutineStats {
  campus_days: number;
  gap_minutes: number;
  total_credits: number;
  earliest: string | null;
  latest: string | null;
}

export interface ScoreBreakdown {
  time: number;
  faculty: number;
  compactness: number;
  fewer_days: number;
  off_days: number;
}

export interface Routine {
  id: string;
  score: number;
  breakdown: ScoreBreakdown;
  stats: RoutineStats;
  courses: RoutineCourse[];
}

export interface GenerateResult {
  routines: Routine[];
  diagnostics: Diagnostics[];
  /** More routines exist beyond this page. */
  truncated: boolean;
  /** Total unique routines found; a lower bound when `total_is_partial`. */
  total: number;
  /** True when the solver stopped before proving the total. */
  total_is_partial: boolean;
  offset: number;
  limit: number;
}
