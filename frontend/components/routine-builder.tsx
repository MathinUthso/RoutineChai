"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { generateRoutines, getCatalog } from "@/lib/api";
import { durations, panelVariants } from "@/lib/motion";
import {
  defaultConstraints,
  validateConstraints,
} from "@/lib/schedule";
import type {
  CatalogResponse,
  Constraints,
  Course,
  CoursePreference,
  GenerateResult,
  Program,
} from "@/lib/types";
import { ConstraintsPanel } from "./constraints-panel";
import { CoursePicker } from "./course-picker";
import { Docket } from "./docket";
import { ResultsPanel } from "./results-panel";
import { StepRail } from "./step-rail";

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; catalog: CatalogResponse };

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: GenerateResult };

const PROGRAM_OPTIONS: Program[] = ["BSCSE", "BSDS"];

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
  const [program, setProgram] = useState<Program>("BSCSE");
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<Constraints>(() => defaultConstraints());
  const [preferences, setPreferences] = useState<Record<string, CoursePreference>>({});
  const [resultState, setResultState] = useState<ResultState>({ status: "idle" });
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getCatalog(controller.signal)
      .then((catalog) => setCatalogState({ status: "ready", catalog }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogState({ status: "error", message: errorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    return () => requestRef.current?.abort();
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
    if (!catalog) return { BSCSE: 0, BSDS: 0 };
    return {
      BSCSE: catalog.courses.filter((course) => course.programs.includes("BSCSE")).length,
      BSDS: catalog.courses.filter((course) => course.programs.includes("BSDS")).length,
    };
  }, [catalog]);

  const visibleCourses = useMemo(() => {
    if (!catalog) return [];
    return catalog.courses.filter(
      (course) =>
        course.programs.includes(program) && matchesQuery(course, query),
    );
  }, [catalog, program, query]);

  const selected = useMemo(() => {
    if (!catalog) return [];
    return selectedCodes
      .map((code) => catalog.courses.find((course) => course.code === code))
      .filter((course): course is Course => Boolean(course));
  }, [catalog, selectedCodes]);

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const issues = useMemo(() => validateConstraints(constraints), [constraints]);

  const invalidateResult = () => {
    requestRef.current?.abort();
    setResultState({ status: "idle" });
    setSelectedRoutineId(null);
  };

  const handleProgramChange = (next: string) => {
    const nextProgram: Program = next === "BSDS" ? "BSDS" : "BSCSE";
    if (nextProgram === program) return;

    setProgram(nextProgram);
    setStep(1);
    invalidateResult();

    if (!catalog) return;
    const offered = new Set(
      catalog.courses
        .filter((course) => course.programs.includes(nextProgram))
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
    if (!catalog || selected.length === 0 || issues.length > 0) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setResultState({ status: "loading" });
    setSelectedRoutineId(null);
    setStep(3);

    try {
      const result = await generateRoutines(
        {
          program,
          courses: selected.map((course) => {
            const preference = preferences[course.code];
            return {
              code: course.code,
              allowed_sections: preference?.allowed_sections ?? [],
              preferred_faculty: preference?.preferred_faculty ?? [],
            };
          }),
          constraints,
          limit: 10,
        },
        controller.signal,
      );

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

      <main className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)] pb-16 sm:pb-20">
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
                className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_21.5rem] xl:gap-14"
              >
                <CoursePicker
                  status={catalogState.status}
                  errorMessage={catalogState.status === "error" ? catalogState.message : undefined}
                  courses={visibleCourses}
                  totalCourses={catalog?.courses.length ?? 0}
                  query={query}
                  program={program}
                  programs={PROGRAM_OPTIONS}
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
                className="min-w-0"
              >
                <ConstraintsPanel
                  selected={selected}
                  constraints={constraints}
                  issues={issues}
                  preferences={preferences}
                  program={program}
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
                  headingRef={stepHeadingRef}
                  onSelect={setSelectedRoutineId}
                  onBack={() => setStep(2)}
                  onRetry={handleGenerate}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}
