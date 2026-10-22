"use client";

import { formatMeeting } from "@/lib/schedule";
import type { Routine } from "@/lib/types";

/** The courses-and-meetings table for one plan. */
export function RoutineCourses({ routine }: { routine: Routine }) {
  return (
    <div className="border-t border-rule">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-3">
        <h4 className="mono-label text-ink">Courses</h4>
        <p className="mono-label tabular text-ink-faint">
          {routine.courses.length} courses · {routine.stats.total_credits.toFixed(1)} credits
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">Courses and meetings in routine {routine.id}</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="mono-label px-4 py-2.5 text-ink-faint">
                Course
              </th>
              <th scope="col" className="mono-label hidden px-4 py-2.5 text-ink-faint sm:table-cell">
                Section
              </th>
              <th scope="col" className="mono-label px-4 py-2.5 text-ink-faint">
                Meetings
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/70">
            {routine.courses.map((course) => (
              <tr key={course.code}>
                <td className="px-4 py-3 align-top">
                  <p className="font-mono text-[0.75rem] font-medium text-ink">{course.code}</p>
                  <p className="mt-0.5 max-w-[18rem] text-[0.8125rem] leading-snug text-ink-soft">
                    {course.title}
                  </p>
                  <p className="mono-label mt-1 flex flex-wrap items-center gap-1.5 text-ink-faint">
                    <span>
                      {course.kind === "lab" ? "Lab" : "Theory"} · {course.faculty}
                    </span>
                    {course.manual && (
                      <span className="border border-coral/45 px-1 py-0.5 text-[0.5625rem] tracking-[0.1em] text-coral-ink">
                        Manual
                      </span>
                    )}
                  </p>
                </td>
                <td className="hidden px-4 py-3 align-top sm:table-cell">
                  <span className="inline-flex border border-rule px-1.5 py-1 font-mono text-[0.75rem] text-ink">
                    {course.section}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <ul className="space-y-1">
                    {course.meetings.map((meeting, index) => (
                      <li
                        key={`${meeting.day}-${meeting.start}-${index}`}
                        className="font-mono text-[0.7rem] leading-relaxed tabular text-ink-soft"
                      >
                        {formatMeeting(meeting)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
