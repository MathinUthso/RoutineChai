"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { generateRoutines, getCatalog } from "@/lib/api";
import { durations, panelVariants } from "@/lib/motion";
import {
  defaultConstraints,
  emptyPreference,
  validateConstraints,
  validateManualProjects,
} from "@/lib/schedule";
import type {
  CatalogResponse,
  Constraints,
  Course,
  CoursePreference,
  GenerateRequest,
  GenerateResult,
  Program,
  Routine,
} from "@/lib/types";
import { ConstraintsPanel } from "./constraints-panel";
import { ConsentBanner } from "./consent-banner";
import { CoursePicker } from "./course-picker";
import { Docket } from "./docket";
import { ResultsPanel } from "./results-panel";
import { StepRail } from "./step-rail";
import {
  clearSnapshot,
  pruneSnapshot,
  readConsent,
  readSnapshot,
  SNAPSHOT_VERSION,
  writeConsent,
  writeSnapshot,
} from "@/lib/persist";
import type { ConsentDecision } from "@/lib/persist";

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; catalog: CatalogResponse };

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: GenerateResult };

const PAGE_SIZE = 10;
/** Debounce for live refinements; the solver needs a moment to re-rank. */
const LIVE_DEBOUNCE_MS = 320;

function requestFor(
  programs: Program[],
  selected: Course[],
  preferences: Record<string, CoursePreference>,
  constraints: Constraints,
  offset: number,
): GenerateRequest {
  return {
    programs,
    courses: selected.map((course) => {
      const preference = preferences[course.code];
      return {
        code: course.code,
        allowed_sections: preference?.allowed_sections ?? [],
        excluded_sections: preference?.excluded_sections ?? [],
        preferred_faculty: preference?.preferred_faculty ?? [],
        excluded_faculty: preference?.excluded_faculty ?? [],
        manual_project: preference?.manual_project ?? null,
      };
    }),
    constraints,
    limit: PAGE_SIZE,
    offset,
  };
}

function matchesQuery(course: Course, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    course.code.toLowerCase().includes(needle) ||
    course.title.toLowerCase().includes(needle) ||
    course.sections.some(
      (section) =>
        section.faculty.name.toLowerCase().includes(needle) ||
        (section.faculty.initials ?? "").toLowerCase() === needle,
    )
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The routine service could not be reached.";
}

export function RoutineBuilder() {
  const reduceMotion = useReducedMotion();
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [programs, setPrograms] = useState<Program[]>(["BSCSE"]);
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<Constraints>(() => defaultConstraints());
  const [preferences, setPreferences] = useState<Record<string, CoursePreference>>({});
  const [resultState, setResultState] = useState<ResultState>({ status: "idle" });
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<{ page: number; message: string } | null>(null);
  const [lastRequest, setLastRequest] = useState<GenerateRequest | null>(null);
  const [customRoutine, setCustomRoutine] = useState<Routine | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{ code: string; section: string } | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  const [consent, setConsent] = useState<ConsentDecision | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restoreStep, setRestoreStep] = useState<1 | 2 | 3 | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const swapRef = useRef<AbortController | null>(null);
  const liveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getCatalog(controller.signal)
      .then((catalog) => {
        setCatalogState({ status: "ready", catalog });

        const decision = readConsent();
        if (decision) setConsent(decision);

        if (decision === "accepted") {
          const stored = readSnapshot();
          if (stored && stored.selectedCodes.length > 0) {
            const clean = pruneSnapshot(stored, catalog);
            setPrograms(clean.programs);
            setSelectedCodes(clean.selectedCodes);
            setConstraints(clean.constraints);
            setPreferences(clean.preferences);
            setStep(clean.step);
            setSelectedRoutineId(clean.selectedRoutineId);
            if (clean.step === 3) setRestoreStep(3);
          }
        }

        setHydrated(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogState({ status: "error", message: errorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      swapRef.current?.abort();
      if (liveTimerRef.current !== null) window.clearTimeout(liveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (step === 1) return;
    const delay = reduceMotion ? 0 : 280;
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      stepHeadingRef.current?.focus({ preventScroll: true });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [reduceMotion, step]);

  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;

  const counts = useMemo<Record<string, number>>(() => {
    if (!catalog) return {};
    return Object.fromEntries(
      catalog.programs.map((program) => [
        program,
        catalog.courses.filter((course) => course.programs.includes(program)).length,
      ]),
    );
  }, [catalog]);

  const visibleCourses = useMemo(() => {
    if (!catalog) return [];
    return catalog.courses.filter(
      (course) =>
        course.programs.some((program) => programs.includes(program)) &&
        matchesQuery(course, query),
    );
  }, [catalog, programs, query]);

  const selected = useMemo(() => {
    if (!catalog) return [];
    return selectedCodes
      .map((code) => catalog.courses.find((course) => course.code === code))
      .filter((course): course is Course => Boolean(course));
  }, [catalog, selectedCodes]);

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const issues = useMemo(() => validateConstraints(constraints), [constraints]);
  const preferenceIssues = useMemo(
    () => validateManualProjects(selected, preferences),
    [preferences, selected],
  );

  const invalidateResult = () => {
    requestRef.current?.abort();
    if (liveTimerRef.current !== null) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setResultState({ status: "idle" });
    setSelectedRoutineId(null);
    setPage(0);
    setPageLoading(false);
    setPageError(null);
    setLastRequest(null);
    setCustomRoutine(null);
    setLiveBusy(false);
    setLiveError(null);
    setSwapError(null);
    setPendingSwap(null);
  };

  const handleProgramChange = (next: Program[]) => {
    if (!catalog) return;

    const nextPrograms = catalog.programs.filter((option) => next.includes(option));
    const unchanged =
      nextPrograms.length === programs.length &&
      nextPrograms.every((option, index) => option === programs[index]);
    if (nextPrograms.length === 0 || unchanged) return;

    setPrograms(nextPrograms);
    setStep(1);
    invalidateResult();

    const offered = new Set(
      catalog.courses
        .filter((course) => course.programs.some((option) => nextPrograms.includes(option)))
        .map((course) => course.code),
    );
    setSelectedCodes((current) => current.filter((code) => offered.has(code)));
    setPreferences((current) => {
      const nextPreferences: Record<string, CoursePreference> = {};
      for (const [code, preference] of Object.entries(current)) {
        if (offered.has(code)) nextPreferences[code] = preference;
      }
      return nextPreferences;
    });
  };

  const toggleCourse = (code: string) => {
    const isSelected = selectedCodes.includes(code);
    setSelectedCodes((current) =>
      isSelected ? current.filter((item) => item !== code) : [...current, code],
    );
    if (isSelected) {
      setPreferences((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
    }
    invalidateResult();
  };

  const handleConstraintsChange = (next: Constraints) => {
    setConstraints(next);
    invalidateResult();
  };

  const handlePreferenceChange = (code: string, next: CoursePreference) => {
    setPreferences((current) => ({ ...current, [code]: next }));
    invalidateResult();
  };

  const handleGenerate = async () => {
    if (
      !catalog ||
      selected.length === 0 ||
      issues.length > 0 ||
      preferenceIssues.length > 0
    ) {
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const request = requestFor(programs, selected, preferences, constraints, 0);

    setLastRequest(request);
    setPage(0);
    setPageLoading(false);
    setPageError(null);
    setResultState({ status: "loading" });
    setSelectedRoutineId(null);
    setCustomRoutine(null);
    setLiveError(null);
    setSwapError(null);
    setStep(3);

    try {
      const result = await generateRoutines(request, controller.signal);

      if (controller.signal.aborted) return;
      setResultState({ status: "ready", result });
      setSelectedRoutineId(result.routines[0]?.id ?? null);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setResultState({ status: "error", message: errorMessage(error) });
    }
  };

  // Persist the student's choices only after they explicitly accept cookies.
  // Debounced so rapid live refinements don't hammer localStorage.
  useEffect(() => {
    if (!hydrated || consent !== "accepted") return;

    const timer = window.setTimeout(() => {
      writeSnapshot({
        v: SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
        programs,
        selectedCodes,
        constraints,
        preferences,
        step,
        selectedRoutineId,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    consent,
    programs,
    selectedCodes,
    constraints,
    preferences,
    step,
    selectedRoutineId,
  ]);

  // When a previous visit ended on the Timetable tab, regenerate the plans
  // once the catalog is ready so the routine is waiting for them.
  useEffect(() => {
    if (!restoreStep || !catalog || !hydrated) return;

    const timer = window.setTimeout(() => {
      void handleGenerate();
      setRestoreStep(null);
    }, reduceMotion ? 0 : 200);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreStep, catalog, hydrated, reduceMotion]);

  const handlePageChange = async (nextPage: number) => {
    if (
      !lastRequest ||
      nextPage < 0 ||
      pageLoading ||
      (nextPage === page && !pageError)
    ) {
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setPageLoading(true);
    setPageError(null);

    try {
      const result = await generateRoutines(
        { ...lastRequest, offset: nextPage * PAGE_SIZE },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (result.routines.length === 0 && result.total > 0) {
        setPageError({ page: nextPage, message: "No routines exist at this page offset." });
        return;
      }
      setResultState({ status: "ready", result });
      setPage(nextPage);
      setSelectedRoutineId(result.routines[0]?.id ?? null);
      setCustomRoutine(null);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setPageError({ page: nextPage, message: errorMessage(error) });
    } finally {
      if (!controller.signal.aborted) setPageLoading(false);
    }
  };

  const runLive = useCallback(
    async (
      nextConstraints: Constraints,
      nextPreferences: Record<string, CoursePreference>,
    ) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const request = requestFor(programs, selected, nextPreferences, nextConstraints, 0);

      setLastRequest(request);
      setLiveBusy(true);
      setLiveError(null);
      setPageLoading(false);
      setPageError(null);
      setCustomRoutine(null);
      setSwapError(null);

      try {
        const result = await generateRoutines(request, controller.signal);
        if (controller.signal.aborted) return;
        setResultState({ status: "ready", result });
        setPage(0);
        setPageError(null);
        setSelectedRoutineId(result.routines[0]?.id ?? null);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setLiveError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLiveBusy(false);
      }
    },
    [programs, selected],
  );

  const scheduleLive = (
    nextConstraints: Constraints,
    nextPreferences: Record<string, CoursePreference>,
  ) => {
    requestRef.current?.abort();
    swapRef.current?.abort();
    if (liveTimerRef.current !== null) window.clearTimeout(liveTimerRef.current);
    setLiveBusy(true);
    setLiveError(null);
    setPageLoading(false);
    setPageError(null);
    setPendingSwap(null);
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      void runLive(nextConstraints, nextPreferences);
    }, LIVE_DEBOUNCE_MS);
  };

  const handleAccept = () => {
    writeConsent("accepted");
    setConsent("accepted");
  };

  const handleDecline = () => {
    writeConsent("declined");
    clearSnapshot();
    setConsent("declined");
  };

  const handleForget = () => {
    // Clears the saved copy and stops writing new ones. The form on screen is
    // left alone so in-progress work is not thrown away without warning.
    clearSnapshot();
    writeConsent("declined");
    setConsent("declined");
  };

  const handleLiveConstraints = (next: Constraints) => {
    setConstraints(next);
    scheduleLive(next, preferences);
  };

  const handleMarkFull = (code: string, section: string) => {
    const preference = preferences[code] ?? emptyPreference();
    if (preference.excluded_sections.includes(section)) return;

    const nextPreferences: Record<string, CoursePreference> = {
      ...preferences,
      [code]: {
        ...preference,
        excluded_sections: [...preference.excluded_sections, section],
        allowed_sections: preference.allowed_sections.filter((item) => item !== section),
      },
    };
    setPreferences(nextPreferences);
    scheduleLive(constraints, nextPreferences);
  };

  const handleRestoreSection = (code: string, section: string) => {
    const preference = preferences[code] ?? emptyPreference();
    if (!preference.excluded_sections.includes(section)) return;

    const nextPreferences: Record<string, CoursePreference> = {
      ...preferences,
      [code]: {
        ...preference,
        excluded_sections: preference.excluded_sections.filter((item) => item !== section),
      },
    };
    setPreferences(nextPreferences);
    scheduleLive(constraints, nextPreferences);
  };

  const handleSwap = async (code: string, section: string) => {
    const base =
      customRoutine ??
      (resultState.status === "ready"
        ? (resultState.result.routines.find((routine) => routine.id === selectedRoutineId) ??
          resultState.result.routines[0])
        : undefined);
    if (!base) return;

    swapRef.current?.abort();
    const controller = new AbortController();
    swapRef.current = controller;

    setPendingSwap({ code, section });
    setSwapError(null);

    const assignments = new Map(base.courses.map((course) => [course.code, course.section]));
    assignments.set(code, section);
    const request = requestFor(programs, selected, preferences, constraints, 0);
    const pinnedRequest: GenerateRequest = {
      ...request,
      courses: base.courses.map((course) => ({
        code: course.code,
        allowed_sections: [assignments.get(course.code) ?? course.section],
        excluded_sections: [],
        preferred_faculty: preferences[course.code]?.preferred_faculty ?? [],
        excluded_faculty: preferences[course.code]?.excluded_faculty ?? [],
        manual_project: preferences[course.code]?.manual_project ?? null,
      })),
      limit: 1,
      offset: 0,
    };

    try {
      const result = await generateRoutines(pinnedRequest, controller.signal);
      if (controller.signal.aborted) return;
      const routine = result.routines[0];
      if (!routine) {
        setSwapError(
          result.diagnostics[0]?.message ?? "That swap leaves no valid timetable.",
        );
        return;
      }
      setCustomRoutine(routine);
      setSelectedRoutineId(null);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setSwapError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setPendingSwap(null);
    }
  };

  const handleSelect = (id: string) => {
    setCustomRoutine(null);
    setSwapError(null);
    setSelectedRoutineId(id);
  };

  const resultStatus =
    resultState.status === "loading"
      ? "loading"
      : resultState.status === "error"
        ? "error"
        : resultState.status === "ready"
          ? "ready"
          : "idle";

  return (
    <>
      <StepRail
        step={step}
        selectedCount={selectedCodes.length}
        hasResult={resultState.status !== "idle"}
        onSelect={setStep}
      />

      <main
        id="main"
        className="mx-auto w-full max-w-[1480px] px-[var(--space-gutter)] pb-16 sm:pb-20"
      >
        <div ref={panelRef} className="scroll-mt-2 pt-8 lg:pt-10">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.div
                key="courses"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : durations.panel, ease: "easeOut" }}
                className="mx-auto grid w-full max-w-[1180px] gap-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_21.5rem] xl:gap-14"
              >
                <CoursePicker
                  status={catalogState.status}
                  errorMessage={catalogState.status === "error" ? catalogState.message : undefined}
                  courses={visibleCourses}
                  totalCourses={catalog?.courses.length ?? 0}
                  query={query}
                  values={programs}
                  programs={catalog?.programs ?? programs}
                  counts={counts}
                  selectedCodes={selectedSet}
                  onQueryChange={setQuery}
                  onProgramChange={handleProgramChange}
                  onToggle={toggleCourse}
                  onRetry={() => {
                    setCatalogState({ status: "loading" });
                    setAttempt((value) => value + 1);
                  }}
                />

                <Docket
                  selected={selected}
                  catalogSize={catalog?.courses.length ?? 0}
                  busy={catalogState.status === "loading"}
                  onRemove={toggleCourse}
                  onClear={() => {
                    setSelectedCodes([]);
                    setPreferences({});
                    invalidateResult();
                  }}
                  onReview={() => setStep(2)}
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="constraints"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : durations.panel, ease: "easeOut" }}
                className="mx-auto w-full max-w-[1180px] min-w-0"
              >
                <ConstraintsPanel
                  selected={selected}
                  constraints={constraints}
                  issues={issues}
                  preferenceIssues={preferenceIssues}
                  preferences={preferences}
                  programs={programs}
                  status={resultState.status === "loading" ? "loading" : resultState.status === "error" ? "error" : "idle"}
                  error={resultState.status === "error" ? resultState.message : undefined}
                  headingRef={stepHeadingRef}
                  onConstraintsChange={handleConstraintsChange}
                  onPreferenceChange={handlePreferenceChange}
                  onBack={() => setStep(1)}
                  onGenerate={handleGenerate}
                  onRetry={handleGenerate}
                />
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="timetable"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : durations.panel, ease: "easeOut" }}
                className="min-w-0"
              >
                <ResultsPanel
                  status={resultStatus}
                  result={resultState.status === "ready" ? resultState.result : undefined}
                  error={resultState.status === "error" ? resultState.message : undefined}
                  selectedId={selectedRoutineId}
                  page={page}
                  pageLoading={pageLoading}
                  pageError={pageError}
                  headingRef={stepHeadingRef}
                  constraints={constraints}
                  catalog={catalog}
                  preferences={preferences}
                  customRoutine={customRoutine}
                  liveBusy={liveBusy}
                  liveError={liveError}
                  pendingSwap={pendingSwap}
                  swapError={swapError}
                  onConstraintsChange={handleLiveConstraints}
                  onSelect={handleSelect}
                  onSwap={handleSwap}
                  onMarkFull={handleMarkFull}
                  onRestoreSection={handleRestoreSection}
                  onClearCustom={() => {
                    setCustomRoutine(null);
                    setSwapError(null);
                  }}
                  onBack={() => setStep(2)}
                  onRetry={handleGenerate}
                  onPageChange={handlePageChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {hydrated && consent !== null && (
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-2 px-[var(--space-gutter)] pb-10 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <p className="mono-label text-ink-faint">
            Details stay in this browser · expire after 30 days
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {consent === "declined" ? (
              <button
                type="button"
                onClick={() => setConsent(null)}
                className="press mono-label cue-underline text-ink"
              >
                Save my details
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleForget}
              className="press mono-label cue-underline text-ink-faint hover:text-coral-ink"
            >
              Forget saved details
            </button>
          </div>
        </div>
      )}

      <ConsentBanner
        open={hydrated && consent === null}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </>
  );
}
