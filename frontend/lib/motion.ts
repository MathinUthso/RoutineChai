/**
 * Motion tokens. Durations and easings mirror the CSS custom properties in
 * app/globals.css; springs live here because CSS cannot express them.
 */
export const spring = {
  /** Selection feedback: quick settle, no visible bounce. */
  select: { type: "spring", stiffness: 420, damping: 36, mass: 0.7 },
  /** Layout moves such as chips re-ordering. */
  layout: { type: "spring", stiffness: 320, damping: 32, mass: 0.9 },
  /** Progress rails and step indicators. */
  rail: { type: "spring", stiffness: 220, damping: 30, mass: 0.8 },
} as const;

export const durations = {
  quick: 0.14,
  base: 0.22,
  panel: 0.26,
} as const;

export const panelVariants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};
