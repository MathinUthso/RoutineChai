import { defaultConstraints } from "./schedule";
import type {
  CatalogResponse,
  Constraints,
  CoursePreference,
  Program,
} from "./types";

export const CONSENT_COOKIE = "routinechai.consent";
export const STATE_STORAGE_KEY = "routinechai.state";
export const SNAPSHOT_VERSION = 1;
export const RETENTION_DAYS = 30;
export const MAX_AGE_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

export type ConsentDecision = "accepted" | "declined";

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

export interface PlannerSnapshot {
  v: typeof SNAPSHOT_VERSION;
  savedAt: string;
  programs: Program[];
  selectedCodes: string[];
  constraints: Constraints;
  preferences: Record<string, CoursePreference>;
  step: 1 | 2 | 3;
  selectedRoutineId: string | null;
}

function safeIsBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
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

export function readConsent(): ConsentDecision | null {
  if (!safeIsBrowser()) return null;

  try {
    const escaped = CONSENT_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
    );
    if (!match) return null;

    const value = decodeURIComponent(match[1]).trim();
    if (value === "accepted" || value === "declined") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeConsent(decision: ConsentDecision): void {
  if (!safeIsBrowser()) return;

  try {
    const isHttps = window.location.protocol === "https:";
    const secure = isHttps ? "; Secure" : "";
    const cookieString = `${CONSENT_COOKIE}=${encodeURIComponent(
      decision,
    )}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    document.cookie = cookieString;
    notifyConsent();
  } catch {
    // Ignore cookies disabled / SecurityError
  }
}

export function readSnapshot(): PlannerSnapshot | null {
  if (!safeIsBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PlannerSnapshot>;
    if (!parsed || parsed.v !== SNAPSHOT_VERSION) {
      return null;
    }

    if (!Array.isArray(parsed.programs) || !Array.isArray(parsed.selectedCodes)) {
      return null;
    }

    if (!parsed.constraints || typeof parsed.constraints !== "object") {
      return null;
    }

    if (!parsed.preferences || typeof parsed.preferences !== "object") {
      return null;
    }

    const step = parsed.step;
    const validStep = step === 1 || step === 2 || step === 3 ? step : 1;

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
      selectedRoutineId:
        typeof parsed.selectedRoutineId === "string" ? parsed.selectedRoutineId : null,
    };
  } catch {
    return null;
  }
}

export function writeSnapshot(snapshot: PlannerSnapshot): void {
  if (!safeIsBrowser()) return;

  // Gate on consent check so we never write without explicit agreement
  if (readConsent() !== "accepted") return;

  try {
    window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // QuotaExceededError or private browsing restrictions
  }
}

export function clearSnapshot(): void {
  if (!safeIsBrowser()) return;

  try {
    window.localStorage.removeItem(STATE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Remove stale course codes/preferences if the catalog changed since the snapshot was saved.
 */
export function pruneSnapshot(
  snapshot: PlannerSnapshot,
  catalog: CatalogResponse,
): PlannerSnapshot {
  const catalogPrograms = new Set<Program>(catalog.programs);
  const catalogCourses = new Map(catalog.courses.map((course) => [course.code, course]));

  const programs = snapshot.programs.filter((p) => catalogPrograms.has(p));
  const validPrograms = programs.length > 0 ? programs : (catalog.programs.slice(0, 1) as Program[]);

  const selectedCodes = snapshot.selectedCodes.filter((code) => catalogCourses.has(code));
  const selectedSet = new Set(selectedCodes);

  const preferences: Record<string, CoursePreference> = {};
  for (const [code, pref] of Object.entries(snapshot.preferences)) {
    if (!selectedSet.has(code)) continue;

    const course = catalogCourses.get(code);
    if (!course) continue;

    const validSections = new Set(course.sections.map((s) => s.name));
    // The solver matches faculty by name or initials, so keep both.
    const validFaculties = new Set(
      course.sections.flatMap((s) =>
        [s.faculty.name, s.faculty.initials].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      ),
    );
    const keepFaculty = (values: string[] | undefined) =>
      (values ?? []).filter((value) => validFaculties.has(value));

    preferences[code] = {
      allowed_sections: (pref.allowed_sections ?? []).filter((s) => validSections.has(s)),
      excluded_sections: (pref.excluded_sections ?? []).filter((s) => validSections.has(s)),
      preferred_faculty: keepFaculty(pref.preferred_faculty),
      excluded_faculty: keepFaculty(pref.excluded_faculty),
      manual_project: pref.manual_project ?? null,
    };
  }

  const step = selectedCodes.length === 0 ? 1 : snapshot.step;

  return {
    ...snapshot,
    programs: validPrograms,
    selectedCodes,
    preferences,
    step,
  };
}
