import { defaultConstraints } from "./schedule";
import type {
  CatalogResponse,
  Constraints,
  CoursePreference,
  Program,
} from "./types";

export const CONSENT_COOKIE = "routinechai.consent";
export const STATE_COOKIE = "routinechai.state";
export const STATE_CHUNKS_COOKIE = "routinechai.state.chunks";
/** Where the first version of this feature kept the snapshot. */
const LEGACY_STORAGE_KEY = "routinechai.state";
export const SNAPSHOT_VERSION = 2;
export const RETENTION_DAYS = 30;
export const MAX_AGE_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

/**
 * A cookie holds roughly 4 KB including its attributes. The snapshot is split
 * into chunks well below that, because percent-encoding can inflate a chunk.
 */
const CHUNK_SIZE = 2000;

export type ConsentDecision = "accepted" | "declined";

export interface PlannerSnapshot {
  v: typeof SNAPSHOT_VERSION;
  savedAt: string;
  programs: Program[];
  selectedCodes: string[];
  constraints: Constraints;
  preferences: Record<string, CoursePreference>;
  step: 1 | 2 | 3;
  /** Ranked plan the student had open, when it was a ranked one. */
  planId: string | null;
  /** Course code to section label of the plan the student had open. */
  sections: Record<string, string>;
}

/** Subscribers are notified whenever the consent cookie changes. */
const consentListeners = new Set<() => void>();

function notifyConsent() {
  for (const listener of consentListeners) listener();
}

export function subscribeConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

/** Snapshot for `useSyncExternalStore`; the value is a stable primitive. */
export function getConsentSnapshot(): ConsentDecision | null {
  return readConsent();
}

/** There are no cookies on the server, so the answer there is "not yet". */
export function getServerConsentSnapshot(): ConsentDecision | null {
  return null;
}

function safeIsBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readCookie(name: string): string | null {
  if (!safeIsBrowser()) return null;

  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
    );
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  if (!safeIsBrowser()) return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  if (!safeIsBrowser()) return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

/** True when a snapshot is stored, without paying to parse it. */
export function hasStoredSnapshot(): boolean {
  if (readCookie(STATE_COOKIE) !== null) return true;
  const chunks = Number(readCookie(STATE_CHUNKS_COOKIE) ?? "0");
  return Number.isFinite(chunks) && chunks > 0;
}

/**
 * The consent answer. A stored snapshot means the student agreed earlier, even
 * if the consent cookie was since cleared, so it still counts as accepted.
 */
export function readConsent(): ConsentDecision | null {
  const value = readCookie(CONSENT_COOKIE);
  if (value === "accepted" || value === "declined") return value;
  if (hasStoredSnapshot()) return "accepted";
  return null;
}

export function writeConsent(decision: ConsentDecision): void {
  if (!safeIsBrowser()) return;

  try {
    writeCookie(CONSENT_COOKIE, decision);
    notifyConsent();
  } catch {
    // The browser refused the cookie; the caller keeps the previous state.
  }
}

export function clearConsent(): void {
  if (!safeIsBrowser()) return;

  try {
    deleteCookie(CONSENT_COOKIE);
    notifyConsent();
  } catch {
    // Nothing to do.
  }
}

/**
 * Fill in any constraint a stored snapshot predates, so an older entry can
 * never produce a malformed request.
 */
function mergeConstraints(stored: Partial<Constraints>): Constraints {
  const defaults = defaultConstraints();
  return {
    ...defaults,
    ...stored,
    blocked: Array.isArray(stored.blocked) ? stored.blocked : defaults.blocked,
    allowed_days: Array.isArray(stored.allowed_days)
      ? stored.allowed_days
      : defaults.allowed_days,
    preferred_off_days: Array.isArray(stored.preferred_off_days)
      ? stored.preferred_off_days
      : defaults.preferred_off_days,
  };
}

export function readSnapshot(): PlannerSnapshot | null {
  if (!safeIsBrowser()) return null;

  try {
    const chunkCount = Number(readCookie(STATE_CHUNKS_COOKIE) ?? "0");
    let json: string;

    if (Number.isFinite(chunkCount) && chunkCount > 0) {
      const parts: string[] = [];
      for (let index = 1; index <= chunkCount; index += 1) {
        const part = readCookie(`${STATE_COOKIE}.${index}`);
        if (part === null) return null;
        parts.push(part);
      }
      json = parts.join("");
    } else {
      const raw = readCookie(STATE_COOKIE);
      if (!raw) return null;
      json = raw;
    }

    const parsed = JSON.parse(json) as Partial<PlannerSnapshot>;
    if (!parsed || parsed.v !== SNAPSHOT_VERSION) return null;
    if (!Array.isArray(parsed.programs) || !Array.isArray(parsed.selectedCodes)) return null;
    if (!parsed.constraints || typeof parsed.constraints !== "object") return null;
    if (!parsed.preferences || typeof parsed.preferences !== "object") return null;

    const step = parsed.step;
    const validStep = step === 1 || step === 2 || step === 3 ? step : 1;
    const sections: Record<string, string> = {};
    if (parsed.sections && typeof parsed.sections === "object") {
      for (const [code, section] of Object.entries(parsed.sections)) {
        if (typeof section === "string" && section.length > 0) sections[code] = section;
      }
    }

    return {
      v: SNAPSHOT_VERSION,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      programs: parsed.programs as Program[],
      selectedCodes: parsed.selectedCodes.filter(
        (code): code is string => typeof code === "string",
      ),
      constraints: mergeConstraints(parsed.constraints),
      preferences: parsed.preferences as Record<string, CoursePreference>,
      step: validStep,
      planId: typeof parsed.planId === "string" ? parsed.planId : null,
      sections,
    };
  } catch {
    return null;
  }
}

/**
 * The first version of this feature kept the snapshot in localStorage under
 * the same key. A student who agreed before the move to cookies still has
 * their details there, so carry them over once and clear the old copy.
 */
export function migrateLegacySnapshot(): boolean {
  if (!safeIsBrowser()) return false;
  if (hasStoredSnapshot()) return false;
  if (readConsent() !== "accepted") return false;

  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (!parsed || parsed.v !== 1) return false;
    if (!Array.isArray(parsed.selectedCodes) || !parsed.constraints) return false;

    const step = parsed.step;
    return writeSnapshot({
      v: SNAPSHOT_VERSION,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      programs: Array.isArray(parsed.programs) ? (parsed.programs as Program[]) : ["BSCSE"],
      selectedCodes: parsed.selectedCodes.filter(
        (code): code is string => typeof code === "string",
      ),
      constraints: mergeConstraints(parsed.constraints as Partial<Constraints>),
      preferences: (parsed.preferences ?? {}) as Record<string, CoursePreference>,
      step: step === 1 || step === 2 || step === 3 ? step : 1,
      planId: typeof parsed.selectedRoutineId === "string" ? parsed.selectedRoutineId : null,
      sections: {},
    });
  } catch {
    return false;
  }
}

/**
 * Stores the snapshot in cookies. Returns false when the browser refused, so
 * the caller can tell the student their details are not being kept.
 */
export function writeSnapshot(snapshot: PlannerSnapshot): boolean {
  if (!safeIsBrowser()) return false;
  if (readConsent() !== "accepted") return false;

  try {
    const json = JSON.stringify(snapshot);

    const previousChunks = Number(readCookie(STATE_CHUNKS_COOKIE) ?? "0");
    if (Number.isFinite(previousChunks)) {
      for (let index = 1; index <= previousChunks; index += 1) {
        deleteCookie(`${STATE_COOKIE}.${index}`);
      }
    }
    deleteCookie(STATE_CHUNKS_COOKIE);
    deleteCookie(STATE_COOKIE);

    if (json.length <= CHUNK_SIZE) {
      writeCookie(STATE_COOKIE, json);
      return true;
    }

    let count = 0;
    for (let index = 0; index < json.length; index += CHUNK_SIZE) {
      count += 1;
      writeCookie(`${STATE_COOKIE}.${count}`, json.slice(index, index + CHUNK_SIZE));
    }
    writeCookie(STATE_CHUNKS_COOKIE, String(count));
    return true;
  } catch {
    return false;
  }
}

export function clearSnapshot(): void {
  if (!safeIsBrowser()) return;

  try {
    const chunkCount = Number(readCookie(STATE_CHUNKS_COOKIE) ?? "0");
    if (Number.isFinite(chunkCount)) {
      for (let index = 1; index <= chunkCount; index += 1) {
        deleteCookie(`${STATE_COOKIE}.${index}`);
      }
    }
    deleteCookie(STATE_CHUNKS_COOKIE);
    deleteCookie(STATE_COOKIE);
  } catch {
    // Nothing to do.
  }
}

/**
 * Remove stale course codes, sections and preferences if the catalog changed
 * since the snapshot was saved.
 */
export function pruneSnapshot(
  snapshot: PlannerSnapshot,
  catalog: CatalogResponse,
): PlannerSnapshot {
  const catalogPrograms = new Set<Program>(catalog.programs);
  const catalogCourses = new Map(catalog.courses.map((course) => [course.code, course]));

  const programs = snapshot.programs.filter((program) => catalogPrograms.has(program));
  const validPrograms =
    programs.length > 0 ? programs : (catalog.programs.slice(0, 1) as Program[]);

  const selectedCodes = snapshot.selectedCodes.filter((code) => catalogCourses.has(code));
  const selectedSet = new Set(selectedCodes);

  const preferences: Record<string, CoursePreference> = {};
  const sections: Record<string, string> = {};

  for (const [code, pref] of Object.entries(snapshot.preferences)) {
    if (!selectedSet.has(code)) continue;

    const course = catalogCourses.get(code);
    if (!course) continue;

    const validSections = new Set(course.sections.map((section) => section.name));
    // The solver matches faculty by name or initials, so keep both.
    const validFaculties = new Set(
      course.sections.flatMap((section) =>
        [section.faculty.name, section.faculty.initials].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      ),
    );
    const keepFaculty = (values: string[] | undefined) =>
      (values ?? []).filter((value) => validFaculties.has(value));

    preferences[code] = {
      allowed_sections: (pref.allowed_sections ?? []).filter((section) =>
        validSections.has(section),
      ),
      excluded_sections: (pref.excluded_sections ?? []).filter((section) =>
        validSections.has(section),
      ),
      preferred_faculty: keepFaculty(pref.preferred_faculty),
      excluded_faculty: keepFaculty(pref.excluded_faculty),
      manual_project: pref.manual_project ?? null,
    };
  }

  for (const [code, section] of Object.entries(snapshot.sections)) {
    if (!selectedSet.has(code)) continue;
    const course = catalogCourses.get(code);
    if (!course) continue;
    if (!course.sections.some((option) => option.name === section)) continue;
    sections[code] = section;
  }

  const step = selectedCodes.length === 0 ? 1 : snapshot.step;

  return {
    ...snapshot,
    programs: validPrograms,
    selectedCodes,
    preferences,
    sections,
    step,
  };
}
