"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface ConsentBannerProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * One-time privacy prompt. The student decides whether their routine details
 * are kept in the browser; nothing is stored until they accept.
 */
export function ConsentBanner({ open, onAccept, onDecline }: ConsentBannerProps) {
  const reduceMotion = useReducedMotion();

  if (!open) return null;

  return (
    <motion.div
      role="dialog"
      aria-label="Save your routine details?"
      aria-describedby="routinechai-consent-detail"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }
      }
      className="fixed inset-x-0 bottom-0 z-50 px-[var(--space-gutter)] pb-[var(--space-gutter)]"
    >
      <div className="mx-auto w-full max-w-[1180px] border border-ink/15 bg-paper-raised shadow-sheet">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
          <div className="min-w-0 flex-1">
            <h2 className="mono-label text-ink">Save your routine details?</h2>
            <p
              id="routinechai-consent-detail"
              className="mt-2 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-soft"
            >
              Keep your courses, blocked hours, live limits, and chosen plan in this browser so
              you do not retype them on every visit. It never leaves your device and expires
              after 30 days.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={onAccept}
              className="press inline-flex min-h-11 items-center justify-center border border-green bg-green px-4 py-2 text-[0.875rem] font-medium text-paper hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-coral"
            >
              Save my details
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="press inline-flex min-h-11 items-center justify-center border border-rule px-4 py-2 text-[0.875rem] text-ink-soft hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-coral"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
