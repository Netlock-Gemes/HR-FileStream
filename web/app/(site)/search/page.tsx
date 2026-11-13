"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Empty } from "@/components/states";
import { VideoIndex } from "@/components/video-index";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { Card, Face } from "@/lib/types";

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("q") ?? "";
  const [value, setValue] = useState(q);
  const debounced = useDebounced(value.trim(), 280);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q) input.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing rewrites the address, so results survive refresh and back
  useEffect(() => {
    if (debounced === q) return;
    router.replace(debounced ? `${pathname}?q=${encodeURIComponent(debounced)}` : pathname, { scroll: false });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const quick = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<{ items: Card[]; cast: Face[]; tags: string[] }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: !!q,
  });

  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8 md:pt-10">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            input.current?.blur();
          }}
          className="flex items-center gap-3 border-b-2 border-ink pb-2 focus-within:border-signal"
        >
          <Search className="size-7 shrink-0 md:size-9" strokeWidth={2.2} />
          <input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search titles, cast and tags"
            className="headline w-full min-w-0 bg-transparent py-1 text-[2.2rem]! placeholder:text-faint/60 focus:outline-none md:text-[3.4rem]!"
          />
          {value && (
            <button type="button" onClick={() => { setValue(""); input.current?.focus(); }} className="grid size-11 shrink-0 place-items-center rounded-[4px] hover:bg-sunk" aria-label="Clear search">
              <X className="size-6" />
            </button>
          )}
        </form>
        {q && quick.data && (quick.data.cast.length > 0 || quick.data.tags.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {quick.data.cast.map((face) => (
              <Link key={face.id} href={`/cast?id=${face.id}`} className="chip">
                {face.name} <span className="data text-[0.68rem] text-muted">{face.videos}</span>
              </Link>
            ))}
            {quick.data.tags.map((tag) => (
              <Link key={tag} href={`/browse?tag=${encodeURIComponent(tag)}`} className="chip">
                <span className="text-muted">#</span>{tag}
              </Link>
            ))}
          </div>
        )}
      </div>
      {q ? (
        <VideoIndex fixed={{}} keep={[]} />
      ) : (
        <Empty title="Find something to watch">Search by title, a cast member&apos;s name, or a tag such as a genre.</Empty>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
