/** Shared course tints so plan cards, the section board, and the weekly grid
 *  colour a course the same way. */
export type Tone = "clay" | "moss" | "slate" | "sand" | "rose" | "iris";

export const TONE_CLASS: Record<Tone, { block: string; code: string; dot: string }> = {
  clay: {
    block: "bg-course-clay border-l-course-clay-ink",
    code: "text-course-clay-ink",
    dot: "bg-course-clay-ink",
  },
  moss: {
    block: "bg-course-moss border-l-course-moss-ink",
    code: "text-course-moss-ink",
    dot: "bg-course-moss-ink",
  },
  slate: {
    block: "bg-course-slate border-l-course-slate-ink",
    code: "text-course-slate-ink",
    dot: "bg-course-slate-ink",
  },
  sand: {
    block: "bg-course-sand border-l-course-sand-ink",
    code: "text-course-sand-ink",
    dot: "bg-course-sand-ink",
  },
  rose: {
    block: "bg-course-rose border-l-course-rose-ink",
    code: "text-course-rose-ink",
    dot: "bg-course-rose-ink",
  },
  iris: {
    block: "bg-course-iris border-l-course-iris-ink",
    code: "text-course-iris-ink",
    dot: "bg-course-iris-ink",
  },
};

const TONES = Object.keys(TONE_CLASS) as Tone[];

/** Deterministic tone for a course code. */
export function toneFor(code: string): Tone {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return TONES[(hash >>> 0) % TONES.length];
}
