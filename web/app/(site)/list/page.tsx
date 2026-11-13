"use client";

import Link from "next/link";
import { Suspense } from "react";
import { PageHead } from "@/components/states";
import { VideoIndex } from "@/components/video-index";

export default function ListPage() {
  return (
    <Suspense>
      <PageHead title="My List" />
      <VideoIndex
        fixed={{ saved: "1" }}
        defaultSort="saved"
        hide={["catalog"]}
        emptyTitle="Your list is empty"
        emptyText={
          <>
            Save a title from its page and it waits here.{" "}
            <Link href="/browse" className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4">
              Browse the library
            </Link>
          </>
        }
      />
    </Suspense>
  );
}
