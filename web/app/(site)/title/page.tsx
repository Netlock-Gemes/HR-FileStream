"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkCheck, Pause, Play, RotateCcw } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Portrait, Progress, Still, TitleCard } from "@/components/cards";
import { Player, PlayerHandle } from "@/components/player";
import { Row, RowItem } from "@/components/row";
import { Failed } from "@/components/states";
import { Actions, UpNext, useWatchProgress } from "@/components/watch";
import { api } from "@/lib/api";
import { ago, bytes, clock, quality, runtime } from "@/lib/format";
import type { PublicFile, Title } from "@/lib/types";

/** The title page is also where it plays: the still turns into the player, in the same place and size. */
function TitleView({ id, autoStart, startOverParam }: { id: string; autoStart: boolean; startOverParam: boolean }) {
  const client = useQueryClient();
  const router = useRouter();
  const title = useQuery({ queryKey: ["title", id], queryFn: () => api<Title>(`/api/title/${id}`), enabled: !!id });
  const file = useQuery({ queryKey: ["file", id], queryFn: () => api<PublicFile>(`/api/public/file/${id}`), enabled: !!id });
  const player = useRef<PlayerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ startOver: boolean } | null>(autoStart ? { startOver: startOverParam } : null);
  const [playing, setPlaying] = useState(false);

  const progress = useWatchProgress({
    id,
    url: file.data?.url ?? "",
    tracked: true,
    player,
    startOver: !!open?.startOver,
    serverPosition: () => title.refetch().then((result) => result.data?.position ?? 0),
  });

  // What you just watched shows up in Continue watching when you go back
  useEffect(() => () => {
    client.invalidateQueries({ queryKey: ["home"] });
    client.invalidateQueries({ queryKey: ["videos"] });
  }, [client]);

  const save = useMutation({
    mutationFn: (saved: boolean) => api<{ saved: boolean }>(`/api/list/${id}`, { method: saved ? "POST" : "DELETE" }),
    onMutate: (saved) => client.setQueryData<Title>(["title", id], (old) => (old ? { ...old, saved } : old)),
    onSuccess: ({ saved }) => {
      toast(saved ? "Saved to My List" : "Removed from My List");
      client.invalidateQueries({ queryKey: ["home"] });
      client.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (error, saved) => {
      client.setQueryData<Title>(["title", id], (old) => (old ? { ...old, saved: !saved } : old));
      toast.error(error.message);
    },
  });

  if (!id || title.isError) return <Failed error={title.error ?? new Error("That no longer exists.")} retry={title.refetch} />;
  if (title.isPending) return <TitleSkeleton />;
  const data = title.data;
  const resume = data.position > 15 && !!data.progress && data.progress < 0.93;
  const next = data.more[0];

  const reveal = () => {
    // On phones the player sits above the buttons; bring it into view when it starts
    if (stage.current && stage.current.getBoundingClientRect().top < 56) stage.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const start = (startOver: boolean) => {
    const video = player.current?.video;
    if (open && video) {
      if (startOver) video.currentTime = 0;
      video.play().catch(() => {});
    } else setOpen({ startOver });
    reveal();
  };

  const facts: [string, string][] = [
    ["Length", runtime(data.duration)],
    ["Quality", quality(data.height)],
    ["Size", bytes(data.size)],
    ["Added", ago(data.added)],
  ].filter(([, value]) => value) as [string, string][];

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[1600px] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div ref={stage} className="relative scroll-mt-14 self-start md:sticky md:top-16">
            {open && file.data ? (
              <Player
                ref={player}
                inline
                autoPlay
                src={file.data.url}
                poster={data.poster}
                title={data.title}
                onLoaded={progress.onLoaded}
                onTime={(time, duration, isPlaying) => {
                  setPlaying(isPlaying);
                  progress.onTime(time, duration, isPlaying);
                }}
                onPause={() => {
                  setPlaying(false);
                  progress.onPause();
                }}
                onEnded={() => {
                  setPlaying(false);
                  progress.onEnded();
                }}
              >
                {progress.ended && next && (
                  <UpNext card={next} href={`/title?id=${next.id}&play=1`} go={(href) => router.push(href)} onCancel={() => progress.setEnded(false)} />
                )}
              </Player>
            ) : (
              <button onClick={() => start(false)} className="group relative block w-full" aria-label={`${resume ? "Resume" : "Play"} ${data.title}`}>
                <Still src={data.poster} eager className="aspect-video" />
                <span className="absolute inset-0 grid place-items-center bg-ink/0 transition-colors group-hover:bg-ink/15">
                  <span className="grid size-16 place-items-center rounded-full bg-signal text-ink opacity-90 transition-transform group-hover:scale-105 group-active:scale-95 md:size-20">
                    <Play className="ml-1 size-7 fill-current md:size-8" />
                  </span>
                </span>
                {data.progress ? <Progress value={data.progress} className="absolute inset-x-0 bottom-0 h-1" /> : null}
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-col px-4 pt-5 pb-6 md:border-l md:border-line md:px-8 md:pt-8">
            <h1 className="headline text-[2.3rem] md:text-[3rem] xl:text-[3.6rem]">{data.title}</h1>
            <dl className="mt-5 grid grid-cols-2 border-t border-line sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label} className="border-b border-line py-2.5 pr-3">
                  <dt className="data text-muted">{label}</dt>
                  <dd className="mt-0.5 font-bold tabular">{value}</dd>
                </div>
              ))}
            </dl>
            {resume && !open ? (
              <p className="data mt-4 text-muted">
                Stopped at {clock(data.position)} of {clock(data.duration)}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {open && playing ? (
                <button onClick={() => player.current?.video?.pause()} className="btn btn-signal h-12 px-6 text-base">
                  <Pause className="size-[18px] fill-current" /> Pause
                </button>
              ) : (
                <button onClick={() => start(false)} className="btn btn-signal h-12 px-6 text-base">
                  <Play className="size-[18px] fill-current" /> {open ? "Play" : resume ? "Resume" : "Play"}
                </button>
              )}
              {(resume || open) && (
                <button onClick={() => start(true)} className="btn btn-line h-12">
                  <RotateCcw className="size-4" /> Start over
                </button>
              )}
              <button onClick={() => save.mutate(!data.saved)} className="btn btn-line h-12" aria-pressed={data.saved}>
                {data.saved ? <BookmarkCheck className="size-[18px] text-signal-deep" /> : <Bookmark className="size-[18px]" />}
                {data.saved ? "In My List" : "My List"}
              </button>
            </div>
            {file.data && <Actions file={file.data} player={player} className="mt-3" />}
            {data.description && <p className="mt-6 max-w-[62ch] whitespace-pre-line leading-relaxed">{data.description}</p>}
            {data.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {data.tags.map((tag) => (
                  <Link key={tag} href={`/browse?tag=${encodeURIComponent(tag)}`} className="chip h-8">
                    <span className="text-muted">#</span>
                    {tag}
                  </Link>
                ))}
              </div>
            )}
            {data.file_name && <p className="data mt-auto break-all pt-6 text-faint">{data.file_name}</p>}
          </div>
        </div>
      </section>

      {data.people.length > 0 && (
        <Row title="Cast" count={data.people.length}>
          {data.people.map((face) => (
            <li key={face.id} className="shrink-0 snap-start py-3 pr-4">
              <Portrait face={face} />
            </li>
          ))}
        </Row>
      )}
      {data.more.length > 0 && (
        <Row title="More like this">
          {data.more.map((card) => (
            <RowItem key={card.id}>
              <TitleCard card={card} />
            </RowItem>
          ))}
        </Row>
      )}
    </>
  );
}

function TitleSkeleton() {
  return (
    <div aria-busy className="mx-auto grid max-w-[1600px] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="skeleton aspect-video" />
      <div className="px-4 pt-6 md:px-8">
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton mt-6 h-16 w-full" />
        <div className="skeleton mt-4 h-12 w-1/2" />
      </div>
    </div>
  );
}

function TitleRoute() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  // A fresh view per title, so moving to the next film starts clean
  return <TitleView key={id} id={id} autoStart={params.get("play") === "1"} startOverParam={params.get("t") === "0"} />;
}

export default function TitlePage() {
  return (
    <Suspense>
      <TitleRoute />
    </Suspense>
  );
}
