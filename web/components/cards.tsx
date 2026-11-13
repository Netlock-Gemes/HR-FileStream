"use client";

import Link from "next/link";
import { useState } from "react";
import { left, quality, runtime } from "@/lib/format";
import type { Card, Face } from "@/lib/types";

export function Still({ src, alt = "", className = "", eager = false }: { src: string; alt?: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`relative block overflow-hidden bg-sunk ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span
      className={`block h-[3px] bg-paper/60 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Watched"
    >
      <span className="block h-full bg-signal" style={{ width: `${Math.max(value * 100, 3)}%` }} />
    </span>
  );
}

/** The measurements the library knows for a title, in mono. */
export function Facts({ card, className = "" }: { card: Card; className?: string }) {
  const facts = [card.progress ? left(card) : runtime(card.duration), quality(card.height)].filter(Boolean);
  if (!facts.length) return null;
  return (
    <span className={`data flex flex-wrap gap-x-3 text-muted ${className}`}>
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
    </span>
  );
}

export function TitleCard({ card, href, priority = false }: { card: Card; href?: string; priority?: boolean }) {
  // The player isn't a pre-rendered route, so links into it load the page outright
  const Anchor = href?.startsWith("/watch/") ? "a" : Link;
  return (
    <Anchor href={href ?? `/title?id=${card.id}`} className="group block outline-none" draggable={false}>
      <span className="relative block overflow-hidden rounded-[3px] transition-transform duration-150 group-active:scale-[0.98]">
        <Still src={card.poster} eager={priority} className="aspect-video [&>img]:group-hover:scale-[1.03]" />
        <span className="pointer-events-none absolute inset-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(12_12_12/0.08)]" />
        <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-2 ring-signal ring-inset opacity-0 transition-opacity group-focus-visible:opacity-100" />
        {card.progress ? <Progress value={card.progress} className="absolute inset-x-0 bottom-0" /> : null}
      </span>
      <span className="mt-2 block">
        <span className="line-clamp-2 text-[0.94rem] font-bold leading-snug tracking-[-0.01em] decoration-signal decoration-2 underline-offset-[3px] group-hover:underline">
          {card.title}
        </span>
        <Facts card={card} className="mt-1" />
      </span>
    </Anchor>
  );
}

const GRID = {
  normal: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  dense: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};

/** Titles on the index grid: each cell bounded by hairlines, like a catalogue page. */
export function CardGrid({ items, dense = false }: { items: Card[]; dense?: boolean }) {
  return (
    <ul className={`grid border-l border-t border-line ${dense ? GRID.dense : GRID.normal}`}>
      {items.map((card, index) => (
        <li key={card.id} className="min-w-0 border-b border-r border-line p-2.5 md:p-3">
          <TitleCard card={card} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton({ count = 12, dense = false }: { count?: number; dense?: boolean }) {
  return (
    <ul aria-hidden className={`grid border-l border-t border-line ${dense ? GRID.dense : GRID.normal}`}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="border-b border-r border-line p-2.5 md:p-3">
          <span className="skeleton block aspect-video rounded-[3px]" />
          <span className="skeleton mt-2.5 block h-3.5 w-3/4" />
          <span className="skeleton mt-2 block h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

export function Portrait({ face }: { face: Face }) {
  return (
    <Link href={`/cast?id=${face.id}`} className="group flex w-[6.5rem] flex-col gap-2 md:w-32">
      <span className="relative block aspect-square overflow-hidden rounded-[3px] bg-sunk transition-transform group-active:scale-[0.97]">
        {face.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={face.photo} alt="" loading="lazy" className="size-full object-cover grayscale transition-[filter] duration-300 group-hover:grayscale-0" />
        ) : (
          <span className="grid size-full place-items-center text-2xl font-extrabold tracking-[-0.04em] text-faint">{initials(face.name)}</span>
        )}
        <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-2 ring-signal ring-inset opacity-0 transition-opacity group-focus-visible:opacity-100" />
      </span>
      <span>
        <span className="line-clamp-2 text-[0.88rem] font-bold leading-tight group-hover:underline decoration-signal decoration-2 underline-offset-[3px]">{face.name}</span>
        <span className="data mt-0.5 block text-muted">{face.videos} {face.videos === 1 ? "title" : "titles"}</span>
      </span>
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
