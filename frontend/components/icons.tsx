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

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="0.5" />
      <path d="M2.25 6.25h11.5M5.25 2v2.5M10.75 2v2.5" />
      <path d="M5 8.75h1M7.5 8.75h1M10 8.75h1M5 11h1M7.5 11h1" />
    </svg>
  );
}
