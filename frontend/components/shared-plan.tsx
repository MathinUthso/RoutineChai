"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCatalog } from "@/lib/api";
import { resolveSharedPlan, type SharedPlan } from "@/lib/share";
import type { CatalogResponse } from "@/lib/types";
import { CalendarDownload } from "./calendar-download";
import { RoutineCourses } from "./routine-courses";
import { WeeklyCalendar } from "./weekly-calendar";

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; catalog: CatalogResponse };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The routine service could not be reached.";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const PRIMARY_CLASS =
  "press inline-flex min-h-11 items-center border border-ink px-4 text-[0.9375rem] text-ink hover:bg-ink hover:text-paper";

const CAVEAT_CLASS = "border border-coral/60 bg-coral-tint/30 px-4 py-3";

/**
 * The read-only view a receiver gets from a share link. Titles, rooms and
 * faculty always come from the catalog this browser just fetched, so a link
 * can never show a section the registrar has since changed.
 */
export function SharedPlanView({ plan, token }: { plan: SharedPlan; token: string }) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getCatalog(controller.signal)
      .then((catalog) => setState({ status: "ready", catalog }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: errorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <div aria-busy>
        <div className="h-[26rem] animate-pulse border border-rule bg-paper-raised" />
        <p className="sr-only">Loading the catalog…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="border border-coral/60 bg-paper-raised px-5 py-5">
        <p className="mono-label text-coral-ink">The catalog did not answer</p>
        <h1 className="mt-1 text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
          The shared routine could not be checked against the catalog.
        </h1>
        <p className="mt-2 max-w-[64ch] text-[0.875rem] leading-relaxed text-ink-soft">
          {state.message}
        </p>
        <button type="button" onClick={retry} className={`${PRIMARY_CLASS} mt-4`}>
          Try again
        </button>
      </div>
    );
  }

  const resolved = resolveSharedPlan(plan, state.catalog);

  if (resolved.routine.courses.length === 0) {
    return (
      <div className="border border-rule bg-paper-raised shadow-sheet">
        <div className="border-b border-rule px-5 py-4">
          <p className="mono-label text-coral-ink">Catalog changed</p>
          <h1 className="mt-1 text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
            This link points at sections the current catalog no longer has.
          </h1>
        </div>
        <div className="px-5 py-5">
          {resolved.missing.length > 0 ? (
            <ul className="space-y-1">
              {resolved.missing.map((item) => (
                <li
                  key={`${item.code}-${item.section}`}
                  className="font-mono text-[0.75rem] leading-relaxed text-ink-soft"
                >
                  {item.code} · {item.section}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] leading-relaxed text-ink-soft">
              This link does not name any sections.
            </p>
          )}
          <Link href="/" className={`${PRIMARY_CLASS} mt-4`}>
            Open the planner
          </Link>
        </div>
      </div>
    );
  }

  const { routine, programs, missing } = resolved;
  const owner = plan.n;
  const programLabel = programs.join(" + ");
  const meta = [
    programLabel,
    countLabel(routine.courses.length, "course", "courses"),
    `${countLabel(routine.stats.campus_days, "day", "days")} on campus`,
    `${routine.stats.total_credits.toFixed(1)} credits`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <div className={CAVEAT_CLASS}>
        <p className="mono-label text-coral-ink">Before you rely on it</p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
          This plan came from a link. Anyone who has the link can read it. Check every meeting
          against the registrar notice before you register.
        </p>
      </div>

      <div className="border border-rule bg-paper-raised shadow-sheet">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <p className="mono-label text-ink-faint">Shared routine</p>
            <h1 className="mt-1 text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
              {owner ? `${owner}'s Fall 2026 routine` : "A Fall 2026 routine, shared with you"}
            </h1>
            <p className="mono-label mt-1 text-ink-faint">{meta}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <CalendarDownload routine={routine} />
          </div>
        </div>

        <WeeklyCalendar routine={routine} />
        <RoutineCourses routine={routine} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule px-5 py-4">
          <Link href={`/?plan=${token}`} className={PRIMARY_CLASS}>
            Use this plan
          </Link>
          <p className="max-w-[46ch] text-[0.8125rem] leading-relaxed text-ink-faint">
            Loads these sections into your planner as pinned starting points. Change anything you
            like.
          </p>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className={CAVEAT_CLASS}>
          <p className="mono-label text-coral-ink">Dropped from this link</p>
          <ul className="mt-1.5 space-y-1">
            {missing.map((item) => (
              <li
                key={`${item.code}-${item.section}`}
                className="text-[0.8125rem] leading-relaxed text-ink-soft"
              >
                <span className="font-mono text-[0.75rem] text-ink">{item.code}</span>
                {" · section "}
                <span className="font-mono text-[0.75rem] text-ink">{item.section}</span> is not in
                the current catalog.
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-faint">
            The rest of the plan is shown.
          </p>
        </div>
      ) : null}
    </div>
  );
}
