"use client";

import {
  FastForward,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { clock } from "@/lib/format";

const SKIP = 10;
const HIDE_AFTER = 2600;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HOLD_MS = 450;
const HOLD_SPEED = 2;
// A finger that moves further than this is scrolling or swiping, not holding
const HOLD_SLOP = 12;

function recall(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export type PlayerHandle = { video: HTMLVideoElement | null; flash: (text: string) => void };

type Props = {
  src: string;
  poster?: string | null;
  title: string;
  onTime?: (time: number, duration: number, playing: boolean) => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoaded?: (video: HTMLVideoElement) => void;
  onFailed?: () => void;
  /** Starts playing as soon as it can (the click that opened it counts as the gesture). */
  autoPlay?: boolean;
  /** Keeps the box the page already gave it instead of taking the film's own shape. */
  inline?: boolean;
  children?: React.ReactNode;
};

/**
 * The film is the one dark thing on the page. Controls hide while it plays; the seek bar
 * shows what's buffered and seeks only on release, so dragging doesn't fire a burst of range requests.
 */
export const Player = forwardRef<PlayerHandle, Props>(function Player({ src, poster, title, onTime, onPause, onEnded, onLoaded, onFailed, autoPlay = false, inline = false, children }, ref) {
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scrub = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef(0);
  // Press and hold on the picture plays at 2x until release, like YouTube
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdFrom = useRef<{ x: number; y: number } | null>(null);
  const held = useRef<number | null>(null);
  const [boost, setBoost] = useState(false);
  const pendingRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<[number, number][]>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState(true);
  const [drag, setDrag] = useState<number | null>(null);
  // Where a seek is headed. The video reports its old time until the seek lands, so the bar shows this meanwhile.
  const [target, setTarget] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const [remaining, setRemaining] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [speedMenu, setSpeedMenu] = useState(false);
  const [toast, setToast] = useState<{ text: string; side: "left" | "right" | "center"; key: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState("16 / 9");

  const flash = useCallback((text: string, side: "left" | "right" | "center" = "center") => {
    setToast({ text, side, key: Date.now() });
  }, []);
  useImperativeHandle(ref, () => ({ video: video.current, flash }), [flash]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 900);
    return () => clearTimeout(timer);
  }, [toast]);

  const showControls = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (video.current && !video.current.paused) {
        setControls(false);
        setSpeedMenu(false);
      }
    }, HIDE_AFTER);
  }, []);

  const toggle = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {});
    else element.pause();
  }, []);

  const seekBy = useCallback(
    (seconds: number) => {
      const element = video.current;
      if (!element || !Number.isFinite(element.duration)) return;
      const next = Math.min(Math.max((element.seeking && pendingRef.current !== null ? pendingRef.current : element.currentTime) + seconds, 0), element.duration);
      pendingRef.current = next;
      setTarget(next);
      element.currentTime = next;
      flash(seconds > 0 ? `+${seconds}s` : `${seconds}s`, seconds > 0 ? "right" : "left");
      showControls();
    },
    [flash, showControls],
  );

  const changeVolume = useCallback((value: number) => {
    const element = video.current;
    if (!element) return;
    element.volume = Math.min(Math.max(value, 0), 1);
    element.muted = element.volume === 0;
    remember("hrp:volume", String(element.volume));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = stage.current;
    const media = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) return document.exitFullscreen();
    if (element?.requestFullscreen) {
      await element.requestFullscreen().catch(() => {});
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape").catch(() => {});
    } else media?.webkitEnterFullscreen?.(); // iPhone only offers the system player
  }, []);

  // Saved volume and speed
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const savedVolume = Number(recall("hrp:volume"));
    if (recall("hrp:volume") !== null && Number.isFinite(savedVolume)) element.volume = savedVolume;
    const savedSpeed = Number(recall("hrp:speed"));
    if (SPEEDS.includes(savedSpeed)) element.playbackRate = savedSpeed;
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keyboard, as in every desktop player
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const element = video.current;
      if (!element) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") {
        if (target.closest("button, a") && key === " ") return;
        event.preventDefault();
        toggle();
      } else if (key === "arrowleft" || key === "j") {
        event.preventDefault();
        seekBy(-SKIP);
      } else if (key === "arrowright" || key === "l") {
        event.preventDefault();
        seekBy(SKIP);
      } else if (key === "arrowup") {
        event.preventDefault();
        changeVolume(element.volume + 0.05);
        flash(`Volume ${Math.round(element.volume * 100)}%`);
      } else if (key === "arrowdown") {
        event.preventDefault();
        changeVolume(element.volume - 0.05);
        flash(`Volume ${Math.round(element.volume * 100)}%`);
      } else if (key === "m") {
        element.muted = !element.muted;
        flash(element.muted ? "Muted" : "Sound on");
      } else if (key === "f") {
        toggleFullscreen();
      } else if (/^[0-9]$/.test(key) && Number.isFinite(element.duration)) {
        const goal = (element.duration * Number(key)) / 10;
        pendingRef.current = goal;
        setTarget(goal);
        element.currentTime = goal;
      } else return;
      showControls();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, seekBy, changeVolume, toggleFullscreen, showControls, flash]);

  const drawBuffered = () => {
    const element = video.current;
    if (!element) return;
    const ranges: [number, number][] = [];
    for (let index = 0; index < element.buffered.length; index++) ranges.push([element.buffered.start(index), element.buffered.end(index)]);
    setBuffered(ranges);
  };

  const timeAt = (clientX: number) => {
    const box = scrub.current!.getBoundingClientRect();
    const share = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    return { share, time: share * (duration || 0), x: share * box.width };
  };

  // Mouse: click plays, double click goes full screen. Touch: tap shows controls, double tap on a side skips.
  const onScreenTap = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement) !== video.current) return;
    const box = stage.current!.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const now = Date.now();
    const double = now - lastTap.current < 280;
    lastTap.current = now;
    if (event.pointerType === "touch") {
      if (double && (x < 0.38 || x > 0.62)) {
        clearTimeout(tapTimer.current);
        seekBy(x < 0.5 ? -SKIP : SKIP);
        return;
      }
      tapTimer.current = setTimeout(() => {
        if (controls && playing) {
          clearTimeout(hideTimer.current);
          setControls(false);
        } else showControls();
      }, 240);
      return;
    }
    clearTimeout(tapTimer.current);
    if (double) {
      toggleFullscreen();
      return;
    }
    tapTimer.current = setTimeout(toggle, 240);
  };

  const startHold = (event: React.PointerEvent) => {
    const element = video.current;
    if (!element || element.paused || (event.pointerType === "mouse" && event.button !== 0)) return;
    holdFrom.current = { x: event.clientX, y: event.clientY };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = element.playbackRate;
      element.playbackRate = Math.max(HOLD_SPEED, element.playbackRate);
      setBoost(true);
      clearTimeout(tapTimer.current);
      clearTimeout(hideTimer.current);
      setControls(false);
      setSpeedMenu(false);
      navigator.vibrate?.(12);
    }, HOLD_MS);
  };

  const moveHold = (event: React.PointerEvent) => {
    const from = holdFrom.current;
    if (from && held.current === null && Math.hypot(event.clientX - from.x, event.clientY - from.y) > HOLD_SLOP) {
      clearTimeout(holdTimer.current);
      holdFrom.current = null;
    }
  };

  /** Ends a hold. Returns true when the press was a hold, so it doesn't also count as a tap. */
  const endHold = () => {
    clearTimeout(holdTimer.current);
    holdFrom.current = null;
    if (held.current === null) return false;
    if (video.current) video.current.playbackRate = held.current;
    held.current = null;
    setBoost(false);
    return true;
  };

  const shown = drag ?? target ?? time;
  const visible = controls || !playing || speedMenu;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={stage}
      tabIndex={-1}
      className={`group/stage relative mx-auto w-full overflow-hidden bg-black text-white outline-none select-none focus-visible:outline-none ${
        fullscreen ? "h-full" : inline ? "aspect-video" : "max-h-[calc(100dvh-8rem)]"
      } ${visible ? "" : "cursor-none"}`}
      style={fullscreen || inline ? undefined : { aspectRatio: ratio }}
      onPointerMove={(event) => event.pointerType !== "touch" && showControls()}
      onPointerLeave={(event) => event.pointerType !== "touch" && playing && setControls(false)}
      // A mouse or touch press shouldn't leave focus on a control: otherwise the next key press
      // makes the browser draw a focus outline on it. Keyboard (Tab) focus still shows as usual.
      onPointerUp={(event) => {
        if ((event.target as HTMLElement).closest('[role="menu"]')) return;
        setTimeout(() => {
          const active = document.activeElement;
          if (active && active !== stage.current && stage.current?.contains(active)) stage.current.focus({ preventScroll: true });
        }, 0);
      }}
    >
      <video
        ref={video}
        src={src}
        poster={poster ?? undefined}
        preload="metadata"
        autoPlay={autoPlay}
        playsInline
        crossOrigin="anonymous"
        className="absolute inset-0 size-full object-contain"
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={(event) => {
          if (!endHold()) onScreenTap(event);
        }}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        // A long press would otherwise open the browser's save-video menu
        onContextMenu={(event) => event.preventDefault()}
        style={{ WebkitTouchCallout: "none" }}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControls(true);
          onPause?.();
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={(event) => {
          setWaiting(false);
          if (!event.currentTarget.seeking) {
            pendingRef.current = null;
            setTarget(null);
            setTime(event.currentTarget.currentTime);
          }
        }}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          setDuration(element.duration);
          if (element.videoWidth) setRatio(`${element.videoWidth} / ${element.videoHeight}`);
          onLoaded?.(element);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setTime(element.currentTime);
          onTime?.(element.currentTime, element.duration, !element.paused);
        }}
        onProgress={drawBuffered}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)}
        onEnded={() => {
          setControls(true);
          onEnded?.();
        }}
        onError={() => {
          setFailed(true);
          onFailed?.();
        }}
      />

      {!started && !failed && (
        <button onClick={toggle} className="absolute inset-0 grid place-items-center bg-black/25" aria-label={`Play ${title}`}>
          <span className="grid size-20 place-items-center rounded-full bg-signal text-ink transition-transform hover:scale-105 active:scale-95 md:size-24">
            <Play className="ml-1.5 size-9 fill-current md:size-10" />
          </span>
        </button>
      )}

      {waiting && started && !failed && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-12 animate-spin text-white/90" strokeWidth={1.6} />
        </span>
      )}

      {boost && (
        <span className="data pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 animate-[fade-in_120ms_ease-out] items-center gap-1.5 rounded-full bg-black/65 px-3.5 py-1.5 text-[0.85rem] text-white">
          {HOLD_SPEED}× <FastForward className="size-4 fill-current" />
        </span>
      )}

      {toast && (
        <span
          key={toast.key}
          className={`data pointer-events-none absolute top-1/2 -translate-y-1/2 animate-[fade-in_120ms_ease-out] rounded-[4px] bg-black/70 px-3 py-2 text-sm text-white ${
            toast.side === "left" ? "left-[18%]" : toast.side === "right" ? "right-[18%]" : "left-1/2 -translate-x-1/2"
          }`}
        >
          {toast.text}
        </span>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-16 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] transition-opacity duration-300 md:px-5 ${
          visible && started ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          ref={scrub}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration || 0)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
          className="group/seek relative flex h-6 cursor-pointer touch-none items-center outline-none focus:outline-none focus-visible:outline-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(timeAt(event.clientX).time);
          }}
          onPointerMove={(event) => {
            const at = timeAt(event.clientX);
            if (event.pointerType !== "touch") setHover({ x: at.x, time: at.time });
            if (drag !== null) setDrag(at.time);
          }}
          onPointerLeave={() => setHover(null)}
          onPointerUp={(event) => {
            if (drag === null) return;
            const goal = timeAt(event.clientX).time;
            if (video.current && Number.isFinite(goal)) {
              pendingRef.current = goal;
              setTarget(goal);
              video.current.currentTime = goal;
            }
            setDrag(null);
            showControls();
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <span className="relative h-[3px] w-full bg-white/25 transition-[height] group-hover/seek:h-[5px]">
            {duration > 0 &&
              buffered.map(([start, end]) => (
                <span key={start} className="absolute inset-y-0 bg-white/40" style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }} />
              ))}
            <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${duration ? (shown / duration) * 100 : 0}%` }} />
          </span>
          <span
            className={`absolute size-3.5 -translate-x-1/2 rounded-full bg-signal transition-transform ${drag !== null ? "scale-125" : "scale-0 group-hover/seek:scale-100"}`}
            style={{ left: `${duration ? (shown / duration) * 100 : 0}%` }}
          />
          {(hover || drag !== null) && duration > 0 && (
            <span
              className="data pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-[3px] bg-white px-1.5 py-0.5 text-[0.75rem] text-[#0c0c0c]"
              style={{ left: drag !== null ? `${(drag / duration) * 100}%` : hover!.x }}
            >
              {clock(drag ?? hover!.time)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 md:gap-1">
          <Control label={playing ? "Pause (k)" : "Play (k)"} onClick={toggle}>
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </Control>
          <Control label="Back 10 seconds (j)" onClick={() => seekBy(-SKIP)}>
            <RotateCcw className="size-5" />
          </Control>
          <Control label="Forward 10 seconds (l)" onClick={() => seekBy(SKIP)}>
            <RotateCw className="size-5" />
          </Control>
          <div className="group/volume hidden items-center md:flex">
            <Control label={muted ? "Unmute (m)" : "Mute (m)"} onClick={() => video.current && (video.current.muted = !video.current.muted)}>
              <VolumeIcon className="size-5" />
            </Control>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer accent-[var(--color-signal)] opacity-0 transition-all duration-200 group-hover/volume:w-20 group-hover/volume:opacity-100 focus:w-20 focus:opacity-100"
            />
          </div>
          <button onClick={() => setRemaining(!remaining)} className="data ml-1 px-1.5 text-[0.8rem] text-white/90" aria-label="Switch between elapsed and remaining time">
            {remaining ? `-${clock(duration - shown)}` : clock(shown)} <span className="text-white/50">/ {clock(duration)}</span>
          </button>
          <div className="ml-auto flex items-center gap-0.5 md:gap-1">
            <div className="relative">
              <Control label="Playback speed" onClick={() => setSpeedMenu(!speedMenu)} expanded={speedMenu}>
                {speed === 1 ? <Gauge className="size-5" /> : <span className="data text-[0.8rem] font-semibold">{speed}×</span>}
              </Control>
              {speedMenu && (
                <ul role="menu" className="absolute right-0 bottom-12 w-32 rounded-[4px] bg-paper p-1 text-ink shadow-xl">
                  {SPEEDS.map((value) => (
                    <li key={value}>
                      <button
                        role="menuitemradio"
                        aria-checked={speed === value}
                        onClick={() => {
                          if (video.current) video.current.playbackRate = value;
                          remember("hrp:speed", String(value));
                          setSpeedMenu(false);
                        }}
                        className="data flex w-full items-center rounded-[3px] px-2.5 py-2 text-left text-[0.82rem] hover:bg-sunk aria-checked:bg-signal"
                      >
                        {value === 1 ? "Normal" : `${value}×`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {typeof document !== "undefined" && document.pictureInPictureEnabled && (
              <Control
                label="Picture in picture"
                onClick={() => {
                  const request = document.pictureInPictureElement ? document.exitPictureInPicture() : video.current?.requestPictureInPicture();
                  request?.catch(() => {});
                }}
              >
                <PictureInPicture2 className="size-5" />
              </Control>
            )}
            <Control label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </Control>
          </div>
        </div>
      </div>

      {children}

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
          <div>
            <p className="text-lg font-bold">This browser can&apos;t play this file.</p>
            <p className="mt-1 text-white/70">Open it in VLC or download it instead.</p>
            <a href={`vlc://${src}`} className="btn btn-signal mt-4">Open in VLC</a>
          </div>
        </div>
      )}
    </div>
  );
});

function Control({ label, onClick, children, expanded }: { label: string; onClick: () => void; children: React.ReactNode; expanded?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className="grid size-11 place-items-center rounded-[4px] text-white/90 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}
