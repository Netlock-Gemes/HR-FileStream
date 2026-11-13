"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Portrait, TitleCard } from "@/components/cards";
import { Hero } from "@/components/hero";
import { Row, RowItem } from "@/components/row";
import { Empty, Failed } from "@/components/states";
import { api } from "@/lib/api";
import type { Card, Home } from "@/lib/types";

export default function HomePage() {
  const home = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("/api/home") });
  const client = useQueryClient();
  const reshuffle = useQuery({
    queryKey: ["discover"],
    queryFn: () => api<{ items: Card[] }>("/api/random?count=18"),
    enabled: false,
  });

  if (home.isPending) return <HomeSkeleton />;
  if (home.isError) return <Failed error={home.error} retry={home.refetch} />;

  const data = home.data;
  if (!data.total) {
    return (
      <Empty title="The library is empty">Videos posted in your library channels show up here on their own.</Empty>
    );
  }
  const discover = reshuffle.data?.items ?? data.discover;

  return (
    <>
      <Hero items={data.hero} />
      <div>
        {data.continue.length > 0 && (
          <Row title="Continue watching">
            {data.continue.map((card) => (
              <RowItem key={card.id} wide>
                <TitleCard card={card} href={`/title?id=${card.id}&play=1`} />
              </RowItem>
            ))}
          </Row>
        )}
        {data.saved.length > 0 && (
          <Row title="My List" href="/list">
            {data.saved.map((card) => (
              <RowItem key={card.id}>
                <TitleCard card={card} />
              </RowItem>
            ))}
          </Row>
        )}
        {discover.length > 0 && (
          <Row
            title="Pick something for me"
            href="/browse?sort=random"
            action={
              <button
                onClick={() => {
                  client.removeQueries({ queryKey: ["discover"] });
                  reshuffle.refetch();
                }}
                disabled={reshuffle.isFetching}
                className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-2 text-sm font-semibold hover:bg-sunk"
              >
                <RefreshCw className={`size-4 ${reshuffle.isFetching ? "animate-spin" : ""}`} /> Shuffle
              </button>
            }
          >
            {discover.map((card) => (
              <RowItem key={card.id}>
                <TitleCard card={card} />
              </RowItem>
            ))}
          </Row>
        )}
        {data.rows.map((row) => (
          <Row key={row.id || "recent"} title={row.name} count={row.total} href={row.id ? `/browse?catalog=${row.id}` : "/browse"}>
            {row.items.map((card) => (
              <RowItem key={card.id}>
                <TitleCard card={card} />
              </RowItem>
            ))}
          </Row>
        ))}
        {data.cast.length > 0 && (
          <Row title="Cast">
            {data.cast.map((face) => (
              <li key={face.id} className="shrink-0 snap-start py-3 pr-4">
                <Portrait face={face} />
              </li>
            ))}
          </Row>
        )}
        <div className="mx-auto mt-14 max-w-[1600px] px-4 md:px-8">
          <Link href="/browse" className="group flex items-center gap-4 border-y border-ink py-5">
            <span className="headline text-[2rem] tabular md:text-[2.6rem]">{data.total.toLocaleString()}</span>
            <span className="text-muted">titles in the library</span>
            <span className="ml-auto font-semibold decoration-signal decoration-2 underline-offset-4 group-hover:underline">Browse all</span>
          </Link>
        </div>
      </div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy aria-label="Loading">
      <div className="skeleton aspect-video w-full md:aspect-auto md:h-[520px]" />
      {[0, 1].map((row) => (
        <div key={row} className="mx-auto mt-12 max-w-[1600px] px-4 md:px-8">
          <div className="skeleton h-8 w-56" />
          <div className="mt-5 flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="skeleton aspect-video w-[62vw] shrink-0 rounded-[3px] sm:w-[38vw] md:w-[29vw] lg:w-[22vw] xl:w-[18vw]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
