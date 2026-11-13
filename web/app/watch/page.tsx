"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Facts } from "@/components/cards";
import { Player, PlayerHandle } from "@/components/player";
import { Logo } from "@/components/shell";
import { Empty } from "@/components/states";
import { Actions, intent, UpNext, useAndroid, useWatchProgress } from "@/components/watch";
import { api } from "@/lib/api";
import type { PublicFile, Title } from "@/lib/types";

/** /watch/{id}, /mx/{id} or ?id= */
function readId() {
  const match = location.pathname.match(/^\/(watch|mx)\/([^/]+)/);
  return { id: match?.[2] ?? new URLSearchParams(location.search).get("id") ?? "", mx: match?.[1] === "mx" };
}

/**
 * Shared stream links. They play without a login, as they always have. A signed-in viewer
 * opening a library film is moved to its title page, which is where films play now.
 */
export default function WatchPage() {
  const [where, setWhere] = useState<{ id: string; mx: boolean } | null>(null);
  useEffect(() => setWhere(readId()), []);
  if (!where) return <div className="min-h-dvh bg-bg" />;
  return <Watch id={where.id} mx={where.mx} />;
}

function Watch({ id, mx }: { id: string; mx: boolean }) {
  const file = useQuery({ queryKey: ["file", id], queryFn: () => api<PublicFile>(`/api/public/file/${id}`), enabled: !!id, retry: 1 });
  const data = file.data;
  const tracked = !!data?.signed_in && !!data?.library;
  const title = useQuery({ queryKey: ["title", id], queryFn: () => api<Title>(`/api/title/${id}`), enabled: tracked });
  const player = useRef<PlayerHandle>(null);
  const android = useAndroid();
  const toTitle = !!data && data.library && data.signed_in && data.home_url === "/" && !mx;

  const progress = useWatchProgress({
    id,
    url: data?.url ?? "",
    tracked,
    player,
    startOver: typeof location !== "undefined" && new URLSearchParams(location.search).get("t") === "0",
    serverPosition: () => (title.data ? Promise.resolve(title.data.position) : title.refetch().then((result) => result.data?.position ?? 0)),
  });

  useEffect(() => {
    if (toTitle) {
      const startOver = new URLSearchParams(location.search).get("t") === "0";
      location.replace(`/title?id=${id}&play=1${startOver ? "&t=0" : ""}`);
    }
  }, [toTitle, id]);

  useEffect(() => {
    if (data) document.title = `${data.title} | HR Filestream`;
  }, [data]);

  // /mx/ links hand the file straight to MX Player on Android
  useEffect(() => {
    if (mx && data && android) location.href = intent(data.url, "com.mxtech.videoplayer.pro");
  }, [mx, data, android]);

  if (!id || file.isError) {
    return (
      <Frame back={null}>
        <Empty title="This link doesn't work" action={<Link href="/" className="btn btn-line">Go home</Link>}>
          The file may have been removed, or the link is incomplete.
        </Empty>
      </Frame>
    );
  }
  if (!data || toTitle) {
    return (
      <Frame back={null}>
        <div className="skeleton mx-auto aspect-video w-full max-w-[1600px]" />
      </Frame>
    );
  }

  const next = title.data?.more?.[0];

  return (
    <Frame back={data.home_url} title={data.title}>
      <div className="bg-black">
        {data.video ? (
          <div className="relative mx-auto max-w-[1600px]">
            <Player
              ref={player}
              src={data.url}
              poster={data.poster}
              title={data.title}
              onLoaded={progress.onLoaded}
              onTime={progress.onTime}
              onPause={progress.onPause}
              onEnded={progress.onEnded}
            >
              {progress.ended && next && <UpNext card={next} href={`/watch/${next.id}`} onCancel={() => progress.setEnded(false)} />}
            </Player>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1600px] place-items-center px-4 py-20 text-center text-white">
            <div>
              <p className="data text-white/60">{data.mime || "File"}</p>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">{data.file_name}</p>
              <a href={data.url} className="btn btn-signal mt-6">
                <Download className="size-4" /> Download {data.size}
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1600px] px-4 pb-16 md:px-8">
        <div className="grid gap-6 border-b border-ink py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <h1 className="headline text-[1.9rem] md:text-[2.6rem]">{data.title}</h1>
            <p className="data mt-2 flex flex-wrap gap-x-4 text-muted">
              <span>{data.size}</span>
              {title.data && <Facts card={title.data} />}
              {data.cast.length > 0 && <span className="font-sans text-[0.9rem]">With {data.cast.join(", ")}</span>}
            </p>
          </div>
        </div>
        <Actions file={data} player={player} className="mt-4" />
        {mx && !android && <p className="mt-4 text-sm text-muted">MX Player opens on Android phones. On this device, play it here or open it in VLC.</p>}
      </div>
    </Frame>
  );
}

function Frame({ back, title, children }: { back: string | null | undefined; title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 md:px-8">
          {back ? (
            <Link href={back} className="-ml-2 flex items-center gap-1.5 rounded-[4px] px-2 py-2 text-sm font-semibold hover:bg-sunk">
              <ArrowLeft className="size-4" /> {back === "/dashboard" ? "Dashboard" : "Home"}
            </Link>
          ) : (
            <Logo />
          )}
          {title && <span className="truncate text-sm text-muted md:hidden">{title}</span>}
        </div>
      </header>
      {children}
    </div>
  );
}
