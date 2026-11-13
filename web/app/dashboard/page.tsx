"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Eye, Film, LogOut, Puzzle, Radio, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AddonTab, CastTab, CatalogsTab, ChannelsTab } from "@/components/admin/library";
import { Media } from "@/components/admin/media";
import { ADMIN, Overview } from "@/components/admin/ui";
import { UsersTab } from "@/components/admin/users";
import { Logo } from "@/components/shell";
import { api } from "@/lib/api";

const TABS = [
  { id: "media", label: "Media", icon: Film },
  { id: "cast", label: "Cast", icon: Users },
  { id: "catalogs", label: "Catalogs", icon: Clapperboard },
  { id: "channels", label: "Channels", icon: Radio },
  { id: "users", label: "Users", icon: UserRound },
  { id: "addon", label: "Addon", icon: Puzzle },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("media");
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<Overview>(`${ADMIN}/overview`) });

  // The tab lives in the hash, so refresh and back keep it
  useEffect(() => {
    const read = () => {
      const hash = location.hash.slice(1).split("-")[0] as Tab;
      if (TABS.some((item) => item.id === hash)) setTab(hash);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    document.title = `${TABS.find((item) => item.id === tab)?.label} | HR Library`;
  }, [tab]);

  const go = (id: Tab) => {
    history.replaceState(null, "", `#${id}`);
    setTab(id);
    scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)] md:h-dvh md:border-r md:border-b-0">
        <div className="flex h-14 items-center gap-3 px-4 md:h-16 md:px-5">
          <Logo />
          <span className="data text-muted">Library</span>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:px-3 md:pb-0" aria-label="Dashboard">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
              className="flex shrink-0 items-center gap-2.5 rounded-[4px] px-3 py-2 text-left text-[0.94rem] font-semibold text-muted hover:bg-sunk hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="hidden border-t border-line px-3 pt-3 md:absolute md:inset-x-0 md:bottom-0 md:block md:pb-4">
          <form action="/view-as-user" method="post">
            <button className="flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2 text-[0.94rem] font-semibold hover:bg-sunk">
              <Eye className="size-4" /> View as user
            </button>
          </form>
          <form action="/logout" method="post">
            <button className="flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2 text-[0.94rem] font-semibold text-muted hover:bg-sunk hover:text-ink">
              <LogOut className="size-4" /> Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 px-4 pt-6 pb-24 md:px-8 md:pt-10">
        {tab === "media" && <Media overview={overview.data} />}
        {tab === "cast" && <CastTab />}
        {tab === "catalogs" && <CatalogsTab overview={overview.data} />}
        {tab === "channels" && <ChannelsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "addon" && <AddonTab overview={overview.data} />}

        <div className="mt-16 flex gap-2 border-t border-line pt-4 md:hidden">
          <form action="/view-as-user" method="post">
            <button className="btn btn-line"><Eye className="size-4" /> View as user</button>
          </form>
          <form action="/logout" method="post">
            <button className="btn btn-line"><LogOut className="size-4" /> Log out</button>
          </form>
        </div>
      </main>
    </div>
  );
}
