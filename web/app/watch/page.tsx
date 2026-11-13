"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, ExternalLink, ImageDown, Play, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Facts, Still } from "@/components/cards";
import { Player, PlayerHandle } from "@/components/player";
import { Logo } from "@/components/shell";
import { Empty } from "@/components/states";
import { api } from "@/lib/api";
import { clock } from "@/lib/format";
import type { PublicFile, Title } from "@/lib/types";

const SYNC_EVERY = 10_000;
const LOCAL_EVERY = 5_000;
const AUTOPLAY_SECONDS = 10;
const FRAME_SIDE = 1280;

/** /watch/{id}, /mx/{id} or ?id= */
function readId() {
  const match = location.pathname.match(/^\/(watch|mx)\/([^/]+)/);
  return { id: match?.[2] ?? new URLSearchParams(location.search).get("id") ?? "", mx: match?.[1] === "mx" };
}

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
  const synced = useRef(0);
  const savedLocally = useRef(0);
  const resumed = useRef(false);
  const [ended, setEnded] = useState(false);
  const android = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  useEffect(() => {
    if (data) document.title = `${data.title} | HR Filestream`;
  }, [data]);

  // /mx/ links hand the file straight to MX Player on Android
  useEffect(() => {
    if (mx && data && android) location.href = intent(data.url, "com.mxtech.videoplayer.pro");
  }, [mx, data, android]);

  const localKey = data ? `hrp:${data.url}` : "";

  const sync = (force = false) => {
    const video = player.current?.video;
    if (!tracked || !video || !Number.isFinite(video.duration) || !video.duration) return;
    if (!force && Date.now() - synced.current < SYNC_EVERY) return;
    synced.current = Date.now();
    fetch(`/api/progress/${id}`, {
      method: "PUT",
      keepalive: true,
      credentials: "same-origin",
      headers: { "X-HR-Dashboard": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ position: Math.min(video.currentTime, video.duration), duration: video.duration }),
    }).catch(() => {});
  };

  useEffect(() => {
    const onHide = () => {
      if (player.current?.video && !player.current.video.paused) sync(true);
    };
    addEventListener("pagehide", onHide);
    return () => removeEventListener("pagehide", onHide);
  });

  // Resume: the latest position from any device wins over this browser's own; ?t=0 starts over
  const resume = (video: HTMLVideoElement) => {
    if (resumed.current || new URLSearchParams(location.search).get("t") === "0") return;
    const local = Number((() => { try { return localStorage.getItem(localKey); } catch { return null; } })()) || 0;
    const apply = (position: number) => {
      if (resumed.current) return;
      resumed.current = true;
      if (position > 15 && position < video.duration - 30 && video.currentTime < 5) {
        video.currentTime = position;
        player.current?.flash(`Resumed at ${clock(position)}`);
      }
    };
    if (!tracked) return apply(local);
    if (title.data) return apply(title.data.position || local);
    title.refetch().then((result) => apply(result.data?.position || local));
  };

  if (!id || file.isError) {
    return (
      <Frame back={null}>
        <Empty title="This link doesn't work" action={<Link href="/" className="btn btn-line">Go home</Link>}>
          The file may have been removed, or the link is incomplete.
        </Empty>
      </Frame>
    );
  }
  if (!data) {
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
              onLoaded={resume}
              onTime={(time, duration, playing) => {
                if (!playing) return;
                sync();
                if (Date.now() - savedLocally.current > LOCAL_EVERY && localKey) {
                  savedLocally.current = Date.now();
                  try { localStorage.setItem(localKey, String(time)); } catch { /* private mode */ }
                }
                if (ended && time < duration - 1) setEnded(false);
              }}
              onPause={() => {
                sync(true);
                const video = player.current?.video;
                if (video && localKey) try { localStorage.setItem(localKey, String(video.currentTime)); } catch { /* private mode */ }
              }}
              onEnded={() => {
                sync(true);
                try { localStorage.removeItem(localKey); } catch { /* private mode */ }
                setEnded(true);
              }}
            />
            {ended && next && <UpNext card={next} onCancel={() => setEnded(false)} />}
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
          {data.library && data.signed_in && (
            <Link href={`/title?id=${data.id}`} className="text-sm font-semibold decoration-signal decoration-2 underline-offset-4 hover:underline">
              Title details
            </Link>
          )}
        </div>
        <Actions file={data} android={android} player={player} />
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

function intent(url: string, pkg: string) {
  return `intent:${url}#Intent;package=${pkg};type=video/*;end`;
}

function Actions({ file, android, player }: { file: PublicFile; android: boolean; player: React.RefObject<PlayerHandle | null> }) {
  const [copied, setCopied] = useState(false);
  const owner = useQuery({
    queryKey: ["poster-info", file.id],
    queryFn: () => api<{ poster: string; poster_custom: boolean }>(`/dashboard/api/media/${file.id}/poster`),
    enabled: file.admin && file.library && file.video,
    retry: false,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.named_url);
    } catch {
      const area = document.createElement("textarea");
      area.value = file.named_url;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const action = "flex items-center gap-2 border-r border-line px-4 py-3.5 text-[0.92rem] font-semibold hover:bg-paper last:border-r-0 whitespace-nowrap";
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max border-b border-line md:w-auto">
        <button onClick={copy} className={action}>
          {copied ? <Check className="size-4 text-signal-deep" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
        </button>
        <a href={file.url} download className={action}>
          <Download className="size-4" /> Download
        </a>
        {file.video && (
          <a href={`vlc://${file.url}`} className={action}>
            <ExternalLink className="size-4" /> VLC
          </a>
        )}
        {file.video && android && (
          <>
            <a href={intent(file.url, "com.mxtech.videoplayer.ad")} className={action}>
              <ExternalLink className="size-4" /> MX Player
            </a>
            <a href={intent(file.url, "com.mxtech.videoplayer.pro")} className={action}>
              <ExternalLink className="size-4" /> MX Player Pro
            </a>
          </>
        )}
        {owner.data && <SaveFrame id={file.id} info={owner.data} player={player} className={action} />}
      </div>
    </div>
  );
}

/** Admin only: the frame on screen becomes the title's thumbnail, with undo. */
function SaveFrame({ id, info, player, className }: { id: string; info: { poster: string; poster_custom: boolean }; player: React.RefObject<PlayerHandle | null>; className: string }) {
  const [current, setCurrent] = useState(info);

  const put = async (method: "PUT" | "DELETE", body?: Blob) => {
    const response = await fetch(`/dashboard/api/media/${id}/poster`, { method, body, credentials: "same-origin", headers: { "X-HR-Dashboard": "1" } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Couldn't save it.");
    return response.json();
  };

  const capture = (): Promise<Blob> => {
    const video = player.current?.video;
    if (!video || video.readyState < 2) return Promise.reject(new Error("Wait for the picture to load, then try again."));
    const scale = Math.min(FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight), 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("That frame came out empty."))), "image/jpeg", 0.82));
  };

  const save = async () => {
    let frame: Blob;
    try {
      frame = await capture();
    } catch (error) {
      toast.error((error as Error).name === "SecurityError" ? "This browser blocked saving the frame." : (error as Error).message);
      return;
    }
    const before = current;
    // A custom poster only comes back from a copy; a Telegram one is fetched again
    const previous = before.poster_custom ? await fetch(before.poster).then((r) => r.blob()).catch(() => null) : null;
    const saving = toast.loading("Saving the frame");
    try {
      setCurrent(await put("PUT", frame));
      const canUndo = !before.poster_custom || previous;
      toast.success("Saved as the thumbnail", {
        id: saving,
        icon: <ImageDown className="size-4" />,
        action: canUndo
          ? {
              label: <span className="flex items-center gap-1"><Undo2 className="size-3.5" /> Undo</span>,
              onClick: async () => {
                try {
                  setCurrent(await put(previous ? "PUT" : "DELETE", previous ?? undefined));
                  toast("Thumbnail restored");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              },
            }
          : undefined,
        duration: 7000,
      });
    } catch (error) {
      toast.error((error as Error).message, { id: saving });
    }
  };

  return (
    <button onClick={save} className={className}>
      <ImageDown className="size-4" /> Use frame as thumbnail
    </button>
  );
}

function UpNext({ card, onCancel }: { card: { id: string; title: string; poster: string }; onCancel: () => void }) {
  const [left, setLeft] = useState(AUTOPLAY_SECONDS);
  useEffect(() => {
    if (left <= 0) {
      location.href = `/watch/${card.id}`;
      return;
    }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, card.id]);

  return (
    <div className="absolute right-3 bottom-20 z-10 w-[min(340px,calc(100%-1.5rem))] animate-[rise_240ms_var(--ease-out)] rounded-[6px] bg-paper p-3 text-ink shadow-2xl md:right-5">
      <div className="flex gap-3">
        <Still src={card.poster} className="aspect-video w-28 shrink-0 rounded-[3px]" />
        <div className="min-w-0">
          <p className="data text-muted">Up next in {left}s</p>
          <p className="mt-0.5 line-clamp-2 font-bold leading-snug">{card.title}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <a href={`/watch/${card.id}`} className="btn btn-signal h-10 flex-1">
          <Play className="size-4 fill-current" /> Play now
        </a>
        <button onClick={onCancel} className="btn btn-line h-10" aria-label="Cancel autoplay">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
