type IconProps = {
  className?: string;
};

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6.75" cy="6.75" r="4.25" />
      <path d="M10 10l4 4" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.8}>
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.2}>
      <rect x="3.25" y="7" width="9.5" height="6.25" />
      <path d="M5.5 7V5.25a2.5 2.5 0 015 0V7" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 2.5v6.25" />
      <path d="M8 12v1.5" strokeWidth={2} />
    </svg>
  );
}

export function ReplayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.25 5.25v3h3" />
      <path d="M4.1 8.05a4.35 4.35 0 1 0 .55-3.35" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="0.5" />
      <path d="M2.25 6.25h11.5M5.25 2v2.5M10.75 2v2.5" />
      <path d="M5 8.75h1M7.5 8.75h1M10 8.75h1M5 11h1M7.5 11h1" />
    </svg>
  );
}

/** Share node: one plan handed out to two readers. */
export function ShareIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="3.9" cy="8" r="1.55" />
      <circle cx="12.1" cy="3.9" r="1.55" />
      <circle cx="12.1" cy="12.1" r="1.55" />
      <path d="M5.3 7.3l5.4-2.7M5.3 8.7l5.4 2.7" />
    </svg>
  );
}

/** Murgi, the bird behind the planner. */
export function MurgiIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={1.2}>
      <path d="M7.4 4.2c-.4-.8-.1-1.7.7-2.1.1.6.5 1 1.1 1.2.3-.7 1-1.1 1.7-1-.1.6.1 1.2.5 1.5" />
      <path d="M10.2 3.9c1.4 0 2.5 1.1 2.5 2.5v1.5c0 2.2-1.8 4-4 4H8.1c-1.9 0-3.5-1.6-3.5-3.5V7.6c0-1 .8-1.8 1.8-1.8h1" />
      <path d="M12.7 6.5l2.1 1-2.1 1.1" />
      <circle cx="10.2" cy="6.1" r="0.55" fill="currentColor" stroke="none" />
      <path d="M10.2 9.1c.6.5.8 1.4.4 2.1" />
    </svg>
  );
}
