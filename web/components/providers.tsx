"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ApiError, reportError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
          },
        },
      }),
  );

  // A blank screen on someone's phone should leave a trace in the server log
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.message, `${event.filename}:${event.lineno}`);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof ApiError) return;
      reportError(String(reason?.message ?? reason), "unhandled promise");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="light"
        position="bottom-center"
        offset={{ bottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
        toastOptions={{
          style: { background: "#0c0c0c", color: "#fafaf8", border: "0", borderRadius: "4px", fontFamily: "var(--font-sans)" },
        }}
      />
    </QueryClientProvider>
  );
}
