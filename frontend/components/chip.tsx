"use client";

import { CheckIcon } from "./icons";

type ChipProps = {
  pressed: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

export function Chip({ pressed, label, title, onClick, disabled, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 border px-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] leading-none transition-colors duration-[var(--duration-quick)] ${
        pressed
          ? "border-green bg-green text-paper"
          : "border-rule bg-paper text-ink-soft hover:border-ink hover:text-ink"
      } disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper-sunk disabled:text-ink-faint`}
    >
      {pressed && <CheckIcon className="h-3 w-3 shrink-0" />}
      {children}
    </button>
  );
}
