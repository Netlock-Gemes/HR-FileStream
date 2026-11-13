"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Compass, Dices, House, LayoutDashboard, LogOut, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMe, useShuffle } from "@/lib/hooks";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/list", label: "My List", icon: Bookmark },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  return (
    <div className="min-h-dvh">
      {me?.previewing && <PreviewBar />}
      <TopBar />
      <main className="pb-[calc(84px+env(safe-area-inset-bottom,0px))] md:pb-20">{children}</main>
      <TabBar />
    </div>
  );
}

function PreviewBar() {
  return (
    <form
      action="/view-as-admin"
      method="post"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] text-sm text-paper"
    >
      <span>You&apos;re seeing the site as a viewer sees it.</span>
      <button className="font-semibold text-signal underline-offset-4 hover:underline">Back to dashboard</button>
    </form>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[1.12rem] font-extrabold tracking-[-0.04em]">
      <span className="size-2.5 bg-signal" aria-hidden />
      HR Filestream
    </span>
  );
}

function TopBar() {
  const pathname = usePathname();
  const { shuffle, busy } = useShuffle();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 pr-[max(1rem,env(safe-area-inset-right,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] md:h-16 md:px-8">
        <Link href="/" aria-label="HR Filestream home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.filter((item) => item.href !== "/search").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="rounded-[4px] px-3 py-2 text-[0.92rem] font-semibold text-muted transition-colors hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <SearchField />
          <button
            onClick={shuffle}
            disabled={busy}
            className="grid size-11 place-items-center rounded-[4px] text-muted transition-colors hover:text-ink active:scale-95"
            aria-label="Open a random title"
            title="Open a random title"
          >
            <Dices className={`size-5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.8} />
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function SearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState("");
  if (pathname === "/search") return null;
  return (
    <form
      role="search"
      className="hidden lg:block"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`/search${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
      }}
    >
      <label className="flex h-10 w-72 items-center gap-2 rounded-[4px] bg-sunk px-3 text-muted shadow-[inset_0_0_0_1px_transparent] transition-shadow focus-within:bg-paper focus-within:shadow-[inset_0_0_0_1px_var(--color-ink)]">
        <Search className="size-4 shrink-0" strokeWidth={2} />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search titles, cast, tags"
          enterKeyHint="search"
          className="w-full bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
          aria-label="Search the library"
        />
      </label>
    </form>
  );
}

function AccountMenu() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-11 place-items-center"
        aria-label="Account"
      >
        <span className="grid size-8 place-items-center rounded-full bg-signal text-sm font-bold text-ink">
          {me?.name?.[0]?.toUpperCase() ?? ""}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] w-60 animate-[rise_140ms_var(--ease-out)] rounded-[6px] border border-line bg-paper p-1.5 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.3)]"
        >
          <p className="border-b border-line px-3 pb-2.5 pt-2 text-sm text-muted">
            Signed in as <span className="font-semibold text-ink">{me?.name}</span>
          </p>
          {me?.role === "admin" && (
            <form action="/view-as-admin" method="post">
              <button role="menuitem" className="mt-1 flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-left text-[0.94rem] font-semibold hover:bg-sunk">
                <LayoutDashboard className="size-4" /> Open dashboard
              </button>
            </form>
          )}
          <form action="/logout" method="post">
            <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-left text-[0.94rem] font-semibold hover:bg-sunk">
              <LogOut className="size-4" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/[0.97] pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      <ul className="grid grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-[60px] flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold text-faint transition-colors active:scale-95 aria-[current=page]:text-ink"
              >
                {active && <span className="absolute inset-x-6 top-0 h-[2px] bg-signal" />}
                <Icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
