# HRWells' File Stream Bot

Welcome to **HRWells' File Stream Bot**! This bot allows users to stream **Movies** and **Series** directly on Telegram and provides options for downloading content to their devices.

## Features

- **Stream Movies and Series**: Watch movies and series directly from Telegram.
- **Download Movies and Series**: Download the content to your device.
- **Copy Stream Link**: Easily share the stream link with others.
- **Watch on External Players**: Option to watch the stream in popular external media players such as:
  - VLC Player
  - MX Player
  - nPlayer

## Contact Us

If you encounter any bugs or need assistance, feel free to reach out to us via Telegram:

- **Contact HRWells**: [HRWells Contact](https://t.me/h_r_wells)


Thank you for using **HRWells' File Stream Bot**!

## Project layout

The bot and the website live in separate folders and ship as one Docker image.

| Folder | What it holds |
| --- | --- |
| `backend/` | Python: the Telegram bot, file streaming (`/dl`), the JSON API, login, and the Stremio addon. It also serves the built website. |
| `web/` | The website: a Next.js app exported to static files (`web/out`). Viewer site, player, login and dashboard. |

`docker compose up -d --build` builds the website first, then the Python image, and copies `web/out` in. Nothing but Python runs in the container.

### Working on the website

```bash
cd web
npm install
npm run dev          # http://localhost:3000, forwards API calls to the backend on :8080
npm run build        # writes web/out, which the backend serves
```

Set `BACKEND_URL` if the backend isn't on `http://127.0.0.1:8080`. Run the backend from `backend/` with `python -m FileStream`.

### Browsing features

- Browse (`/browse`) pages through the whole library with numbered pages (12 to 96 per page) and a jump-to-page box.
- Sort by newest, oldest, title A to Z or Z to A, longest, shortest, largest or smallest file, or shuffled. A shuffle keeps its order across pages until you choose Shuffle again.
- Filter by catalog, length, quality, watched state, date added, tags, cast and channel. Filters, sort and page live in the address, so links and the back button keep them.
- Home has a random row with its own shuffle button, and the dice in the top bar opens a random title.

## Library, dashboard and addon

Only the accounts in `AUTH_USERS` can use the bot, and it works only in channels listed on the dashboard's Channels page. Links that were already shared keep working.

Videos posted in a library channel are added automatically. The caption gives the title and description, its #hashtags become tags, and the Telegram thumbnail becomes the poster. Nothing comes from IMDb or TMDB.

| Variable | Purpose |
| --- | --- |
| `AUTH_USERS` | Telegram user IDs allowed to use the bot, separated by spaces or commas |
| `LIBRARY_CHANNELS` | Channels added on first start. After that, use the dashboard |
| `ADDON_TOKEN` | Secret in the addon URL |
| `DASHBOARD_USER` | Dashboard username. Default `hrwells` |
| `DASHBOARD_PASSWORD_HASH` | `salt:hash`, made with the command below |
| `DASHBOARD_SECRET` | Random string that signs login cookies |
| `STREAM_PARALLEL` | Chunks fetched ahead per request. Default `4`. Telegram starts rate limiting at about 8 |
| `STREAM_CACHE_MB` | Memory used for recent chunks. Default `64` |

To change the dashboard password, set `DASHBOARD_PASSWORD_HASH` to this command's output and restart:

```bash
docker exec -it hr-filestream python -c "import os,getpass;from FileStream.server.auth import hash_password;print(hash_password(getpass.getpass(),os.urandom(16)))"
```

Open `/dashboard` to manage media, cast, catalogs and channels. `/library` in the bot shows the dashboard and addon links, and `/scan <channel_id> [last_post_id]` imports old posts.

Add these to the `stream.` nginx site so paused players aren't disconnected after 60 seconds:

```nginx
proxy_read_timeout 1h;
proxy_send_timeout 1h;
send_timeout 1h;
```

## Users and the viewer site

Everyone logs in at `/login`. The admin account (`DASHBOARD_USER`) lands on the dashboard; every other account is a viewer and gets the streaming site at `/`.

- Only the admin can add users, set or reset passwords, disable accounts or sign them out (dashboard → Users). Viewers can't change their own password.
- Resetting a password, disabling an account or choosing "Sign out everywhere" logs that user out on every device at once.
- "View as user" in the dashboard shows the viewer site exactly as a user sees it, with a bar to get back.
- Viewers see every video that isn't hidden, keep My List and Continue watching across devices, and can still open videos in VLC or MX Player, download them or copy links.
- `/watch/{id}` links keep working without a login. Stream links (`/dl/...`) are not tied to an account, so anyone with a link can play it.
