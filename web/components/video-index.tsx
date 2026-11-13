"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, qs } from "@/lib/api";
import { BrowseState, filterCount, newSeed, OPTIONS, readState, writeState } from "@/lib/browse";
import { ago, bytes, plural, quality, runtime, SORT_LABELS } from "@/lib/format";
import type { Card, Facets, VideoPage } from "@/lib/types";
import { CardGrid, GridSkeleton, Progress, Still } from "./cards";
import { Sheet } from "./sheet";
import { Empty, Failed } from "./states";

type Section = "catalog" | "duration" | "quality" | "added" | "status" | "tag" | "cast" | "channel";

export type IndexProps = {
  /** Sent to the API but kept out of the address, e.g. My List or one cast member. */
  fixed?: Record<string, string>;
  hide?: Section[];
  defaultSort?: string;
  /** Address keys owned by the page (e.g. the cast id), kept when filters change. */
  keep?: string[];
  emptyTitle?: string;
  emptyText?: React.ReactNode;
};

export function useFacets() {
  return useQuery({ queryKey: ["facets"], queryFn: () => api<Facets>("/api/facets"), staleTime: 5 * 60_000 });
}

export function VideoIndex({ fixed = {}, hide = [], defaultSort = "newest", keep = [], emptyTitle, emptyText }: IndexProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const state = useMemo(() => readState(new URLSearchParams(params.toString())), [params]);
  const kept = keep.map((key) => [key, params.get(key) ?? ""] as [string, string]);
  const facets = useFacets();
  const [sheet, setSheet] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const request = (page: number) =>
    qs({
      ...fixed,
      q: state.q || fixed.q,
      catalog: state.catalog,
      cast: [...(fixed.cast ? [fixed.cast] : []), ...state.cast.filter((name) => name !== fixed.cast)],
      tag: state.tag,
      channel: state.channel,
      duration: state.duration,
      quality: state.quality,
      added: state.added,
      status: state.status,
      sort: state.sort || defaultSort,
      seed: state.seed,
      page,
      size: state.size,
    });

  const videos = useQuery({
    queryKey: ["videos", request(state.page)],
    queryFn: () => api<VideoPage>(`/api/videos${request(state.page)}`),
    placeholderData: keepPreviousData,
  });

  // A shuffle keeps its order across pages: the server's seed goes into the address
  useEffect(() => {
    if (videos.data?.seed && !state.seed && (state.sort || defaultSort) === "random") {
      router.replace(`${pathname}${writeState({ ...state, sort: "random", seed: videos.data.seed }, kept)}`, { scroll: false });
    }
  }, [videos.data?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // The next page is usually the next click
  useEffect(() => {
    const data = videos.data;
    if (!data || data.page >= data.pages || videos.isPlaceholderData) return;
    const next = request(data.page + 1);
    client.prefetchQuery({ queryKey: ["videos", next], queryFn: () => api<VideoPage>(`/api/videos${next}`) });
  }, [videos.data, videos.isPlaceholderData]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<BrowseState>, { resetPage = true, scroll = false } = {}) => {
    const next = { ...state, ...patch, ...(resetPage ? { page: 1 } : {}) };
    router.replace(`${pathname}${writeState(next, kept)}`, { scroll: false });
    if (scroll) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hrefFor = (page: number) => `${pathname}${writeState({ ...state, page }, kept)}`;
  const active = activeFilters(state, facets.data, fixed, hide);
  const sort = state.sort || defaultSort;
  const sorts = [...(fixed.saved ? ["saved"] : []), ...(facets.data?.sorts ?? Object.keys(SORT_LABELS).filter((key) => key !== "saved"))];
  const data = videos.data;
  const count = filterCount(state, fixed);

  const filters = (
    <Filters state={state} facets={facets.data} hide={hide} fixed={fixed} onChange={(patch) => update(patch)} />
  );

  return (
    <div ref={top} className="mx-auto grid max-w-[1600px] scroll-mt-20 gap-8 px-4 md:px-8 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="no-scrollbar sticky top-[5.5rem] hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto overscroll-contain pb-6 lg:block" aria-label="Filters">
        {filters}
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <button onClick={() => setSheet(true)} className="chip lg:hidden" aria-haspopup="dialog">
            <SlidersHorizontal className="size-4" /> Filters
            {count > 0 && <span className="data grid size-5 place-items-center rounded-full bg-ink text-paper">{count}</span>}
          </button>
          <p className="data mr-auto text-muted" aria-live="polite">
            {data ? plural(data.total, "title") : " "}
            {data && data.pages > 1 && <span className="hidden sm:inline"> &nbsp;page {data.page} of {data.pages}</span>}
          </p>
          {sort === "random" && (
            <button onClick={() => update({ seed: newSeed() }, { scroll: true })} className="chip" aria-label="Shuffle again">
              <RefreshCw className="size-4" /> <span className="hidden sm:inline">Shuffle again</span>
            </button>
          )}
          <Select
            label="Sort"
            value={sort}
            onChange={(value) => update({ sort: value === defaultSort ? "" : value, seed: value === "random" ? newSeed() : "" })}
            options={sorts.map((value) => ({ value, label: SORT_LABELS[value] ?? value }))}
          />
          <Select
            label="Per page"
            className="hidden sm:inline-flex"
            value={String(state.size)}
            onChange={(value) => update({ size: Number(value) })}
            options={(facets.data?.page_sizes ?? [12, 24, 36, 48, 96]).map((size) => ({ value: String(size), label: `${size} per page` }))}
          />
          <div className="flex rounded-[4px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]" role="group" aria-label="Layout">
            {(["grid", "list"] as const).map((view) => {
              const Icon = view === "grid" ? LayoutGrid : List;
              return (
                <button
                  key={view}
                  onClick={() => update({ view }, { resetPage: false })}
                  aria-pressed={state.view === view}
                  aria-label={view === "grid" ? "Show as grid" : "Show as list"}
                  className="grid h-[34px] w-9 place-items-center rounded-[4px] text-faint aria-pressed:bg-ink aria-pressed:text-paper"
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        {active.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {active.map((filter) => (
              <button key={filter.key} onClick={() => update(filter.clear)} className="chip min-h-8 bg-signal-soft shadow-none hover:shadow-[inset_0_0_0_1px_var(--color-ink)]" aria-label={`Remove filter ${filter.label}`}>
                {filter.label} <X className="size-3.5" />
              </button>
            ))}
            <button onClick={() => update(clearAll(state, fixed))} className="px-2 py-1 text-sm font-semibold text-signal-deep hover:underline">
              Clear all
            </button>
          </div>
        )}

        <div className={`transition-opacity duration-150 ${videos.isPlaceholderData ? "opacity-50" : ""}`} aria-busy={videos.isFetching}>
          {videos.isPending ? (
            state.view === "list" ? <ListSkeleton /> : <GridSkeleton count={Math.min(state.size, 12)} />
          ) : videos.isError ? (
            <Failed error={videos.error} retry={videos.refetch} />
          ) : data && data.items.length === 0 ? (
            <Empty
              title={active.length || state.q ? "Nothing matches" : emptyTitle ?? "Nothing here yet"}
              action={active.length ? <button onClick={() => update(clearAll(state, fixed))} className="btn btn-line">Clear filters</button> : undefined}
            >
              {active.length || state.q ? "Try removing a filter or searching for something else." : emptyText}
            </Empty>
          ) : data ? (
            state.view === "list" ? <ListView items={data.items} /> : <CardGrid items={data.items} />
          ) : null}
        </div>

        {data && data.pages > 1 && <Pagination page={data.page} pages={data.pages} hrefFor={hrefFor} />}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filters">
        <div className="px-4 pb-4">{filters}</div>
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button onClick={() => update(clearAll(state, fixed))} className="btn btn-line flex-1" disabled={!active.length}>
            Clear all
          </button>
          <button onClick={() => setSheet(false)} className="btn btn-ink flex-[2]">
            {data ? `Show ${plural(data.total, "title")}` : "Show titles"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function clearAll(state: BrowseState, fixed: Record<string, string>): Partial<BrowseState> {
  return {
    catalog: fixed.catalog ?? "",
    cast: [],
    tag: [],
    channel: "",
    duration: "",
    quality: "",
    added: "",
    status: "",
    q: state.q,
  };
}

function activeFilters(state: BrowseState, facets: Facets | undefined, fixed: Record<string, string>, hide: Section[]) {
  const list: { key: string; label: string; clear: Partial<BrowseState> }[] = [];
  const pick = (group: readonly { value: string; label: string }[], value: string) => group.find((item) => item.value === value)?.label ?? value;
  if (state.catalog && !hide.includes("catalog")) {
    list.push({ key: "catalog", label: facets?.catalogs.find((item) => item.id === state.catalog)?.name ?? "Catalog", clear: { catalog: "" } });
  }
  for (const key of ["duration", "quality", "added", "status"] as const) {
    if (state[key]) list.push({ key, label: pick(OPTIONS[key], state[key]), clear: { [key]: "" } });
  }
  state.tag.forEach((tag) => list.push({ key: `tag:${tag}`, label: tag, clear: { tag: state.tag.filter((item) => item !== tag) } }));
  state.cast
    .filter((name) => name !== fixed.cast)
    .forEach((name) => list.push({ key: `cast:${name}`, label: name, clear: { cast: state.cast.filter((item) => item !== name) } }));
  if (state.channel) {
    list.push({ key: "channel", label: facets?.channels.find((item) => String(item.id) === state.channel)?.title ?? "Channel", clear: { channel: "" } });
  }
  return list;
}

//---------------------[ FILTERS ]---------------------//

function Filters({
  state,
  facets,
  hide,
  fixed,
  onChange,
}: {
  state: BrowseState;
  facets?: Facets;
  hide: Section[];
  fixed: Record<string, string>;
  onChange: (patch: Partial<BrowseState>) => void;
}) {
  const show = (section: Section) => !hide.includes(section);
  const single = (key: "duration" | "quality" | "added" | "status", title: string) =>
    show(key) && (
      <Group title={title} onClear={state[key] ? () => onChange({ [key]: "" }) : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS[key].map((option) => (
            <button key={option.value} className="chip" aria-pressed={state[key] === option.value} onClick={() => onChange({ [key]: state[key] === option.value ? "" : option.value })}>
              {option.label}
            </button>
          ))}
        </div>
      </Group>
    );

  return (
    <div className="divide-y divide-line">
      {show("catalog") && facets && facets.catalogs.length > 0 && (
        <Group title="Catalog" onClear={state.catalog ? () => onChange({ catalog: "" }) : undefined}>
          <ul className="-mx-2">
            {[{ id: "", name: "Everything" }, ...facets.catalogs].map((catalog) => (
              <li key={catalog.id}>
                <button
                  onClick={() => onChange({ catalog: catalog.id })}
                  aria-pressed={state.catalog === catalog.id}
                  className="flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left text-[0.92rem] font-medium hover:bg-sunk aria-pressed:font-bold"
                >
                  <span className={`size-2 shrink-0 ${state.catalog === catalog.id ? "bg-signal" : "bg-line"}`} />
                  {catalog.name}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}
      {single("duration", "Length")}
      {single("quality", "Quality")}
      {single("status", "Watched")}
      {single("added", "Added")}
      {show("tag") && facets && facets.tags.length > 0 && (
        <Group title="Tags" onClear={state.tag.length ? () => onChange({ tag: [] }) : undefined}>
          <Expandable
            items={facets.tags}
            limit={12}
            render={(tag) => {
              const on = state.tag.includes(tag.name);
              return (
                <button key={tag.name} className="chip" aria-pressed={on} onClick={() => onChange({ tag: on ? state.tag.filter((item) => item !== tag.name) : [...state.tag, tag.name] })}>
                  {tag.name} <span className="data text-[0.68rem] opacity-60">{tag.videos}</span>
                </button>
              );
            }}
            wrap="flex flex-wrap gap-1.5"
          />
        </Group>
      )}
      {show("cast") && facets && facets.cast.length > 0 && (
        <Group title="Cast" onClear={state.cast.filter((name) => name !== fixed.cast).length ? () => onChange({ cast: [] }) : undefined}>
          <CastPicker facets={facets} selected={state.cast} onChange={(cast) => onChange({ cast })} />
        </Group>
      )}
      {show("channel") && facets && facets.channels.length > 1 && (
        <Group title="Channel" onClear={state.channel ? () => onChange({ channel: "" }) : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {facets.channels.map((channel) => (
              <button key={channel.id} className="chip" aria-pressed={state.channel === String(channel.id)} onClick={() => onChange({ channel: state.channel === String(channel.id) ? "" : String(channel.id) })}>
                {channel.title} <span className="data text-[0.68rem] opacity-60">{channel.videos}</span>
              </button>
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}

function Group({ title, onClear, children }: { title: string; onClear?: () => void; children: React.ReactNode }) {
  return (
    <section className="py-4 first:pt-3">
      <div className="mb-2.5 flex items-center">
        <h3 className="text-[0.9rem] font-extrabold tracking-[-0.02em]">{title}</h3>
        {onClear && (
          <button onClick={onClear} className="ml-auto text-[0.8rem] font-semibold text-signal-deep hover:underline">
            Clear
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Expandable<T>({ items, limit, render, wrap }: { items: T[]; limit: number; render: (item: T) => React.ReactNode; wrap: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, limit);
  return (
    <>
      <div className={wrap}>{shown.map(render)}</div>
      {items.length > limit && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-[0.84rem] font-semibold text-muted hover:text-ink">
          {open ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

function CastPicker({ facets, selected, onChange }: { facets: Facets; selected: string[]; onChange: (cast: string[]) => void }) {
  const [find, setFind] = useState("");
  const matches = facets.cast.filter((face) => face.name.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <>
      {facets.cast.length > 8 && (
        <input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="Find a name"
          aria-label="Find a cast member"
          className="mb-2 h-9 w-full rounded-[4px] bg-sunk px-2.5 placeholder:text-faint focus:bg-paper focus:outline-none focus:ring-1 focus:ring-ink"
        />
      )}
      <Expandable
        items={matches}
        limit={8}
        wrap="-mx-2"
        render={(face) => {
          const on = selected.includes(face.name);
          return (
            <label key={face.id} className="flex cursor-pointer items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-[0.92rem] hover:bg-sunk">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? selected.filter((name) => name !== face.name) : [...selected, face.name])}
                className="size-4 accent-[var(--color-signal)]"
              />
              <span className={`truncate ${on ? "font-bold" : ""}`}>{face.name}</span>
              <span className="data ml-auto text-faint">{face.videos}</span>
            </label>
          );
        }}
      />
      {!matches.length && <p className="text-sm text-muted">No one by that name.</p>}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`relative ${className || "inline-flex"} h-[34px] items-center rounded-[4px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_1px_var(--color-ink)]`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-8 pl-3 text-[0.86rem]! font-semibold focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted" />
    </label>
  );
}

//---------------------[ LIST VIEW ]---------------------//

function ListView({ items }: { items: Card[] }) {
  return (
    <table className="w-full table-fixed border-t border-ink text-left">
      <thead className="data hidden text-muted md:table-header-group">
        <tr className="border-b border-line">
          <th className="w-[140px] py-2 font-normal">Title</th>
          <th className="py-2 font-normal" />
          <th className="w-24 py-2 font-normal">Length</th>
          <th className="w-20 py-2 font-normal">Quality</th>
          <th className="hidden w-24 py-2 font-normal xl:table-cell">Size</th>
          <th className="w-28 py-2 pr-1 text-right font-normal">Added</th>
        </tr>
      </thead>
      <tbody>
        {items.map((card) => (
          <tr key={card.id} className="group relative border-b border-line hover:bg-paper">
            <td className="w-[112px] py-2.5 pr-3 align-top md:w-[140px]">
              <Link href={`/title?id=${card.id}`} className="relative block overflow-hidden rounded-[3px] after:absolute after:inset-0 after:content-['']">
                <Still src={card.poster} className="aspect-video" />
                {card.progress ? <Progress value={card.progress} className="absolute inset-x-0 bottom-0" /> : null}
              </Link>
            </td>
            <td className="py-2.5 pr-4 align-top">
              <Link href={`/title?id=${card.id}`} className="line-clamp-2 font-bold leading-snug decoration-signal decoration-2 underline-offset-[3px] group-hover:underline before:absolute before:inset-0 before:content-['']">
                {card.title}
              </Link>
              {card.cast.length > 0 && <p className="mt-0.5 line-clamp-1 text-[0.86rem] text-muted">{card.cast.join(", ")}</p>}
              <p className="data mt-1 flex gap-3 text-muted md:hidden">
                <span>{runtime(card.duration)}</span>
                <span>{quality(card.height)}</span>
              </p>
            </td>
            <td className="data hidden py-2.5 align-top text-[0.8rem] md:table-cell">{runtime(card.duration)}</td>
            <td className="data hidden py-2.5 align-top text-[0.8rem] md:table-cell">{quality(card.height)}</td>
            <td className="data hidden py-2.5 align-top text-[0.8rem] xl:table-cell">{bytes(card.size)}</td>
            <td className="data hidden py-2.5 pr-1 text-right align-top text-[0.8rem] text-muted md:table-cell">{ago(card.added)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="border-t border-ink">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex gap-3 border-b border-line py-2.5">
          <span className="skeleton aspect-video w-[112px] rounded-[3px] md:w-[140px]" />
          <span className="flex-1">
            <span className="skeleton block h-4 w-1/2" />
            <span className="skeleton mt-2 block h-3 w-1/4" />
          </span>
        </div>
      ))}
    </div>
  );
}

//---------------------[ PAGES ]---------------------//

function pageList(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => wanted.add(n));
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const list: (number | "gap")[] = [];
  sorted.forEach((n, index) => {
    if (index && n - sorted[index - 1] > 1) list.push("gap");
    list.push(n);
  });
  return list;
}

export function Pagination({ page, pages, hrefFor, onPage }: { page: number; pages: number; hrefFor: (page: number) => string; onPage?: (page: number) => void }) {
  const router = useRouter();
  const go = (event: React.MouseEvent, target: number) => {
    if (!onPage) return;
    event.preventDefault();
    onPage(target);
  };
  const [jump, setJump] = useState("");
  const cell = "grid h-10 min-w-10 place-items-center rounded-[4px] px-2 data text-[0.82rem] font-semibold";
  return (
    <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink pt-4">
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} onClick={(event) => go(event, page - 1)} className={`${cell} hover:bg-sunk`} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className={`${cell} text-faint/50`} aria-hidden>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {pageList(page, pages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap${index}`} className={`${cell} text-faint`}>…</span>
          ) : item === page ? (
            <span key={item} aria-current="page" className={`${cell} bg-signal text-ink`}>{item}</span>
          ) : (
            <Link key={item} href={hrefFor(item)} onClick={(event) => go(event, item)} className={`${cell} hover:bg-sunk ${Math.abs(item - page) > 1 && item !== 1 && item !== pages ? "hidden sm:grid" : ""}`}>
              {item}
            </Link>
          ),
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} onClick={(event) => go(event, page + 1)} className={`${cell} hover:bg-sunk`} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={`${cell} text-faint/50`} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
      {pages > 7 && (
        <form
          className="flex items-center gap-2 text-sm text-muted"
          onSubmit={(event) => {
            event.preventDefault();
            const target = Math.min(Math.max(Number.parseInt(jump, 10) || 1, 1), pages);
            setJump("");
            if (onPage) onPage(target);
            else router.push(hrefFor(target));
          }}
        >
          <label htmlFor="jump-page">Go to page</label>
          <input
            id="jump-page"
            value={jump}
            onChange={(event) => setJump(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            enterKeyHint="go"
            placeholder={String(page)}
            className="data h-10 w-16 rounded-[4px] bg-paper px-2 text-center text-[16px]! shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_1px_var(--color-ink)] focus:outline-none"
          />
          <span className="data">of {pages}</span>
        </form>
      )}
    </nav>
  );
}
