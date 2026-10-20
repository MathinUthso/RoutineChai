import { LedgerHeader } from "@/components/ledger-header";
import { RoutineBuilder } from "@/components/routine-builder";

export default function Page() {
  return (
    <>
      <LedgerHeader />
      <div className="ledger-rules flex-1">
        <RoutineBuilder />
      </div>
      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-[var(--space-gutter)] py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
          <p className="mono-label text-ink-faint">
            United International University · Office of the Registrar
          </p>
          <p className="mono-label leading-relaxed text-ink-faint">
            Generated from the Fall 2026 registrar PDF; verify before registration.
          </p>
        </div>
      </footer>
    </>
  );
}
