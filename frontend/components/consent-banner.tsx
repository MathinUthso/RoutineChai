"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ConsentDecision } from "@/lib/persist";
import { CheckIcon, CloseIcon } from "./icons";

export interface ConsentBannerProps {
  /** null until the student has answered the prompt. */
  decision: ConsentDecision | null;
  /** True when a snapshot is stored. */
  stored: boolean;
  /** True when the browser refused to store anything. */
  storageBlocked: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onForget: () => void;
}

/**
 * The one place on the page that talks about stored details. It asks once,
 * then collapses into a small corner chip so nothing sits over the planner.
 */
export function ConsentBanner({
  decision,
  stored,
  storageBlocked,
  onAccept,
  onDecline,
  onForget,
}: ConsentBannerProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const answered = decision !== null;
  const expanded = !answered || open;

  const chipLabel = storageBlocked
    ? "Not Saved"
    : decision === "accepted"
      ? "Details Saved"
      : decision === "declined"
        ? "Not Saving"
        : "Details";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:justify-end sm:px-0 sm:pb-0">
      <motion.div
        layout={!reduceMotion}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        className="pointer-events-auto w-full max-w-[21rem]"
      >
        {expanded ? (
          <div
            role="dialog"
            aria-label="Save your routine details"
            className="border border-ink/20 bg-paper-raised p-4 shadow-sheet"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="mono-label text-ink">
                {answered ? "Details" : "Save My Details"}
              </h2>
              {answered ? (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close details options"
                  className="press -mr-1 -mt-1 grid h-8 w-8 place-items-center text-ink-faint hover:text-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {answered ? (
              <>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
                  {storageBlocked
                    ? "This browser is blocking cookies, so details cannot be saved."
                    : decision === "accepted" && stored
                      ? "Your courses, limits, and plan are saved in this browser for 30 days."
                      : "Details are not saved in this browser."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {decision === "accepted" && stored ? (
                    <button
                      type="button"
                      onClick={() => {
                        onForget();
                        setOpen(false);
                      }}
                      className="press inline-flex min-h-9 items-center justify-center border border-rule px-3 text-[0.8125rem] text-ink-soft hover:border-coral hover:text-coral-ink"
                    >
                      Forget Saved Details
                    </button>
                  ) : null}
                  {decision === "declined" ? (
                    <button
                      type="button"
                      onClick={() => {
                        onAccept();
                        setOpen(false);
                      }}
                      className="press inline-flex min-h-9 items-center justify-center border border-green bg-green px-3 text-[0.8125rem] font-medium text-paper hover:bg-green-deep"
                    >
                      Save My Details
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
                  Keep your courses, limits, and plan in this browser for 30 days. It never leaves
                  your device.
                </p>

                {storageBlocked ? (
                  <p
                    role="status"
                    className="mt-2 border-l-2 border-coral/70 pl-2 text-[0.75rem] leading-relaxed text-coral-ink"
                  >
                    This browser is blocking cookies, so details cannot be saved.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onAccept}
                    className="press inline-flex min-h-9 items-center justify-center border border-green bg-green px-3 text-[0.8125rem] font-medium text-paper hover:bg-green-deep"
                  >
                    Save My Details
                  </button>
                  <button
                    type="button"
                    onClick={onDecline}
                    className="press inline-flex min-h-9 items-center justify-center border border-rule px-3 text-[0.8125rem] text-ink-soft hover:border-ink hover:text-ink"
                  >
                    Not Now
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-label={`${chipLabel}. Open details options`}
            onClick={() => setOpen(true)}
            className="press inline-flex min-h-9 items-center gap-1.5 border border-rule bg-paper-raised px-2.5 py-1.5 text-[0.6875rem] text-ink-soft shadow-sheet hover:border-ink hover:text-ink"
          >
            {storageBlocked ? (
              <CloseIcon className="h-3.5 w-3.5 text-coral-ink" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5 text-green" />
            )}
            <span className="mono-label">{chipLabel}</span>
          </button>
        )}
      </motion.div>
    </div>
  );
}
