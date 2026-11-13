import type { NextConfig } from "next";

// The Python server (backend/) serves the exported site in production.
// In development, `next dev` forwards everything that isn't a page to it.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";
const isDev = process.env.NODE_ENV !== "production";

const config: NextConfig = {
  output: isDev ? undefined : "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isDev && {
    async rewrites() {
      return {
        beforeFiles: [
          { source: "/watch/:id", destination: "/watch" },
          { source: "/mx/:id", destination: "/watch" },
        ],
        afterFiles: [],
        fallback: [
          "/api/:path*", "/dashboard/api/:path*", "/dl/:path*", "/poster/:path*",
          "/cast-photo/:path*", "/logout", "/view-as-user", "/view-as-admin", "/stremio/:path*",
        ].map((source) => ({ source, destination: `${backend}${source}` })),
      };
    },
  }),
};

export default config;
