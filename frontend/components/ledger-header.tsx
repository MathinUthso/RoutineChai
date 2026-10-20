"use client";

import { motion, useReducedMotion } from "framer-motion";

const tickerItems = [
  "Fall 2026",
  "Sat–Wed teaching week",
  "08:30–16:30",
  "Asia/Dhaka",
  "Registrar export",
];

function TickerCopy() {
  return (
    <div className="flex shrink-0 items-center">
      {tickerItems.map((item) => (
        <span key={item} className="flex items-center">
          <span className="whitespace-nowrap px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/90 sm:px-6">
            {item}
          </span>
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-coral" />
        </span>
      ))}
    </div>
  );
}

export function LedgerHeader() {
  const reduceMotion = useReducedMotion();

  return (
    <header className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)]">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule py-3"
        >
          <div className="flex items-center gap-3">
            <motion.span
              aria-hidden
              initial={reduceMotion ? false : { opacity: 0, rotate: -8, scale: 0.82 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.08 }}
              className="grid h-9 w-9 place-items-center border border-green font-mono text-[11px] font-medium tracking-[0.06em] text-green"
            >
              UIU
            </motion.span>
            <p className="mono-label leading-none text-ink-soft">Office of the Registrar</p>
          </div>

          <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-ink-faint">
            <span className="hidden tabular sm:inline">Sheet R-01</span>
            <span aria-hidden className="hidden h-3 w-px bg-rule sm:inline-block" />
            <span className="flex items-center gap-1.5 text-coral-ink">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
              Draft
            </span>
          </div>
        </motion.div>

        <div className="grid gap-5 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16 lg:py-12">
          <motion.h1
            aria-label="Fall 2026 routine generator"
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
            }}
            className="text-[clamp(3.4rem,13.5vw,8.75rem)] font-medium leading-[0.78] tracking-[-0.065em] text-ink"
          >
            <span aria-hidden className="flex flex-wrap items-baseline gap-x-[0.14em]">
              <motion.span
                variants={{
                  hidden: { clipPath: "inset(0 0 100% 0)", y: "0.16em", opacity: 0 },
                  show: {
                    clipPath: "inset(0 0 0% 0)",
                    y: "0em",
                    opacity: 1,
                    transition: { duration: 0.7, ease: "easeOut" },
                  },
                }}
                className="inline-block"
              >
                Fall
              </motion.span>
              <motion.span
                variants={{
                  hidden: { clipPath: "inset(0 0 100% 0)", y: "0.16em", opacity: 0 },
                  show: {
                    clipPath: "inset(0 0 0% 0)",
                    y: "0em",
                    opacity: 1,
                    transition: { duration: 0.7, ease: "easeOut" },
                  },
                }}
                className="inline-block text-green"
              >
                2026
              </motion.span>
            </span>
          </motion.h1>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
            className="max-w-[24ch] lg:pb-1 lg:text-right"
          >
            <p className="mono-label text-ink-faint">Course registration</p>
            <p className="mt-1.5 text-[0.95rem] leading-snug text-ink-soft">
              Build a clash-free term.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="relative overflow-hidden border-y border-green-deep bg-green-deep text-paper">
        <p className="sr-only">
          Fall 2026. Saturday through Wednesday teaching week. 08:30 to 16:30. Asia/Dhaka.
          Registrar export.
        </p>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-green-deep to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-green-deep to-transparent" />

        <motion.div
          aria-hidden
          animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 26, ease: "linear", repeat: Infinity }}
          className="flex w-max py-2.5 will-change-transform"
        >
          <TickerCopy />
          <TickerCopy />
        </motion.div>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)]" aria-hidden>
        <motion.div
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="h-px origin-left bg-ink/75"
        />
        <motion.div
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-[3px] h-px origin-left bg-rule"
        />
      </div>
    </header>
  );
}
