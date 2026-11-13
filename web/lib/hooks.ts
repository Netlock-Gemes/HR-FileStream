"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "./api";
import type { Card, Me } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me"), staleTime: Infinity });
}

/** Opens a random title. The same action behind every shuffle button. */
export function useShuffle() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const shuffle = useCallback(async () => {
    setBusy(true);
    try {
      const { items } = await api<{ items: Card[] }>("/api/random?count=1");
      if (items[0]) router.push(`/title?id=${items[0].id}`);
      else toast("The library is empty for now.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [router]);
  return { shuffle, busy };
}

export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
