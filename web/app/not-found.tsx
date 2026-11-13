import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
      <p className="data text-muted">404</p>
      <h1 className="headline mt-2 text-[3rem]">This page isn&apos;t here</h1>
      <p className="mt-2 text-muted">The link may be old, or the title was removed from the library.</p>
      <Link href="/" className="btn btn-line mt-6 self-start">Go home</Link>
    </main>
  );
}
