"use client";

import { buildRoutineCalendar, calendarFilename } from "@/lib/calendar";
import type { Routine } from "@/lib/types";
import { CalendarIcon } from "./icons";

/** Builds the .ics in the browser and hands it to the download prompt. */
function downloadCalendar(routine: Routine) {
  const blob = new Blob([buildRoutineCalendar(routine)], {
    type: "text/calendar;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = calendarFilename(routine);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * The .ics download for one plan. Shared by the planner and the read-only
 * share page so both export exactly the same file.
 */
export function CalendarDownload({ routine }: { routine: Routine }) {
  return (
    <button
      type="button"
      onClick={() => downloadCalendar(routine)}
      title="Download every class as a weekly .ics from the next occurrence. Verify dates before relying on it."
      className="press inline-flex min-h-9 items-center gap-1.5 border border-rule-strong px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink hover:border-ink hover:bg-paper focus-visible:border-ink"
    >
      <CalendarIcon className="h-3.5 w-3.5" />
      Google Calendar
    </button>
  );
}
