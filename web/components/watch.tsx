"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, ExternalLink, ImageDown, Play, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { clock } from "@/lib/format";
import type { PublicFile } from "@/lib/types";
import { Still } from "./cards";
import type { PlayerHandle } from "./player";

const SYNC_EVERY = 10_000;
const LOCAL_EVERY = 5_000;
const AUTOPLAY_SECONDS = 10;
const FRAME_SIDE = 1280;

export function intent(url: string, pkg: string) {
  return `intent:${url}#Intent;package=${pkg};type=video/*;end`;
}

export function useAndroid() {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(/android/i.test(navigator.userAgent)), []);
  return android;
}

function local(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
  return null;
}

/**
 * Keeps a viewer's place: this browser every 5 s, the account every 10 s and on pause,
 * end and page hide. On load it resumes from the newest of the two, unless told to start over.
 */
export function useWatchProgress({
  id,
  url,
  tracked,
  player,
  serverPosition,
  startOver,
}: {
  id: string;
  url: string;
  tracked: boolean;
  player: React.RefObject<PlayerHandle | null>;
  serverPosition: () => Promise<number>;
  startOver: boolean;
}) {
  const synced = useRef(0);
  const savedLocally = useRef(0);
  const resumed = useRef(false);
  const [ended, setEnded] = useState(false);
  const key = `hrp:${url}`;

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

  const latest = useRef(sync);
  latest.current = sync;
  useEffect(() => {
    const onHide = () => {
      if (player.current?.video && !player.current.video.paused) latest.current(true);
    };
    addEventListener("pagehide", onHide);
    return () => {
      removeEventListener("pagehide", onHide);
      // Leaving the page mid-film through the app's own links still saves the place
      onHide();
    };
  }, [player]);

  return {
    ended,
    setEnded,
    onLoaded: (video: HTMLVideoElement) => {
      if (resumed.current || startOver) return;
      const here = Number(local(key)) || 0;
      const apply = (position: number) => {
        if (resumed.current) return;
        resumed.current = true;
        if (position > 15 && position < video.duration - 30 && video.currentTime < 5) {
          video.currentTime = position;
          player.current?.flash(`Resumed at ${clock(position)}`);
        }
      };
      if (!tracked) return apply(here);
      serverPosition().then((position) => apply(position || here), () => apply(here));
    },
    onTime: (time: number, duration: number, playing: boolean) => {
      if (!playing) return;
      sync();
      if (Date.now() - savedLocally.current > LOCAL_EVERY) {
        savedLocally.current = Date.now();
        local(key, String(time));
      }
      if (ended && time < duration - 1) setEnded(false);
    },
    onPause: () => {
      sync(true);
      const video = player.current?.video;
      if (video) local(key, String(video.currentTime));
    },
    onEnded: () => {
      sync(true);
      local(key, null);
      setEnded(true);
    },
  };
}

/** Copy link, download, external players and, for the admin, the frame-as-thumbnail tool. */
export function Actions({ file, player, className = "" }: { file: PublicFile; player: React.RefObject<PlayerHandle | null>; className?: string }) {
  const android = useAndroid();
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

  const action = "flex items-center gap-2 border-r border-line px-4 py-3 text-[0.9rem] font-semibold hover:bg-paper last:border-r-0 whitespace-nowrap";
  return (
    <div className={`no-scrollbar overflow-x-auto ${className}`}>
      <div className="flex w-max border border-line bg-bg">
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
    if (!video || video.readyState < 2) return Promise.reject(new Error("Play the video to the frame you want, then try again."));
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

/** When a film ends, the next one counts down, with a way out. */
export function UpNext({ card, href, go, onCancel }: { card: { id: string; title: string; poster: string }; href: string; go?: (href: string) => void; onCancel: () => void }) {
  const [left, setLeft] = useState(AUTOPLAY_SECONDS);
  useEffect(() => {
    if (left <= 0) {
      if (go) go(href);
      else location.href = href;
      return;
    }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, href]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <a
          href={href}
          onClick={(event) => {
            if (!go) return;
            event.preventDefault();
            go(href);
          }}
          className="btn btn-signal h-10 flex-1"
        >
          <Play className="size-4 fill-current" /> Play now
        </a>
        <button onClick={onCancel} className="btn btn-line h-10" aria-label="Cancel autoplay">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
