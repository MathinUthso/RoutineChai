/**
 * Wire contract shared with the routine API. Field names stay snake_case so
 * payloads can be forwarded without translation.
 */

export type Day = "Sat" | "Sun" | "Mon" | "Tue" | "Wed";

export type Program = "BSCSE" | "BSDS";

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
  programs: string[];
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
}

export interface GenerateRequestCourse {
  code: string;
  /** Empty means every standard section is eligible. */
  allowed_sections: string[];
  /** Faculty names or initials; empty means no preference. */
  preferred_faculty: string[];
}

/** UI-side preference shape, submitted as `GenerateRequestCourse`. */
export interface CoursePreference {
  allowed_sections: string[];
  preferred_faculty: string[];
}

export interface GenerateRequest {
  program: Program;
  courses: GenerateRequestCourse[];
  constraints: Constraints;
  /** 1–50; the UI asks for 10. */
  limit: number;
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
  truncated: boolean;
}
