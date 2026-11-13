export type Card = {
  id: string;
  title: string;
  poster: string;
  duration: number;
  height: number;
  size: number;
  cast: string[];
  tags: string[];
  added: number;
  progress?: number;
};

export type Face = { id: string; name: string; photo: string | null; videos: number };

export type HeroCard = Card & { description: string };

export type Home = {
  hero: HeroCard[];
  continue: Card[];
  saved: Card[];
  discover: Card[];
  rows: { id: string; name: string; items: Card[]; total: number }[];
  cast: Face[];
  total: number;
};

export type Title = Card & {
  position: number;
  description: string;
  file_name: string;
  people: Face[];
  saved: boolean;
  more: Card[];
};

export type VideoPage = {
  items: Card[];
  total: number;
  page: number;
  pages: number;
  size: number;
  sort: string;
  seed: string | null;
};

export type Facets = {
  catalogs: { id: string; name: string }[];
  cast: Face[];
  tags: { name: string; videos: number }[];
  channels: { id: number; title: string; videos: number }[];
  sorts: string[];
  page_sizes: number[];
  total: number;
};

export type Me = { name: string; role: "admin" | "viewer"; previewing: boolean };

export type PublicFile = {
  id: string;
  title: string;
  file_name: string;
  mime: string;
  video: boolean;
  size: string;
  url: string;
  named_url: string;
  poster: string | null;
  library: boolean;
  cast: string[];
  signed_in: boolean;
  admin: boolean;
  home_url: string | null;
};
