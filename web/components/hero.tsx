"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ago, quality, runtime } from "@/lib/format";
import type { HeroCard } from "@/lib/types";
import { Still } from "./cards";

const ADVANCE_MS = 9000;

/** The newest titles, as an index: copy on the left, the still on the right, the other entries listed by number. */
export function Hero({ items }: { items: HeroCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const current = items[index] ?? items[0];

  useEffect(() => {
    if (items.length < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setIndex((index + 1) % items.length), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, items.length]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!current) return null;
  const go = (step: number) => setIndex((index + step + items.length) % items.length);

  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label="Newest titles"
      onPointerEnter={(event) => event.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="border-b border-line"
    >
      <div className="mx-auto grid max-w-[1600px] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Link href={`/title?id=${current.id}`} className="relative block md:order-2" tabIndex={-1} aria-hidden>
          <Still key={current.id} src={current.poster} eager className="aspect-video h-full animate-[fade-in_400ms_ease-out] md:aspect-auto md:min-h-[440px] lg:min-h-[520px]" />
        </Link>

        <div className="flex flex-col px-4 pb-6 pt-5 md:border-r md:border-line md:px-8 md:pb-8 md:pt-8">
          <div className="data flex items-center gap-3 text-muted">
            <span>
              {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </span>
            <span>Added {ago(current.added).replace(/^(Today|Yesterday)$/, (word) => word.toLowerCase())}</span>
            {items.length > 1 && (
              <span className="ml-auto flex gap-1 md:hidden">
                <button onClick={() => go(-1)} className="grid size-9 place-items-center rounded-[4px] text-ink hover:bg-sunk" aria-label="Previous title">
                  <ArrowLeft className="size-4" />
                </button>
                <button onClick={() => go(1)} className="grid size-9 place-items-center rounded-[4px] text-ink hover:bg-sunk" aria-label="Next title">
                  <ArrowRight className="size-4" />
                </button>
              </span>
            )}
          </div>

          <div key={current.id} className="animate-[rise_380ms_var(--ease-out)] md:mt-auto md:pt-10">
            <h1 className="headline mt-3 text-[2.5rem] min-[420px]:text-[2.9rem] md:text-[3.4rem] lg:text-[4.2rem] xl:text-[4.8rem]">{current.title}</h1>
            <p className="data mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem] text-muted">
              {runtime(current.duration) && <span>{runtime(current.duration)}</span>}
              {quality(current.height) && <span className="text-ink">{quality(current.height)}</span>}
              {current.tags.slice(0, 2).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </p>
            {current.cast.length > 0 && <p className="mt-2 text-[0.95rem] text-muted">With {current.cast.slice(0, 3).join(", ")}</p>}
            {current.description && <p className="mt-3 line-clamp-3 max-w-[52ch] text-[0.98rem] leading-relaxed">{current.description}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/title?id=${current.id}&play=1`} className="btn btn-signal h-12 px-6 text-base">
                <Play className="size-[18px] fill-current" /> Play
              </Link>
              <Link href={`/title?id=${current.id}`} className="btn btn-line h-12 px-5 text-base">
                Details
              </Link>
            </div>
          </div>

          {items.length > 1 && (
            <ol className="mt-8 hidden border-t border-line md:block" aria-label="Choose a title">
              {items.map((item, itemIndex) => (
                <li key={item.id} className="border-b border-line">
                  <button
                    onClick={() => setIndex(itemIndex)}
                    aria-current={itemIndex === index ? "true" : undefined}
                    className="relative flex w-full items-center gap-4 py-2.5 text-left text-[0.9rem] font-semibold text-muted transition-colors hover:text-ink aria-[current=true]:text-ink"
                  >
                    <span className="data w-6 text-faint">{String(itemIndex + 1).padStart(2, "0")}</span>
                    <span className="truncate">{item.title}</span>
                    <span className="data ml-auto shrink-0 text-faint">{runtime(item.duration)}</span>
                    {itemIndex === index && (
                      <span key={`${index}-${paused}`} className={`absolute inset-x-0 -bottom-px h-[2px] origin-left bg-signal ${paused ? "" : "animate-[reel_9s_linear_both]"}`} />
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
