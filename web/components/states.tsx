"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

/** Empty and failed states give a next step, not a mood. */
export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start px-4 py-16 md:py-24">
      <span className="mb-5 grid grid-cols-3 gap-1" aria-hidden>
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className={`size-3 ${index === 4 ? "bg-signal" : "bg-line"}`} />
        ))}
      </span>
      <h2 className="text-[1.6rem] font-extrabold tracking-[-0.035em]">{title}</h2>
      {children && <div className="mt-1.5 text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Failed({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const gone = /no longer exists/i.test(message);
  return (
    <Empty
      title={gone ? "This isn't in the library anymore" : "This didn't load"}
      action={
        gone ? (
          <Link href="/" className="btn btn-line">Go home</Link>
        ) : retry ? (
          <button onClick={retry} className="btn btn-line">
            <RotateCw className="size-4" /> Try again
          </button>
        ) : null
      }
    >
      {gone ? "It may have been removed or hidden." : message}
    </Empty>
  );
}

export function PageHead({ title, count, children }: { title: React.ReactNode; count?: number | string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8 md:pt-10">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-ink pb-3">
        <h1 className="headline text-[2.3rem] md:text-[3.4rem]">{title}</h1>
        {count !== undefined && <span className="data mb-1.5 text-muted">{typeof count === "number" ? count.toLocaleString() : count}</span>}
        {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
