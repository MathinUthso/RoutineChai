"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { encodeSharedPlan, sharedPlanUrl } from "@/lib/share";
import type { Program, Routine } from "@/lib/types";
import { ShareIcon } from "./icons";

type CopyStatus = "idle" | "copied" | "failed";

const BUTTON_CLASS =
  "press inline-flex min-h-9 items-center gap-1.5 border border-rule-strong px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink hover:border-ink hover:bg-paper focus-visible:border-ink";

const subscribeToNothing = () => () => {};
const shareIsSupported = () => typeof navigator.share === "function";
const shareIsNotSupported = () => false;

/**
 * Hand-off for one plan: packs it into a link and lets the sender copy or
 * share it. The link is built in the browser only, because the origin and the
 * encoder both live there.
 */
export function ShareButton({ routine, programs }: { routine: Routine; programs: Program[] }) {
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // A client-only capability, read through the server snapshot so the first
  // client render still matches the server HTML.
  const shareSupported = useSyncExternalStore(
    subscribeToNothing,
    shareIsSupported,
    shareIsNotSupported,
  );
  const [result, setResult] = useState<{ token: string; status: CopyStatus } | null>(null);

  // Only an open panel pays for encoding, and it re-encodes whenever the plan
  // changes so a stale token never sits in the field.
  const token = open ? encodeSharedPlan(routine, programs) : "";
  const url =
    token && typeof window !== "undefined" ? sharedPlanUrl(token, window.location.origin) : "";
  // The status belongs to the token it describes, so a new link starts idle.
  const status: CopyStatus = result?.token === token ? result.status : "idle";

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setResult({ token, status: "copied" });
    } catch {
      setResult({ token, status: "failed" });
    }
  }, [token, url]);

  const share = useCallback(async () => {
    try {
      await navigator.share({
        title: "Fall 2026 routine",
        text: "Here is my Fall 2026 routine.",
        url,
      });
    } catch (error) {
      // Dismissing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }, [copy, url]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={BUTTON_CLASS}
      >
        <ShareIcon className="h-3.5 w-3.5" />
        Share plan
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-80 max-w-[calc(100vw-2rem)] border border-rule-strong bg-paper-raised p-3 shadow-sheet"
        >
          <p className="mono-label text-ink-faint">Share this plan</p>

          <input
            readOnly
            aria-label="Share link"
            value={url}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full border border-rule bg-paper px-2 py-1.5 font-mono text-[0.6875rem] text-ink-soft"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="press inline-flex min-h-9 items-center border border-ink px-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink hover:bg-ink hover:text-paper"
            >
              Copy link
            </button>
            {shareSupported ? (
              <button
                type="button"
                onClick={share}
                className="press inline-flex min-h-9 items-center border border-rule-strong px-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink hover:border-ink hover:bg-paper"
              >
                Share…
              </button>
            ) : null}
          </div>

          <p role="status" className="mono-label mt-2 min-h-4 text-ink-faint">
            {status === "copied"
              ? "Copied to clipboard."
              : status === "failed"
                ? "Copy failed. Select the link and copy it."
                : ""}
          </p>

          <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
            Anyone with this link can see this plan. It never expires.
          </p>
        </div>
      ) : null}
    </div>
  );
}
