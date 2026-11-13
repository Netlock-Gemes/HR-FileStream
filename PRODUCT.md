# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js (App Router) static export in `web/`, served by the Python aiohttp server in `backend/`, which also runs the Telegram bot, streams files and owns auth and the JSON API. One Docker image. Chosen with the user (2026-11-13).

## Users
Mostly the owner: a personal movie and series library browsed and played across phone, laptop and big-screen browser. Viewer accounts exist for a few people the owner hands logins to. The owner is also the admin who curates the library in the dashboard.

## Product Purpose
Turn videos posted in private Telegram channels into a private streaming library: browse, find, resume and play in the browser or an external player (VLC, MX Player), and curate titles, cast, catalogs and channels. Success is finding something to watch quickly and having it start playing reliably.

## Positioning
The library lives in Telegram channels; nothing comes from IMDb or TMDB. Titles, descriptions, tags and posters come from captions and Telegram thumbnails, or the owner's own edits and captured frames. Also served as a Stremio/Nuvio addon.

## Operating Context
Evening viewing on phone and desktop equally. Stream links (`/watch/{id}`, `/dl/{id}`) are shared and must work without a login. The admin can "view as user" from the dashboard.

## Capabilities and Constraints
- Content: movies and series. Cast are actors; tags (from caption #hashtags) act as genres.
- Videos carry title, description, cast, tags, duration, height (quality), size, added time, poster.
- Per-account My List and watch progress (Continue watching), synced across devices.
- Browse needs real pagination, sorting (newest, oldest, title, length, size, random) and filters (catalog, cast, tag, channel, length, quality, added, watch status).
- Posters may be missing or small Telegram thumbnails; designs must tolerate low-resolution and fallback art.

## Brand Commitments
Name: "HR Filestream" (viewer site), "HR Library" (dashboard and addon). Fonts already licensed in the repo: Instrument Serif and Manrope.

## Evidence on Hand
Real library content only; no ratings, reviews or external metadata exist and must not be invented.

## Product Principles
- Get to playing fast: every screen is at most two taps from Play or Resume.
- Phone and desktop are equals; neither is a shrunken version of the other.
- Honest data: show only what the library actually knows.
- Links never break: old shared URLs keep working.
