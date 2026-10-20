export function LedgerHeader() {
  return (
    <header>
      <div className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)]">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-rule py-4">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center border border-green font-mono text-[11px] font-medium tracking-[0.06em] text-green"
            >
              UIU
            </span>
            <p className="font-mono text-[10.5px] leading-[1.45] uppercase tracking-[0.15em] text-ink-soft">
              Office of the Registrar
              <span className="block text-ink-faint">United International University</span>
            </p>
          </div>

          <dl className="flex items-start gap-6 font-mono text-[10.5px] uppercase tracking-[0.13em]">
            <div className="hidden sm:block">
              <dt className="text-ink-faint">Term</dt>
              <dd className="mt-0.5 text-ink">Fall 2026</dd>
            </div>
            <div className="hidden md:block">
              <dt className="text-ink-faint">Sheet</dt>
              <dd className="mt-0.5 text-ink tabular">R-01</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Status</dt>
              <dd className="mt-0.5 text-coral-ink">Draft</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Catalog</dt>
              <dd className="mt-0.5 border border-green/40 px-1.5 py-px text-green">
                Registrar export
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-7 py-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end lg:gap-16 lg:py-12">
          <div>
            <p className="mono-label text-ink-faint">Course registration · Fall 2026</p>
            <h1 className="mt-3 max-w-[18ch] text-display font-medium tracking-[-0.03em] text-balance text-ink">
              Build your term, line by line.
            </h1>
          </div>
          <div className="max-w-[36ch] lg:justify-self-end lg:text-right">
            <p className="text-lead text-ink-soft">
              Pick the courses you intend to take. The registrar places each section inside the
              hours you keep free and hands back the clash-free sheets.
            </p>
            <p className="mono-label mt-4 text-ink-faint">
              Sat–Wed teaching week · Asia/Dhaka
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)]" aria-hidden>
        <div className="border-t border-ink/75" />
        <div className="mt-[3px] border-t border-rule" />
      </div>
    </header>
  );
}
