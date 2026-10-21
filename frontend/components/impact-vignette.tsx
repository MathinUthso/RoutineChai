"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ReplayIcon } from "./icons";

/**
 * The raster is 800×695: the bottom 30% of the source has already been
 * cropped away so the campus sits on the header's baseline. The three clip
 * regions follow the gaps between the left, centre, and UIU towers.
 */
const BUILDINGS = [
  { clipPath: "inset(0 69% 0 0)", delay: 0.08 },
  { clipPath: "inset(0 46% 0 31%)", delay: 0.2 },
  { clipPath: "inset(0 0 0 54%)", delay: 0.32 },
] as const;

const ENTRANCE = {
  duration: 0.82,
  ease: [0.16, 1, 0.3, 1] as const,
};

export function ImpactVignette() {
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState(0);

  return (
    <div className="relative w-[clamp(260px,72vw,420px)] lg:w-[clamp(300px,30vw,440px)]">
      <div
        className="relative aspect-[800/695] overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, #000 0%, #000 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 90%, transparent 100%)",
        }}
      >
        {BUILDINGS.map((building, index) => (
          <motion.div
            aria-hidden
            key={`${run}-${index}`}
            initial={reduceMotion ? false : { y: 38, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    ...ENTRANCE,
                    delay: building.delay,
                  }
            }
            className="absolute inset-0 will-change-transform"
            style={{
              clipPath: building.clipPath,
              backgroundImage: "url('/assets/uiu-buildings.webp')",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 100%",
              transformOrigin: "50% 100%",
            }}
          />
        ))}
      </div>

      {!reduceMotion ? (
        <button
          type="button"
          onClick={() => setRun((value) => value + 1)}
          aria-label="Replay building entrance animation"
          title="Replay"
          className="absolute right-0 top-0 inline-flex p-1 text-ink-faint/55 transition-colors duration-[var(--duration-quick)] hover:text-ink focus-visible:text-ink focus-visible:outline-none"
        >
          <ReplayIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
