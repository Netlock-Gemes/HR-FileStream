"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Failed } from "@/components/states";
import { VideoIndex } from "@/components/video-index";
import { api } from "@/lib/api";
import type { Face } from "@/lib/types";

function CastView() {
  const id = useSearchParams().get("id") ?? "";
  const person = useQuery({ queryKey: ["cast", id], queryFn: () => api<Face>(`/api/cast/${id}`), enabled: !!id });
  if (person.isError) return <Failed error={person.error} retry={person.refetch} />;
  const face = person.data;
  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8 md:pt-10">
        <div className="flex items-end gap-5 border-b border-ink pb-4">
          <span className="block size-24 shrink-0 overflow-hidden rounded-[3px] bg-sunk md:size-32">
            {face?.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={face.photo} alt="" className="size-full object-cover" />
            )}
          </span>
          <div className="min-w-0">
            <p className="data text-muted">Cast</p>
            <h1 className="headline mt-1 text-[2.2rem] md:text-[3.4rem]">{face?.name ?? " "}</h1>
            {face && <p className="data mt-2 text-muted">{face.videos} {face.videos === 1 ? "title" : "titles"}</p>}
          </div>
        </div>
      </div>
      {face && <VideoIndex fixed={{ cast: face.name }} keep={["id"]} />}
    </>
  );
}

export default function CastPage() {
  return (
    <Suspense>
      <CastView />
    </Suspense>
  );
}
