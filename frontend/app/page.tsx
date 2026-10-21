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
            <span className="font-mono text-[0.75rem] normal-case tracking-[-0.01em] text-ink">
              routineChai
            </span>
            {" · UIU Fall 2026 routine planner"}
          </p>
          <p className="mono-label leading-relaxed text-ink-faint">
            Built with caffine and AI
          </p>
        </div>
      </footer>
    </>
  );
}
