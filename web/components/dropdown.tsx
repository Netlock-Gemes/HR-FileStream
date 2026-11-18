"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DropdownOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Classes for the trigger button; sizes and surface come from the caller */
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
};

const GAP = 4;
const EDGE = 8;

/* A select that draws its own list in the site's colours (native option lists ignore the
   theme on some browsers). The list is portalled and fixed, so sheets and scrolling
   tables can't clip it; it opens below, or above when there's more room there. */
export function Dropdown({ label, value, options, onChange, className = "", id, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchable = options.length > 10;

  const selected = options.find((option) => option.value === value);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const close = (focus = true) => {
    setOpen(false);
    setQuery("");
    if (focus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (option: DropdownOption | undefined) => {
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close();
  };
  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      // Exactly as wide as its trigger, so the list reads as part of the control
      const width = Math.min(rect.width, vw - EDGE * 2);
      const left = Math.min(Math.max(EDGE, rect.left), vw - width - EDGE);
      const below = vh - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const up = below < 240 && above > below;
      setPlace(
        up
          ? { left, width, bottom: vh - rect.top + GAP, maxHeight: Math.min(360, above) }
          : { left, width, top: rect.bottom + GAP, maxHeight: Math.min(360, below) },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    // The page scrolling under an open list would leave it floating; scrolling the list itself is fine
    const opened = performance.now();
    const onScroll = (event: Event) => {
      // A phone keyboard opening for the search box scrolls the page once; ignore that
      if (performance.now() - opened < 400) return;
      if (!panel.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    if (searchable) search.current?.focus({ preventScroll: true });
    else list.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place === null]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (event: React.KeyboardEvent) => {
    const last = shown.length - 1;
    if (event.key === "ArrowDown") setActive((index) => Math.min(last, index + 1));
    else if (event.key === "ArrowUp") setActive((index) => Math.max(0, index - 1));
    else if (event.key === "Home" && !searchable) setActive(0);
    else if (event.key === "End" && !searchable) setActive(last);
    else if (event.key === "Enter" || (event.key === " " && !searchable)) choose(shown[active]);
    else if (event.key === "Escape") close();
    else if (event.key === "Tab") close(false);
    else if (!searchable && event.key.length === 1) {
      const key = event.key.toLowerCase();
      const from = shown.findIndex((option, index) => index > active && option.label.toLowerCase().startsWith(key));
      const next = from >= 0 ? from : shown.findIndex((option) => option.label.toLowerCase().startsWith(key));
      if (next >= 0) setActive(next);
      return;
    } else return;
    event.preventDefault();
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? placeholder ?? ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            openList();
          }
        }}
        className={`relative min-w-0 items-center text-left ${className}`}
      >
        {/* Every label sits invisibly in the same cell, so the control is as wide as its longest
            option (as a native select is) and the list below can match it exactly */}
        <span className="grid min-w-0">
          {[placeholder, ...options.map((option) => option.label)].map((text, index) =>
            text ? (
              <span key={index} aria-hidden className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap">
                {text}
              </span>
            ) : null,
          )}
          <span className={`col-start-1 row-start-1 min-w-0 truncate ${selected ? "" : "text-faint"}`}>{selected?.label ?? placeholder ?? ""}</span>
        </span>
        <ChevronDown className={`pointer-events-none absolute right-2 size-4 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-[90] flex animate-[menu-in_150ms_var(--ease-out)] flex-col overflow-hidden rounded-[6px] border border-line bg-paper text-ink shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)]"
            style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, transformOrigin: place.top !== undefined ? "top center" : "bottom center" }}
          >
            {searchable && (
              <label className="flex shrink-0 items-center gap-2 border-b border-line px-2.5">
                <Search className="size-4 shrink-0 text-faint" />
                <input
                  ref={search}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder={`Find ${label.toLowerCase()}`}
                  className="h-11 w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
                  aria-label={`Find ${label.toLowerCase()}`}
                  aria-controls={listId}
                  aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                />
              </label>
            )}
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={searchable ? undefined : onKey}
              aria-activedescendant={!searchable && shown[active] ? `${listId}-${active}` : undefined}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5 outline-none"
            >
              {shown.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[4px] py-2 pr-1.5 pl-2.5 text-[0.8rem] leading-snug font-semibold ${
                      index === active ? "bg-sunk text-ink" : isSelected ? "text-ink" : "text-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-signal" strokeWidth={2.5} />}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-2.5 py-3 text-[0.88rem] text-faint">Nothing matches</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
