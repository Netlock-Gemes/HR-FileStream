"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHead } from "@/components/states";
import { useFacets, VideoIndex } from "@/components/video-index";
import { api } from "@/lib/api";

function BrowseHead() {
  const params = useSearchParams();
  const catalog = params.get("catalog");
  const facets = useFacets();
  const info = useQuery({
    queryKey: ["catalog", catalog],
    queryFn: () => api<{ id: string; name: string }>(`/api/catalog/${catalog}`),
    enabled: !!catalog,
  });
  return <PageHead title={catalog ? info.data?.name ?? " " : "Browse"} count={catalog ? undefined : facets.data?.total} />;
}

export default function BrowsePage() {
  return (
    <Suspense>
      <BrowseHead />
      <VideoIndex />
    </Suspense>
  );
}
