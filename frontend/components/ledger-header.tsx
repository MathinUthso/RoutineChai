"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BrandMark } from "./brand-mark";
import { ImpactVignette } from "./impact-vignette";
import { MurgiIcon } from "./icons";

const tickerItems = [
  "routineChai",
  "Fall 2026",
  "Sat–Wed classes",
  "Clash-free routines only",
  "Room TBA builds character",
  "Thu–Fri recovery arc",
  "Bring a charger",
  "Sleep is a valid elective",
];

function TickerCopy() {
  return (
    <div className="flex shrink-0 items-center">
      {tickerItems.map((item) => (
        <span key={item} className="flex items-center">
          <span
            className={`whitespace-nowrap px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/90 sm:px-6 ${
              item === "routineChai" ? "normal-case tracking-[0.04em]" : ""
            }`}
          >
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
              className="grid h-9 w-9 place-items-center border border-green text-green"
            >
              <BrandMark className="h-5 w-5" />
            </motion.span>
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 leading-none">
              <span className="font-mono text-[0.9375rem] tracking-[-0.01em] text-ink">
                routineChai
              </span>
              <span className="mono-label text-ink-faint">UIU Fall 2026 planner</span>
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em] text-ink-faint">
            <MurgiIcon className="h-4 w-4 text-green" />
            <span>Built by Murgi</span>
          </div>
        </motion.div>

        <div className="relative pb-8 pt-8 sm:pt-10 lg:min-h-[clamp(340px,30vw,410px)] lg:pb-0 lg:pt-12">
          <div className="relative z-10 min-w-0">
            <motion.h1
              aria-label="Fall 2026 routine generator"
              initial={reduceMotion ? false : "hidden"}
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
              }}
              className="text-[clamp(3.4rem,12vw,8.75rem)] font-medium leading-[0.78] tracking-[-0.065em] text-ink"
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
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
              className="mt-4 max-w-[32ch]"
            >
              <p className="mono-label text-ink-faint">UIU routine planner</p>
              <p className="mt-1.5 text-[0.95rem] leading-snug text-ink-soft">
                Build a clash-free term.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.18, ease: "easeOut" }}
            className="relative z-0 mt-7 -mb-8 flex justify-end lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:mb-0"
          >
            <ImpactVignette />
          </motion.div>
        </div>
      </div>

      <div className="relative overflow-hidden border-y border-green-deep bg-green-deep text-paper">
        <p className="sr-only">
          routineChai for UIU Fall 2026. Classes run Saturday through Wednesday, 8:30 AM to 4:30
          PM, Asia/Dhaka. Build clash-free weekly routines around your blocked hours. Built by
          Murgi.
        </p>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-green-deep to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-green-deep to-transparent" />

        <motion.div
          aria-hidden
          animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 40, ease: "linear", repeat: Infinity }}
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
