"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shell";

const ERRORS: Record<string, string> = {
  wrong: "That username or password is wrong.",
  locked: "Too many tries. Wait 15 minutes, then log in again.",
};

export default function LoginPage() {
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(ERRORS[new URLSearchParams(location.search).get("e") ?? ""] ?? ""), []);

  return (
    <main className="grid min-h-dvh bg-bg md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-10 md:flex">
        <Logo />
        <div aria-hidden className="grid grid-cols-6 gap-2 opacity-90">
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} className={`aspect-video rounded-[3px] ${index === 9 ? "bg-signal" : index % 5 === 0 ? "bg-ink" : "bg-sunk"}`} />
          ))}
        </div>
        <p className="headline max-w-[12ch] text-[4.4rem] lg:text-[5.6rem]">Your library, ready to play.</p>
      </section>

      <section className="flex flex-col px-[max(1.25rem,env(safe-area-inset-left,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-8 md:justify-center md:px-12">
        <div className="md:hidden">
          <Logo />
        </div>
        <form
          method="post"
          action="/login"
          onSubmit={() => setBusy(true)}
          className="mx-auto mt-16 w-full max-w-sm md:mt-0"
        >
          <h1 className="headline text-[2.6rem]">Log in</h1>
          <p className="mt-1.5 text-muted">Use the username and password the admin gave you.</p>

          {error && (
            <p role="alert" className="mt-6 rounded-[4px] bg-paper px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-alarm)] text-[0.94rem] font-semibold text-alarm">
              {error}
            </p>
          )}

          <label htmlFor="user" className="mt-7 block text-sm font-bold">Username</label>
          <input
            id="user"
            name="user"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="mt-1.5 h-12 w-full rounded-[4px] bg-paper px-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)] focus:outline-none"
          />
          <label htmlFor="password" className="mt-4 block text-sm font-bold">Password</label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              className="h-12 w-full rounded-[4px] bg-paper pr-12 pl-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)] focus:outline-none"
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute top-0 right-0 grid size-12 place-items-center text-muted hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          <button disabled={busy} className="btn btn-signal mt-6 h-12 w-full text-base">
            {busy ? "Logging in" : "Log in"} <ArrowRight className="size-5" />
          </button>
        </form>
      </section>
    </main>
  );
}
