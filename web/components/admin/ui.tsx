"use client";

import { useState } from "react";

export const ADMIN = "/dashboard/api";

export type Overview = { videos: number; size: string; uncast: number; cast: number; hidden: number; addon_url: string; sorts: string[] };
export type Item = {
  id: string; title: string; description: string; caption: string; file_name: string; cast: string[]; tags: string[];
  hidden: boolean; poster: string; poster_custom: boolean; size: string; duration: number;
  channel_id: number | null; message_id: number | null; watch: string; url: string;
};
export type Person = { id: string; name: string; aliases: string[]; photo: string | null; videos: number };
export type Catalog = {
  id: string; name: string; all: boolean; enabled: boolean; sort: string; cast: string[]; tags: string[];
  keywords: string[]; channels: number[]; videos: number; removed: number; previews: string[];
};
export type Channel = { id: number; title: string | null; enabled: boolean; videos: number; import?: { running: boolean; scanned: number; added: number; error: string | null } | null };
export type Account = { id: string; username: string; disabled: boolean; created: number; last_seen: number };

export const input =
  "h-11 w-full rounded-[4px] bg-paper px-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)] placeholder:text-faint focus:shadow-[inset_0_0_0_2px_var(--color-ink)] focus:outline-none";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-bold">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[0.82rem] text-muted">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors aria-checked:bg-signal disabled:opacity-40"
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-paper shadow transition-transform duration-200 ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

/** Destructive actions ask twice in place, since the page can't show a browser confirm. */
export function ConfirmButton({ onConfirm, children, confirm = "Click again to confirm", className = "" }: { onConfirm: () => void; children: React.ReactNode; confirm?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (armed ? (setArmed(false), onConfirm()) : (setArmed(true), setTimeout(() => setArmed(false), 3500)))}
      className={`${className} ${armed ? "bg-alarm! text-paper! shadow-none!" : ""}`}
    >
      {armed ? confirm : children}
    </button>
  );
}

export function Section({ title, count, action, children }: { title: string; count?: number | string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-ink pb-3">
        <h1 className="headline text-[2.2rem] md:text-[2.8rem]">{title}</h1>
        {count !== undefined && <span className="data mb-1.5 text-muted">{count}</span>}
        {action && <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function names(text: string) {
  return text.split(",").map((part) => part.trim()).filter(Boolean);
}

export function since(timestamp: number) {
  if (!timestamp) return "Never";
  const minutes = (Date.now() / 1000 - timestamp) / 60;
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
