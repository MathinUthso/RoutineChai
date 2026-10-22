import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SharedPlanView } from "@/components/shared-plan";
import { decodeSharedPlan } from "@/lib/share";

export const metadata: Metadata = {
  title: "Shared routine · routineChai",
  description: "A Fall 2026 routine shared from the UIU routine planner.",
  // These URLs are handed out privately, so keep them out of search results.
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <>
      <header className="border-b border-rule bg-paper-raised">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-[var(--space-gutter)] py-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-7 w-7 text-green" />
            <span className="font-mono text-[0.75rem] tracking-[-0.01em] text-ink">
              routineChai
            </span>
          </Link>
          <p className="mono-label text-ink-faint">UIU Fall 2026 planner</p>
        </div>
      </header>

      <main className="ledger-rules flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-[var(--space-gutter)] py-8 sm:py-10">
          <Suspense
            fallback={
              <div>
                <div className="h-[26rem] animate-pulse border border-rule bg-paper-raised" />
                <p className="sr-only">Reading the shared routine…</p>
              </div>
            }
          >
            <SharedRoutine params={params} />
          </Suspense>
          <p className="mono-label mt-6 text-ink-faint">
            Verify every meeting against the registrar notice.
          </p>
        </div>
      </main>
    </>
  );
}

async function SharedRoutine({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = decodeSharedPlan(token);

  if (!plan) {
    return (
      <div className="border border-rule bg-paper-raised shadow-sheet px-5 py-6">
        <p className="mono-label text-coral-ink">Broken link</p>
        <h1 className="mt-2 text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
          This is not a routine link.
        </h1>
        <p className="mt-2 max-w-[60ch] text-[0.875rem] leading-relaxed text-ink-soft">
          The link may have been cut short, or it was made by a different version of the planner.
          Ask the sender to share it again.
        </p>
        <Link
          href="/"
          className="press mt-5 inline-flex min-h-11 items-center border border-ink px-4 text-[0.9375rem] text-ink hover:bg-ink hover:text-paper"
        >
          Open the planner
        </Link>
      </div>
    );
  }

  return <SharedPlanView plan={plan} token={token} />;
}
