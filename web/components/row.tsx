"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** A section of the index: heading with its count, then a track that swipes on phones and pages with arrows on desktop. */
export function Row({
  title,
  href,
  count,
  action,
  children,
}: {
  title: string;
  href?: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft < 8,
        end: element.scrollLeft + element.clientWidth > element.scrollWidth - 8,
      });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="mx-auto mt-10 max-w-[1600px] px-4 md:mt-14 md:px-8">
      <div className="flex items-center gap-3 border-b border-ink pb-2.5">
        <h2 className="text-[1.35rem] font-extrabold tracking-[-0.035em] md:text-[1.6rem]">
          {href ? (
            <Link href={href} className="decoration-signal decoration-2 underline-offset-4 hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {count !== undefined && <span className="data mt-1 text-muted">{count.toLocaleString()}</span>}
        <div className="ml-auto flex items-center gap-1">
          {action}
          {href && (
            <Link href={href} className="rounded-[4px] px-2.5 py-2 text-sm font-semibold text-signal-deep hover:bg-signal-soft">
              See all
            </Link>
          )}
          <span className="hidden gap-1 [@media(hover:hover)]:flex">
            <button onClick={() => page(-1)} disabled={edges.start} className="grid size-9 place-items-center rounded-[4px] text-ink hover:bg-sunk disabled:text-faint/50" aria-label="Scroll back">
              <ArrowLeft className="size-[18px]" />
            </button>
            <button onClick={() => page(1)} disabled={edges.end} className="grid size-9 place-items-center rounded-[4px] text-ink hover:bg-sunk disabled:text-faint/50" aria-label="Scroll forward">
              <ArrowRight className="size-[18px]" />
            </button>
          </span>
        </div>
      </div>
      <ul ref={track} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 md:mx-0 md:scroll-px-0 md:px-0">
        {children}
      </ul>
    </section>
  );
}

export function RowItem({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <li
      className={`shrink-0 snap-start border-r border-line py-3 pr-3 pl-3 first:pl-0 last:border-r-0 ${
        wide ? "w-[78vw] sm:w-[46vw] md:w-[36vw] lg:w-[28vw] xl:w-[23vw]" : "w-[60vw] sm:w-[38vw] md:w-[28vw] lg:w-[21vw] xl:w-[17vw] 2xl:w-[14.5vw]"
      }`}
    >
      {children}
    </li>
  );
}
