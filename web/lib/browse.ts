// Browse state lives in the address, so back/forward, refresh and shared links all keep it.

export type BrowseState = {
  q: string;
  catalog: string;
  cast: string[];
  tag: string[];
  channel: string;
  duration: string;
  quality: string;
  added: string;
  status: string;
  sort: string;
  seed: string;
  page: number;
  size: number;
  view: "grid" | "list";
};

export const DEFAULT_SIZE = 24;

export const OPTIONS = {
  duration: [
    { value: "short", label: "Under 20 min" },
    { value: "medium", label: "20 to 60 min" },
    { value: "long", label: "Over an hour" },
  ],
  quality: [
    { value: "sd", label: "Below 720p" },
    { value: "hd", label: "720p" },
    { value: "fhd", label: "1080p" },
    { value: "uhd", label: "4K" },
  ],
  added: [
    { value: "day", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
    { value: "year", label: "This year" },
  ],
  status: [
    { value: "unwatched", label: "Not started" },
    { value: "in_progress", label: "In progress" },
    { value: "finished", label: "Finished" },
  ],
} as const;

export function readState(params: URLSearchParams): BrowseState {
  const number = (value: string | null, fallback: number) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    q: params.get("q") ?? "",
    catalog: params.get("catalog") ?? "",
    cast: params.getAll("cast"),
    tag: params.getAll("tag"),
    channel: params.get("channel") ?? "",
    duration: params.get("duration") ?? "",
    quality: params.get("quality") ?? "",
    added: params.get("added") ?? "",
    status: params.get("status") ?? "",
    sort: params.get("sort") ?? "",
    seed: params.get("seed") ?? "",
    page: number(params.get("page"), 1),
    size: number(params.get("size"), DEFAULT_SIZE),
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

/** The address for a state. Defaults are left out so links stay short. */
export function writeState(state: BrowseState, keep: [string, string][] = []): string {
  const params = new URLSearchParams(keep.filter(([, value]) => value));
  if (state.q) params.set("q", state.q);
  if (state.catalog) params.set("catalog", state.catalog);
  state.cast.forEach((name) => params.append("cast", name));
  state.tag.forEach((name) => params.append("tag", name));
  for (const key of ["channel", "duration", "quality", "added", "status", "sort"] as const) {
    if (state[key]) params.set(key, state[key]);
  }
  if (state.sort === "random" && state.seed) params.set("seed", state.seed);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.size !== DEFAULT_SIZE) params.set("size", String(state.size));
  if (state.view === "list") params.set("view", "list");
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** How many filters narrow the list, for the phone's Filters button. */
export function filterCount(state: BrowseState, fixed: Partial<Record<string, string>> = {}) {
  let count = state.cast.filter((name) => name !== fixed.cast).length + state.tag.length;
  for (const key of ["catalog", "channel", "duration", "quality", "added", "status"] as const) {
    if (state[key] && !fixed[key]) count++;
  }
  return count;
}

export function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}
