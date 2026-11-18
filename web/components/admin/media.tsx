"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, ImageUp, Play, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { Still } from "@/components/cards";
import { Sheet } from "@/components/sheet";
import { Empty, Failed } from "@/components/states";
import { Pagination } from "@/components/video-index";
import { api, qs } from "@/lib/api";
import { SORT_LABELS } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { ADMIN, Catalog, Channel, ConfirmButton, Field, input, Item, names, Overview, Person, Section, Toggle } from "./ui";

type MediaPage = { items: Item[]; total: number; page_size: number };
type Filters = { state: string; q: string; label: string; catalog: string; channel: string; sort: string; page: number };

const STATES = [
  { value: "", label: "All" },
  { value: "uncast", label: "Needs cast" },
  { value: "hidden", label: "Hidden" },
];

export function Media({ overview }: { overview?: Overview }) {
  const client = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ state: "", q: "", label: "", catalog: "", channel: "", sort: "newest", page: 1 });
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 280);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => setFilters((old) => (old.q === q ? old : { ...old, q, page: 1 })), [q]);
  const set = (patch: Partial<Filters>) => setFilters((old) => ({ ...old, ...patch, page: patch.page ?? 1 }));

  const cast = useQuery({ queryKey: ["admin", "cast"], queryFn: () => api<{ cast: Person[] }>(`${ADMIN}/cast`) });
  const catalogs = useQuery({ queryKey: ["admin", "catalogs"], queryFn: () => api<{ catalogs: Catalog[] }>(`${ADMIN}/catalogs`) });
  const channels = useQuery({ queryKey: ["admin", "channels"], queryFn: () => api<{ channels: Channel[] }>(`${ADMIN}/channels`) });

  const pageSize = 30;
  const media = useQuery({
    queryKey: ["admin", "media", filters],
    queryFn: () =>
      api<MediaPage>(
        `${ADMIN}/media${qs({ state: filters.state, q: filters.q, label: filters.label, catalog: filters.catalog, channel: filters.channel, sort: filters.sort, skip: (filters.page - 1) * pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = media.data ? Math.max(1, Math.ceil(media.data.total / media.data.page_size)) : 1;

  const refresh = () => client.invalidateQueries({ queryKey: ["admin"] });
  const bulk = useMutation({
    mutationFn: (body: { action: string; value?: string }) => api(`${ADMIN}/media/bulk`, { method: "POST", json: { ids: [...selected], ...body } }),
    onSuccess: (_, body) => {
      toast(body.action === "delete" ? `Removed ${selected.size}` : `Updated ${selected.size}`);
      if (body.action === "delete") setSelected(new Set());
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const counts: Record<string, number | undefined> = { "": overview?.videos, uncast: overview?.uncast, hidden: overview?.hidden };
  const items = media.data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <Section title="Media" count={overview ? `${overview.videos.toLocaleString()} videos, ${overview.size}` : undefined}>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="flex rounded-[4px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]" role="tablist">
          {STATES.map((state) => (
            <button
              key={state.value}
              role="tab"
              aria-selected={filters.state === state.value}
              onClick={() => set({ state: state.value })}
              className="flex h-9 items-center gap-1.5 rounded-[4px] px-3 text-[0.88rem] font-semibold aria-selected:bg-ink aria-selected:text-paper"
            >
              {state.label}
              {counts[state.value] !== undefined && <span className="data opacity-60">{counts[state.value]}</span>}
            </button>
          ))}
        </div>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[4px] bg-paper px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_1px_var(--color-ink)] sm:max-w-xs">
          <Search className="size-4 shrink-0 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, files, captions" className="w-full min-w-0 bg-transparent text-[15px] focus:outline-none" aria-label="Search media" />
        </label>
        <Picker label="Cast or tag" value={filters.label} onChange={(label) => set({ label })} options={[{ value: "", label: "Any cast" }, ...(cast.data?.cast ?? []).map((person) => ({ value: person.name, label: person.name }))]} />
        <Picker label="Catalog" value={filters.catalog} onChange={(catalog) => set({ catalog })} options={[{ value: "", label: "Any catalog" }, ...(catalogs.data?.catalogs ?? []).map((catalog) => ({ value: catalog.id, label: catalog.name }))]} />
        {(channels.data?.channels.length ?? 0) > 1 && (
          <Picker label="Channel" value={filters.channel} onChange={(channel) => set({ channel })} options={[{ value: "", label: "Any channel" }, ...(channels.data?.channels ?? []).map((channel) => ({ value: String(channel.id), label: channel.title ?? String(channel.id) }))]} />
        )}
        <Picker label="Sort" value={filters.sort} onChange={(sort) => set({ sort })} options={(overview?.sorts ?? ["newest"]).map((sort) => ({ value: sort, label: SORT_LABELS[sort] ?? sort }))} />
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          catalogs={catalogs.data?.catalogs ?? []}
          busy={bulk.isPending}
          onAction={(action, value) => bulk.mutate({ action, value })}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className={media.isPlaceholderData ? "opacity-50 transition-opacity" : ""}>
        {media.isError ? (
          <Failed error={media.error} retry={media.refetch} />
        ) : media.isPending ? (
          <div className="skeleton h-96" />
        ) : items.length === 0 ? (
          <Empty title="No videos match">Change the search or filters.</Empty>
        ) : (
          <table className="w-full table-fixed border-t border-ink text-left">
            <thead className="data text-muted">
              <tr className="border-b border-line">
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={() => setSelected((old) => {
                      const next = new Set(old);
                      items.forEach((item) => (allOnPage ? next.delete(item.id) : next.add(item.id)));
                      return next;
                    })}
                    className="size-4 accent-[var(--color-signal)]"
                  />
                </th>
                <th className="w-[104px] py-2 font-normal md:w-[132px]">Video</th>
                <th className="py-2 font-normal" />
                <th className="hidden w-[24%] py-2 font-normal lg:table-cell">Cast</th>
                <th className="hidden w-20 py-2 font-normal md:table-cell">Length</th>
                <th className="hidden w-20 py-2 pr-2 text-right font-normal md:table-cell">Size</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`border-b border-line hover:bg-paper ${selected.has(item.id) ? "bg-signal-soft/60" : ""}`}>
                  <td className="py-2.5 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.title}`}
                      checked={selected.has(item.id)}
                      onChange={() => setSelected((old) => {
                        const next = new Set(old);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })}
                      className="mt-1 size-4 accent-[var(--color-signal)]"
                    />
                  </td>
                  <td className="w-[104px] py-2.5 pr-3 align-top md:w-[132px]">
                    <button onClick={() => setEditing(item.id)} className="relative block w-full overflow-hidden rounded-[3px]" aria-label={`Edit ${item.title}`}>
                      <Still src={item.poster} className="aspect-video" />
                      {item.hidden && <span className="data absolute top-1 left-1 rounded-[3px] bg-ink px-1 text-paper">Hidden</span>}
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <button onClick={() => setEditing(item.id)} className="line-clamp-2 text-left font-bold leading-snug decoration-signal decoration-2 underline-offset-[3px] hover:underline">
                      {item.title}
                    </button>
                    <p className="data mt-0.5 line-clamp-1 break-all text-faint">{item.file_name}</p>
                    {item.tags.length > 0 && <p className="mt-1 line-clamp-1 text-[0.82rem] text-muted">{item.tags.map((tag) => `#${tag}`).join(" ")}</p>}
                    <p className="mt-1 text-[0.84rem] text-muted lg:hidden">{item.cast.join(", ") || <span className="text-signal-deep">No cast</span>}</p>
                  </td>
                  <td className="hidden py-2.5 pr-3 align-top text-[0.9rem] lg:table-cell">{item.cast.join(", ") || <span className="text-signal-deep">No cast</span>}</td>
                  <td className="data hidden py-2.5 pr-3 align-top text-[0.8rem] whitespace-nowrap md:table-cell">{item.duration ? `${item.duration} min` : ""}</td>
                  <td className="data hidden py-2.5 pr-2 text-right align-top text-[0.8rem] whitespace-nowrap md:table-cell">{item.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {media.data && pages > 1 && (
        <PagerButtons page={filters.page} pages={pages} total={media.data.total} onPage={(page) => { set({ page }); scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}

      <Editor id={editing} onClose={() => setEditing(null)} catalogsKnown={catalogs.data?.catalogs ?? []} onChanged={refresh} />
    </Section>
  );
}

function PagerButtons({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <>
      <Pagination page={page} pages={pages} hrefFor={(target) => `#media-${target}`} onPage={onPage} />
      <p className="data mt-2 text-muted">{total.toLocaleString()} videos</p>
    </>
  );
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <Dropdown
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="inline-flex h-9 max-w-48 rounded-[4px] bg-paper pr-8 pl-3 text-[0.86rem] font-semibold shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-ink)] aria-expanded:shadow-[inset_0_0_0_1px_var(--color-ink)]"
    />
  );
}

function BulkBar({ count, catalogs, busy, onAction, onClear }: { count: number; catalogs: Catalog[]; busy: boolean; onAction: (action: string, value?: string) => void; onClear: () => void }) {
  const [castText, setCastText] = useState("");
  const [catalog, setCatalog] = useState("");
  return (
    <div className="sticky top-[4.5rem] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[4px] bg-ink p-2 pl-3 text-paper shadow-lg">
      <span className="text-sm font-bold">{count} selected</span>
      <button onClick={onClear} className="grid size-8 place-items-center rounded-[4px] hover:bg-white/10" aria-label="Clear selection">
        <X className="size-4" />
      </button>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (names(castText).length) onAction("add_cast", castText);
          setCastText("");
        }}
      >
        <input value={castText} onChange={(event) => setCastText(event.target.value)} placeholder="Add cast, comma separated" className="h-9 w-52 rounded-[4px] bg-white/10 px-2.5 text-[15px] placeholder:text-white/50 focus:bg-white/15 focus:outline-none" aria-label="Cast to add" />
        <button disabled={busy || !castText.trim()} className="btn h-9 min-h-0 bg-signal px-3 text-ink">Add</button>
      </form>
      <div className="flex items-center gap-1">
        <Dropdown
          label="Catalog"
          placeholder="Catalog"
          value={catalog}
          onChange={setCatalog}
          options={catalogs.filter((item) => !item.all).map((item) => ({ value: item.id, label: item.name }))}
          className="inline-flex h-9 max-w-44 rounded-[4px] bg-white/10 pr-8 pl-2.5 text-[0.86rem] hover:bg-white/15"
        />
        <button disabled={busy || !catalog} onClick={() => onAction("add_catalog", catalog)} className="btn h-9 min-h-0 bg-white/10 px-3">Put in</button>
        <button disabled={busy || !catalog} onClick={() => onAction("remove_catalog", catalog)} className="btn h-9 min-h-0 bg-white/10 px-3">Take out</button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button disabled={busy} onClick={() => onAction("hide")} className="btn h-9 min-h-0 bg-white/10 px-3">Hide</button>
        <button disabled={busy} onClick={() => onAction("show")} className="btn h-9 min-h-0 bg-white/10 px-3">Show</button>
        <ConfirmButton onConfirm={() => onAction("delete")} confirm={`Remove ${count}?`} className="btn h-9 min-h-0 bg-white/10 px-3">
          <Trash2 className="size-4" /> Remove
        </ConfirmButton>
      </div>
    </div>
  );
}

//---------------------[ EDIT ONE VIDEO ]---------------------//

function Editor({ id, onClose, catalogsKnown, onChanged }: { id: string | null; onClose: () => void; catalogsKnown: Catalog[]; onChanged: () => void }) {
  const client = useQueryClient();
  const item = useQuery({ queryKey: ["admin", "item", id], queryFn: () => api<Item>(`${ADMIN}/media/${id}/poster`), enabled: !!id });
  const memberships = useQuery({
    queryKey: ["admin", "item-catalogs", id],
    queryFn: () => api<{ catalogs: { id: string; name: string; member: boolean; picked: boolean; all: boolean }[] }>(`${ADMIN}/media/${id}/catalogs`),
    enabled: !!id,
  });
  const [draft, setDraft] = useState({ title: "", description: "", cast: "", tags: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item.data) setDraft({ title: item.data.title, description: item.data.description, cast: item.data.cast.join(", "), tags: item.data.tags.join(", ") });
  }, [item.data]);

  const changed = useMemo(() => {
    if (!item.data) return false;
    return (
      draft.title !== item.data.title ||
      draft.description !== item.data.description ||
      names(draft.cast).join("|") !== item.data.cast.join("|") ||
      names(draft.tags).join("|") !== item.data.tags.join("|")
    );
  }, [draft, item.data]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Item>(`${ADMIN}/media/${id}`, { method: "PATCH", json: body }),
    onSuccess: (data) => {
      client.setQueryData(["admin", "item", id], data);
      onChanged();
      toast("Saved");
    },
    onError: (error) => toast.error(error.message),
  });

  const poster = useMutation({
    mutationFn: (file: File | null) => api<Item>(`${ADMIN}/media/${id}/poster`, file ? { method: "PUT", body: file } : { method: "DELETE" }),
    onSuccess: (data) => {
      client.setQueryData(["admin", "item", id], data);
      onChanged();
      toast("Thumbnail updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const membership = useMutation({
    mutationFn: ({ catalog, member }: { catalog: string; member: boolean }) => api(`${ADMIN}/media/${id}/catalogs`, { method: "POST", json: { catalog, member } }),
    onSuccess: () => {
      memberships.refetch();
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => api(`${ADMIN}/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Removed from the library");
      onChanged();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const data = item.data;
  const post = data?.channel_id ? `https://t.me/c/${String(data.channel_id).replace(/^-100/, "")}/${data.message_id}` : null;

  return (
    <Sheet open={!!id} onClose={onClose} title="Edit video" side>
      {!data ? (
        <div className="p-4"><div className="skeleton aspect-video" /></div>
      ) : (
        <form
          className="grid gap-5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            patch.mutate({ title: draft.title, description: draft.description, cast: names(draft.cast), tags: draft.tags });
          }}
        >
          <div>
            <div className="relative overflow-hidden rounded-[3px]">
              <Still key={data.poster} src={data.poster} className="aspect-video" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="btn btn-line h-9 min-h-0 cursor-pointer px-3 text-sm">
                <ImageUp className="size-4" /> Upload thumbnail
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => event.target.files?.[0] && poster.mutate(event.target.files[0])} />
              </label>
              {data.poster_custom && (
                <button type="button" onClick={() => poster.mutate(null)} className="btn btn-line h-9 min-h-0 px-3 text-sm">
                  <RotateCcw className="size-4" /> Use Telegram thumbnail
                </button>
              )}
              <a href={data.watch} className="btn btn-line h-9 min-h-0 px-3 text-sm" target="_blank" rel="noreferrer">
                <Play className="size-4" /> Watch
              </a>
            </div>
            <p className="mt-1.5 text-[0.82rem] text-muted">Tip: while watching, choose “Use frame as thumbnail” to grab any moment.</p>
          </div>

          <Field label="Title" htmlFor="edit-title">
            <input id="edit-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={input} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <textarea id="edit-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} className={`${input} h-auto py-2.5 leading-relaxed`} />
          </Field>
          <Field label="Cast" hint="Separate names with commas. New names join the cast list." htmlFor="edit-cast">
            <input id="edit-cast" value={draft.cast} onChange={(event) => setDraft({ ...draft, cast: event.target.value })} className={input} />
          </Field>
          <Field label="Tags" hint="Separate with commas, without #." htmlFor="edit-tags">
            <input id="edit-tags" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} className={input} />
          </Field>
          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-paper px-4 py-3">
            <button disabled={!changed || patch.isPending} className="btn btn-signal flex-1">{patch.isPending ? "Saving" : "Save changes"}</button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="font-bold">Hidden</p>
              <p className="text-[0.84rem] text-muted">Hidden videos don&apos;t show on the site or in the addon. Links still play.</p>
            </div>
            <Toggle checked={data.hidden} onChange={(hidden) => patch.mutate({ hidden })} label="Hidden" />
          </div>

          <div className="border-t border-line pt-4">
            <p className="font-bold">Catalogs</p>
            <ul className="mt-2 divide-y divide-line">
              {(memberships.data?.catalogs ?? catalogsKnown.map((catalog) => ({ id: catalog.id, name: catalog.name, member: false, picked: false, all: catalog.all }))).map((catalog) => (
                <li key={catalog.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-[0.94rem]">{catalog.name}</span>
                  <Toggle
                    checked={catalog.member}
                    disabled={membership.isPending || !memberships.data}
                    onChange={(member) => membership.mutate({ catalog: catalog.id, member })}
                    label={`In ${catalog.name}`}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(data.url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn btn-line h-10 min-h-0 px-3 text-sm"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy stream link"}
            </button>
            {post && (
              <a href={post} target="_blank" rel="noreferrer" className="btn btn-line h-10 min-h-0 px-3 text-sm">
                <Send className="size-4" /> Telegram post <ExternalLink className="size-3.5" />
              </a>
            )}
            <ConfirmButton onConfirm={() => remove.mutate()} confirm="Remove for good?" className="btn btn-line ml-auto h-10 min-h-0 px-3 text-sm text-alarm">
              <Trash2 className="size-4" /> Remove
            </ConfirmButton>
          </div>
          {data.caption && (
            <details className="border-t border-line pt-3 text-sm">
              <summary className="cursor-pointer font-bold">Original caption</summary>
              <p className="mt-2 whitespace-pre-line text-muted">{data.caption}</p>
            </details>
          )}
        </form>
      )}
    </Sheet>
  );
}
