"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Ambient timetable behind the planner.
 *
 * A five-day grid with two settled blocks and one block that drifts down a
 * column every half minute, like a section being slotted into the week. It is
 * decorative, fixed, and held far below the content; the static composition
 * carries the world when motion is reduced.
 */
export function AmbientLedger() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const motionOff = reduceMotion || !visible;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="ambient-grid absolute inset-0 opacity-70" />

      <motion.div
        className="absolute left-[40.4%] top-0 h-[92px] w-[19.2%] border border-green/20 bg-green/[0.045]"
        initial={false}
        animate={
          motionOff
            ? { y: 276, opacity: 0.45 }
            : {
                y: [96, 640],
                opacity: [0, 0.42, 0.42, 0],
              }
        }
        transition={
          motionOff
            ? { duration: 0 }
            : {
                duration: 26,
                times: [0, 0.14, 0.82, 1],
                repeat: Infinity,
                repeatDelay: 5,
                ease: "linear",
              }
        }
      >
        <span className="absolute inset-x-0 top-0 h-[2px] bg-green/30" />
        <span className="absolute bottom-2 left-2 h-px w-8 bg-green/20" />
      </motion.div>
    </div>
  );
}
