"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** A bottom sheet on phones, a side panel from the right on wider screens. */
export function Sheet({ open, onClose, title, children, side = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 animate-[fade-in_180ms_ease-out] bg-ink/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`absolute flex flex-col bg-paper outline-none ${
          side
            ? "inset-y-0 right-0 w-full max-w-[520px] animate-[slide-in_260ms_var(--ease-out)] border-l border-line"
            : "inset-x-0 bottom-0 max-h-[88dvh] animate-[sheet-up_280ms_var(--ease-out)] rounded-t-[10px] md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[420px] md:animate-[slide-in_260ms_var(--ease-out)] md:rounded-none md:border-l md:border-line"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 md:pt-4">
          {!side && <span className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line md:hidden" aria-hidden />}
          <h2 className="text-[1.15rem] font-extrabold tracking-[-0.03em]">{title}</h2>
          <button onClick={onClose} className="ml-auto grid size-10 place-items-center rounded-[4px] hover:bg-sunk" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
