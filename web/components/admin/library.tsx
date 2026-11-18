"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, Check, Copy, Download, ExternalLink, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { Failed } from "@/components/states";
import { api } from "@/lib/api";
import { SORT_LABELS } from "@/lib/format";
import { ADMIN, Catalog, Channel, ConfirmButton, Field, input, names, Overview, Person, Section, Toggle } from "./ui";

function useAdmin<T>(key: string, path: string, refetchInterval?: number | false) {
  return useQuery({ queryKey: ["admin", key], queryFn: () => api<T>(`${ADMIN}${path}`), refetchInterval });
}

function useChange<T = unknown>(fn: (body: T) => Promise<unknown>, done?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (done) toast(done);
      client.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(error.message),
  });
}

//---------------------[ CAST ]---------------------//

export function CastTab() {
  const cast = useAdmin<{ cast: Person[] }>("cast", "/cast");
  const [newNames, setNewNames] = useState("");
  const [aliases, setAliases] = useState("");
  const [find, setFind] = useState("");
  const add = useMutation({
    mutationFn: () => api<{ added: number; connected: number }>(`${ADMIN}/cast`, { method: "POST", json: { names: names(newNames), aliases: names(aliases) } }),
    onSuccess: (result) => {
      toast(`Added ${result.added}, matched to ${result.connected} videos`);
      setNewNames("");
      setAliases("");
      cast.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const rematch = useMutation({
    mutationFn: () => api<{ connected: number }>(`${ADMIN}/cast/rematch`, { method: "POST" }),
    onSuccess: (result) => toast(`Matched ${result.connected} more videos`),
    onError: (error) => toast.error(error.message),
  });

  const people = (cast.data?.cast ?? []).filter((person) => person.name.toLowerCase().includes(find.toLowerCase()));

  return (
    <Section
      title="Cast"
      count={cast.data?.cast.length}
      action={
        <button onClick={() => rematch.mutate()} disabled={rematch.isPending} className="btn btn-line h-10 min-h-0 text-sm">
          <RefreshCw className={`size-4 ${rematch.isPending ? "animate-spin" : ""}`} /> Match all videos again
        </button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
        className="grid gap-3 border-b border-line py-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <Field label="Names" hint="Comma separated. Videos naming them are matched." htmlFor="cast-names">
          <input id="cast-names" value={newNames} onChange={(event) => setNewNames(event.target.value)} placeholder="Mira Kapoor, Arjun Mehta" className={input} />
        </Field>
        <Field label="Also known as" hint="Optional, used for matching." htmlFor="cast-aliases">
          <input id="cast-aliases" value={aliases} onChange={(event) => setAliases(event.target.value)} className={input} />
        </Field>
        <button disabled={!names(newNames).length || add.isPending} className="btn btn-signal md:mb-6">
          <Plus className="size-4" /> Add
        </button>
      </form>

      <input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a name" aria-label="Find a cast member" className={`${input} mt-4 max-w-xs`} />
      {cast.isError && <Failed error={cast.error} retry={cast.refetch} />}
      <ul className="mt-4 grid border-t border-l border-line sm:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ul>
    </Section>
  );
}

function PersonRow({ person }: { person: Person }) {
  const [name, setName] = useState(person.name);
  const [aka, setAka] = useState(person.aliases.join(", "));
  useEffect(() => {
    setName(person.name);
    setAka(person.aliases.join(", "));
  }, [person]);
  const save = useChange(() => api(`${ADMIN}/cast/${person.id}`, { method: "PATCH", json: { name, aliases: names(aka) } }), "Saved");
  const photo = useChange((file: File) => api(`${ADMIN}/cast/${person.id}/photo`, { method: "PUT", body: file }), "Photo updated");
  const remove = useChange(() => api(`${ADMIN}/cast/${person.id}`, { method: "DELETE" }), "Removed");
  const changed = name !== person.name || aka !== person.aliases.join(", ");

  return (
    <li className="flex gap-3 border-r border-b border-line p-3">
      <label className="group relative block size-20 shrink-0 cursor-pointer overflow-hidden rounded-[3px] bg-sunk" title="Change photo">
        {person.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo} alt="" className="size-full object-cover" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-ink/0 text-paper opacity-0 transition group-hover:bg-ink/50 group-hover:opacity-100">
          <Camera className="size-5" />
        </span>
        {!person.photo && <Camera className="absolute inset-0 m-auto size-5 text-faint" />}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => event.target.files?.[0] && photo.mutate(event.target.files[0])} aria-label={`Photo for ${person.name}`} />
      </label>
      <form
        className="grid min-w-0 flex-1 gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(undefined);
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Name" className="h-8 rounded-[3px] bg-transparent px-1.5 font-bold hover:bg-paper focus:bg-paper focus:outline-none focus:ring-1 focus:ring-ink" />
        <input value={aka} onChange={(event) => setAka(event.target.value)} placeholder="Also known as" aria-label="Also known as" className="h-8 rounded-[3px] bg-transparent px-1.5 text-[0.88rem]! text-muted placeholder:text-faint hover:bg-paper focus:bg-paper focus:outline-none focus:ring-1 focus:ring-ink" />
        <div className="flex items-center gap-2 px-1.5">
          <span className="data text-muted">{person.videos} videos</span>
          {changed && <button className="ml-auto text-sm font-bold text-signal-deep">Save</button>}
          <ConfirmButton onConfirm={() => remove.mutate(undefined)} confirm="Remove?" className={`${changed ? "" : "ml-auto"} rounded-[3px] px-1.5 py-0.5 text-sm text-muted hover:text-alarm`}>
            <Trash2 className="size-4" />
          </ConfirmButton>
        </div>
      </form>
    </li>
  );
}

//---------------------[ CATALOGS ]---------------------//

export function CatalogsTab({ overview }: { overview?: Overview }) {
  const catalogs = useAdmin<{ catalogs: Catalog[] }>("catalogs", "/catalogs");
  const channels = useAdmin<{ channels: Channel[] }>("channels", "/channels");
  const [name, setName] = useState("");
  const add = useChange(() => api(`${ADMIN}/catalogs`, { method: "POST", json: { name } }), "Catalog added");
  const reorder = useChange((ids: string[]) => api(`${ADMIN}/catalogs/reorder`, { method: "POST", json: { ids } }));
  const list = catalogs.data?.catalogs ?? [];
  const move = (index: number, step: number) => {
    const ids = list.map((catalog) => catalog.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <Section title="Catalogs" count={list.length}>
      <p className="mt-3 max-w-[70ch] text-muted">Catalogs are the rows on the home page and in the addon, in this order. A video joins a catalog when it matches every rule you set, or when you put it in by hand.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(undefined, { onSuccess: () => setName("") });
        }}
        className="mt-4 flex gap-2"
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New catalog name" aria-label="New catalog name" className={`${input} max-w-sm`} />
        <button disabled={!name.trim()} className="btn btn-signal">
          <Plus className="size-4" /> Add
        </button>
      </form>
      {catalogs.isError && <Failed error={catalogs.error} retry={catalogs.refetch} />}
      <ol className="mt-5 border-t border-ink">
        {list.map((catalog, index) => (
          <CatalogRow
            key={catalog.id}
            catalog={catalog}
            sorts={overview?.sorts ?? ["newest"]}
            channels={channels.data?.channels ?? []}
            onUp={index > 0 ? () => move(index, -1) : undefined}
            onDown={index < list.length - 1 ? () => move(index, 1) : undefined}
          />
        ))}
      </ol>
    </Section>
  );
}

function CatalogRow({ catalog, sorts, channels, onUp, onDown }: { catalog: Catalog; sorts: string[]; channels: Channel[]; onUp?: () => void; onDown?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: catalog.name, sort: catalog.sort, cast: catalog.cast.join(", "), tags: catalog.tags.join(", "), keywords: catalog.keywords.join(", "), channels: catalog.channels });
  useEffect(() => setDraft({ name: catalog.name, sort: catalog.sort, cast: catalog.cast.join(", "), tags: catalog.tags.join(", "), keywords: catalog.keywords.join(", "), channels: catalog.channels }), [catalog]);
  const patch = useChange((body: Record<string, unknown>) => api(`${ADMIN}/catalogs/${catalog.id}`, { method: "PATCH", json: body }));
  const restore = useChange(() => api(`${ADMIN}/catalogs/${catalog.id}/restore`, { method: "POST" }), "Restored");
  const remove = useChange(() => api(`${ADMIN}/catalogs/${catalog.id}`, { method: "DELETE" }), "Catalog deleted");
  const rules = [catalog.cast.length && `cast: ${catalog.cast.join(", ")}`, catalog.tags.length && `tags: ${catalog.tags.join(", ")}`, catalog.keywords.length && `words: ${catalog.keywords.join(", ")}`, catalog.channels.length && `${catalog.channels.length} channel${catalog.channels.length > 1 ? "s" : ""}`].filter(Boolean);

  return (
    <li className="border-b border-line">
      <div className="flex flex-wrap items-center gap-3 py-3">
        <div className="flex flex-col">
          <button onClick={onUp} disabled={!onUp} className="grid size-6 place-items-center rounded-[3px] hover:bg-sunk disabled:opacity-25" aria-label={`Move ${catalog.name} up`}>
            <ArrowUp className="size-3.5" />
          </button>
          <button onClick={onDown} disabled={!onDown} className="grid size-6 place-items-center rounded-[3px] hover:bg-sunk disabled:opacity-25" aria-label={`Move ${catalog.name} down`}>
            <ArrowDown className="size-3.5" />
          </button>
        </div>
        <div className="hidden w-48 shrink-0 grid-cols-4 gap-0.5 sm:grid">
          {Array.from({ length: 4 }, (_, index) =>
            catalog.previews[index] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={index} src={catalog.previews[index]} alt="" className="aspect-video w-full rounded-[2px] object-cover" />
            ) : (
              <span key={index} className="aspect-video rounded-[2px] bg-sunk" />
            ),
          )}
        </div>
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <span className="block font-bold">{catalog.name}</span>
          <span className="data mt-0.5 block truncate text-muted">
            {catalog.videos} videos{catalog.all ? ", everything" : rules.length ? `, ${rules.join("; ")}` : ", picked by hand"}
            {catalog.removed > 0 && `, ${catalog.removed} taken out`}
          </span>
        </button>
        <Toggle checked={catalog.enabled} onChange={(enabled) => patch.mutate({ enabled })} label={`Show ${catalog.name}`} />
        <button onClick={() => setOpen(!open)} className="btn btn-line h-9 min-h-0 px-3 text-sm" aria-expanded={open}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <form
          className="grid gap-4 pb-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            patch.mutate(
              catalog.all
                ? { name: draft.name, sort: draft.sort }
                : { name: draft.name, sort: draft.sort, cast: names(draft.cast), tags: names(draft.tags), keywords: names(draft.keywords), channels: draft.channels },
              { onSuccess: () => toast("Catalog saved") },
            );
          }}
        >
          <Field label="Name" htmlFor={`name-${catalog.id}`}>
            <input id={`name-${catalog.id}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} />
          </Field>
          <Field label="Order" htmlFor={`sort-${catalog.id}`}>
            <Dropdown
              id={`sort-${catalog.id}`}
              label="Order"
              value={draft.sort}
              onChange={(sort) => setDraft({ ...draft, sort })}
              options={sorts.map((sort) => ({ value: sort, label: SORT_LABELS[sort] ?? sort }))}
              className={`${input} flex pr-9 aria-expanded:shadow-[inset_0_0_0_2px_var(--color-ink)]`}
            />
          </Field>
          {!catalog.all && (
            <>
              <Field label="Cast" hint="Videos with any of these people." htmlFor={`cast-${catalog.id}`}>
                <input id={`cast-${catalog.id}`} value={draft.cast} onChange={(event) => setDraft({ ...draft, cast: event.target.value })} className={input} />
              </Field>
              <Field label="Tags" hint="Videos with any of these tags." htmlFor={`tags-${catalog.id}`}>
                <input id={`tags-${catalog.id}`} value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} className={input} />
              </Field>
              <Field label="Words" hint="Whole words in the title, caption or file name." htmlFor={`words-${catalog.id}`}>
                <input id={`words-${catalog.id}`} value={draft.keywords} onChange={(event) => setDraft({ ...draft, keywords: event.target.value })} className={input} />
              </Field>
              {channels.length > 0 && (
                <Field label="Channels" hint="Only videos from these channels.">
                  <div className="flex flex-wrap gap-1.5">
                    {channels.map((channel) => {
                      const on = draft.channels.includes(channel.id);
                      return (
                        <button
                          type="button"
                          key={channel.id}
                          className="chip"
                          aria-pressed={on}
                          onClick={() => setDraft({ ...draft, channels: on ? draft.channels.filter((id) => id !== channel.id) : [...draft.channels, channel.id] })}
                        >
                          {channel.title ?? channel.id}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button className="btn btn-signal">Save catalog</button>
            {catalog.removed > 0 && (
              <button type="button" onClick={() => restore.mutate(undefined)} className="btn btn-line">
                <RotateCcw className="size-4" /> Put back {catalog.removed} taken out
              </button>
            )}
            {!catalog.all && (
              <ConfirmButton onConfirm={() => remove.mutate(undefined)} confirm="Delete this catalog?" className="btn btn-line ml-auto text-alarm">
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

//---------------------[ CHANNELS ]---------------------//

export function ChannelsTab() {
  const [polling, setPolling] = useState(false);
  const channels = useAdmin<{ channels: Channel[] }>("channels", "/channels", polling ? 2000 : false);
  const running = channels.data?.channels.some((channel) => channel.import?.running) ?? false;
  useEffect(() => setPolling(running), [running]);
  const [id, setId] = useState("");
  const add = useChange(() => api(`${ADMIN}/channels`, { method: "POST", json: { id } }), "Channel added");

  return (
    <Section title="Channels" count={channels.data?.channels.length}>
      <p className="mt-3 max-w-[70ch] text-muted">Videos posted in these channels join the library on their own. The bot must be an admin of the channel.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(undefined, { onSuccess: () => setId("") });
        }}
        className="mt-4 flex gap-2"
      >
        <input value={id} onChange={(event) => setId(event.target.value)} placeholder="-1001234567890" inputMode="numeric" aria-label="Channel ID" className={`${input} data max-w-xs text-[16px]!`} />
        <button disabled={!id.trim() || add.isPending} className="btn btn-signal">
          <Plus className="size-4" /> Add channel
        </button>
      </form>
      {channels.isError && <Failed error={channels.error} retry={channels.refetch} />}
      <ul className="mt-5 border-t border-ink">
        {(channels.data?.channels ?? []).map((channel) => (
          <ChannelRow key={channel.id} channel={channel} onImport={() => setPolling(true)} />
        ))}
      </ul>
    </Section>
  );
}

function ChannelRow({ channel, onImport }: { channel: Channel; onImport: () => void }) {
  const [last, setLast] = useState("");
  const toggle = useChange((enabled: boolean) => api(`${ADMIN}/channels/${channel.id}`, { method: "PATCH", json: { enabled } }));
  const remove = useChange(() => api(`${ADMIN}/channels/${channel.id}`, { method: "DELETE" }), "Channel removed");
  const start = useChange(() => api(`${ADMIN}/channels/${channel.id}/import`, { method: "POST", json: { last_post: last || null } }), "Import started");
  const job = channel.import;

  return (
    <li className="grid gap-3 border-b border-line py-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <p className="font-bold">{channel.title ?? "Untitled channel"}</p>
        <p className="data text-muted">
          {channel.id}, {channel.videos} videos
        </p>
        {job && (
          <p className={`data mt-1 ${job.error ? "text-alarm" : "text-ink"}`}>
            {job.running ? "Importing: " : job.error ? "Import stopped: " : "Last import: "}
            {job.scanned} posts read, {job.added} added{job.error ? `. ${job.error}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Toggle checked={channel.enabled} onChange={(enabled) => toggle.mutate(enabled)} label={`Watch ${channel.title}`} /> {channel.enabled ? "On" : "Off"}
        </span>
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate(undefined, { onSuccess: onImport });
          }}
        >
          <input value={last} onChange={(event) => setLast(event.target.value.replace(/\D/g, ""))} placeholder="Last post #" aria-label="Import up to post number (optional)" inputMode="numeric" className={`${input} data h-9 w-28 text-[16px]!`} />
          <button disabled={job?.running} className="btn btn-line h-9 min-h-0 px-3 text-sm">
            <Download className="size-4" /> {job?.running ? "Importing" : "Import old posts"}
          </button>
        </form>
        <ConfirmButton onConfirm={() => remove.mutate(undefined)} confirm="Remove?" className="btn btn-line h-9 min-h-0 px-3 text-sm text-alarm">
          <Trash2 className="size-4" />
        </ConfirmButton>
      </div>
    </li>
  );
}

//---------------------[ ADDON ]---------------------//

export function AddonTab({ overview }: { overview?: Overview }) {
  const [copied, setCopied] = useState(false);
  if (!overview) return <Section title="Addon"><div className="skeleton mt-4 h-40" /></Section>;
  const stats: [string, string | number][] = [
    ["Videos", overview.videos.toLocaleString()],
    ["Total size", overview.size],
    ["Cast", overview.cast],
    ["Need cast", overview.uncast],
    ["Hidden", overview.hidden],
  ];
  return (
    <Section title="Addon">
      <dl className="mt-4 grid grid-cols-2 border-t border-l border-line sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="border-r border-b border-line p-4">
            <dt className="data text-muted">{label}</dt>
            <dd className="headline mt-1 text-[2rem] tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 max-w-3xl">
        <h2 className="text-lg font-extrabold tracking-[-0.03em]">Stremio and Nuvio addon</h2>
        <p className="mt-1 text-muted">Install this link in Stremio or Nuvio to browse the library there. Keep it private: anyone with it can play your videos.</p>
        {overview.addon_url ? (
          <>
            <p className="data mt-3 break-all rounded-[4px] bg-paper p-3 text-[0.82rem] shadow-[inset_0_0_0_1px_var(--color-line)] select-all">{overview.addon_url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(overview.addon_url).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="btn btn-signal"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy addon link"}
              </button>
              <a href={overview.addon_url.replace(/^https?:/, "stremio:")} className="btn btn-line">
                <ExternalLink className="size-4" /> Open in Stremio
              </a>
            </div>
          </>
        ) : (
          <p className="mt-3 text-muted">Set ADDON_TOKEN in the server&apos;s settings to turn the addon on.</p>
        )}
      </div>
    </Section>
  );
}
