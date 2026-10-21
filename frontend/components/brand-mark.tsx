/**
 * The routineChai mark: a cut-chai glass with steam, drawn in the ledger's
 * green with coral steam. Inherit the surrounding text colour to reuse it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 12.5h12l-1.3 9.6a1.6 1.6 0 0 1-1.6 1.4h-6a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M8.8 12.5h14.4" />
      <path d="M11.4 27h9.2" />
      <path d="M13.6 9.2c0-1.3 1.1-1.6 1.1-2.9" stroke="var(--coral)" />
      <path d="M17.6 9.6c0-1.4 1.1-1.7 1.1-3.1" stroke="var(--coral)" />
    </svg>
  );
}
