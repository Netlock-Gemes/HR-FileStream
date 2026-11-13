"""JSON API for the viewer site. The pages themselves come from the Next.js export (web_routes.py)."""
import os
import json
import time
import random
import logging
import urllib.parse
from aiohttp import web
from bson.objectid import ObjectId
from FileStream.config import Server
from FileStream.server import auth
from FileStream.server.exceptions import FIleNotFound
from FileStream.utils.database import SORTS, db
from FileStream.utils.human_readable import humanbytes
from FileStream.utils.library import poster_url

routes = web.RouteTableDef()

ROW_SIZE = 18
HERO_SIZE = 6
CAST_ROW = 24
PAGE_SIZES = (12, 24, 36, 48, 96)
DEFAULT_PAGE_SIZE = 24
MAX_RANDOM = 48
# Watched past this share counts as finished and leaves Continue watching
FINISHED = 0.93
STARTED = 15
DURATIONS = {
    "short": {"duration": {"$gt": 0, "$lt": 20 * 60}},
    "medium": {"duration": {"$gte": 20 * 60, "$lt": 60 * 60}},
    "long": {"duration": {"$gte": 60 * 60}},
}
QUALITIES = {
    "sd": {"height": {"$gt": 0, "$lt": 720}},
    "hd": {"height": {"$gte": 720, "$lt": 1080}},
    "fhd": {"height": {"$gte": 1080, "$lt": 2160}},
    "uhd": {"height": {"$gte": 2160}},
}
ADDED = {"day": 86400, "week": 7 * 86400, "month": 30 * 86400, "year": 365 * 86400}
STATUSES = ("unwatched", "in_progress", "finished")
# Orders that aren't a Mongo sort: worked out over the matching ids in Python
LISTED_SORTS = ("random", "saved")


def account_of(request: web.Request) -> str:
    return request["user"]["id"]


def to_card(file_data: dict, progress: dict = None) -> dict:
    card = {
        "id": str(file_data["_id"]),
        "title": file_data.get("title") or file_data["file_name"],
        "poster": poster_url(file_data, absolute=False),
        "duration": int(file_data.get("duration") or 0),
        "height": int(file_data.get("height") or 0),
        "size": int(file_data.get("file_size") or 0),
        "cast": file_data.get("cast") or [],
        "tags": file_data.get("tags") or [],
        "added": file_data.get("time", 0),
    }
    if progress and progress.get("duration"):
        card["progress"] = round(min(progress["position"] / progress["duration"], 1), 3)
    return card


async def cards(request: web.Request, files: list) -> list:
    progress = await db.progress_for(account_of(request), [str(file_data["_id"]) for file_data in files])
    return [to_card(file_data, progress.get(str(file_data["_id"]))) for file_data in files]


def watch_state(row: dict) -> str:
    if not row.get("duration") or row["position"] <= STARTED:
        return "unwatched"
    return "finished" if row["position"] >= row["duration"] * FINISHED else "in_progress"


async def continue_watching(account: str) -> list:
    rows = [row for row in await db.recent_progress(account) if watch_state(row) == "in_progress"]
    files = await db.files_by_ids([row["file"] for row in rows])
    by_file = {row["file"]: row for row in rows}
    return [to_card(file_data, by_file[str(file_data["_id"])]) for file_data in files]


async def faces(names: list = None, limit: int = CAST_ROW) -> list:
    counts = await db.cast_counts()
    people = await (db.cast_by_names(names) if names is not None else db.list_cast())
    people = [person for person in people if counts.get(person["name"])]
    if names is None:
        people.sort(key=lambda person: (-counts[person["name"]], person["name"].lower()))
    else:
        order = {name: index for index, name in enumerate(names)}
        people.sort(key=lambda person: order.get(person["name"], 0))
    return [{
        "id": str(person["_id"]),
        "name": person["name"],
        "photo": f"/cast-photo/{person['_id']}.jpg?v={person['photo_v']}" if person.get("photo_v") else None,
        "videos": counts[person["name"]],
    } for person in people[:limit]]


def object_ids(ids) -> list:
    found = []
    for _id in ids:
        try:
            found.append(ObjectId(_id))
        except Exception:
            pass
    return found


def number(value: str, default: int, low: int, high: int) -> int:
    return min(max(int(value), low), high) if value and value.isdigit() else default


#---------------------[ WHO IS HERE ]---------------------#

@routes.get("/api/me")
async def me(request: web.Request):
    user = request["user"]
    return web.json_response({
        "name": user["name"],
        "role": user["role"],
        "previewing": user["role"] == "admin",
    })


#---------------------[ HOME ]---------------------#

@routes.get("/api/home")
async def home(request: web.Request):
    account = account_of(request)
    visible = db.library_query(hidden=False)
    rows = []
    for catalog in await db.list_catalogs(enabled_only=True):
        query = db.library_query(db.catalog_query(catalog), hidden=False)
        files = await db.find_library(query, sort=catalog.get("sort", "newest"), limit=ROW_SIZE)
        if files:
            rows.append({"id": catalog["_id"], "name": catalog["name"], "items": await cards(request, files),
                         "total": await db.count_library(query)})
    if not rows:
        files = await db.find_library(visible, limit=ROW_SIZE)
        if files:
            rows.append({"id": "", "name": "Recently added", "items": await cards(request, files),
                         "total": await db.count_library(visible)})
    hero = await db.find_library(visible, limit=HERO_SIZE)
    return web.json_response({
        "hero": [{**to_card(file_data), "description": (file_data.get("description") or "")[:400]} for file_data in hero],
        "continue": await continue_watching(account),
        "saved": await cards(request, await db.files_by_ids(await db.saved_files(account, ROW_SIZE))),
        "discover": await cards(request, await db.sample_library(visible, ROW_SIZE)),
        "rows": rows,
        "cast": await faces(),
        "total": await db.count_library(visible),
    })


#---------------------[ ONE TITLE ]---------------------#

@routes.get("/api/title/{id}")
async def title(request: web.Request):
    account = account_of(request)
    file_data = await db.get_library_file(request.match_info["id"])
    if file_data.get("hidden"):
        raise FIleNotFound
    _id = str(file_data["_id"])
    cast = file_data.get("cast") or []
    tags = file_data.get("tags") or []
    others = {"_id": {"$ne": file_data["_id"]}}
    more = []
    if cast or tags:
        alike = {"$or": [{"cast": {"$in": cast}}, {"tags": {"$in": tags}}]}
        more = await db.find_library(db.library_query(others, alike, hidden=False), limit=ROW_SIZE)
    if len(more) < 6:
        seen = [file_data["_id"], *(item["_id"] for item in more)]
        more += await db.sample_library(db.library_query({"_id": {"$nin": seen}}, hidden=False), ROW_SIZE - len(more))
    progress = await db.get_progress(account, _id)
    return web.json_response({
        **to_card(file_data, progress),
        "position": progress["position"] if progress else 0,
        "description": file_data.get("description") or "",
        "file_name": file_data.get("file_name") or "",
        "people": await faces(cast),
        "saved": await db.is_saved(account, _id),
        "more": await cards(request, more),
    })


@routes.get("/api/cast/{id}")
async def cast_page(request: web.Request):
    person = await db.get_person(request.match_info["id"])
    found = await faces([person["name"]])
    return web.json_response(found[0] if found else
                             {"id": str(person["_id"]), "name": person["name"], "photo": None, "videos": 0})


@routes.get("/api/catalog/{id}")
async def catalog_info(request: web.Request):
    catalog = await db.get_catalog(request.match_info["id"])
    if not catalog.get("enabled"):
        raise FIleNotFound
    return web.json_response({"id": catalog["_id"], "name": catalog["name"], "sort": catalog.get("sort", "newest")})


#---------------------[ BROWSING: PAGES, SORTS, FILTERS ]---------------------#

async def video_filters(request: web.Request) -> tuple:
    """Turns the query string into Mongo conditions, plus the id order for My List."""
    query = request.query
    account = account_of(request)
    conditions = []

    if query.get("catalog"):
        catalog = await db.get_catalog(query["catalog"])
        if not catalog.get("enabled"):
            raise FIleNotFound
        conditions.append(db.catalog_query(catalog))
    cast = [name for name in query.getall("cast", []) if name][:20]
    if cast:
        conditions.append({"cast": {"$all": cast}})
    tags = [tag for tag in query.getall("tag", []) if tag][:20]
    if tags:
        conditions.append({"tags": {"$all": tags}})
    channel = query.get("channel", "")
    if channel.lstrip("-").isdigit():
        conditions.append({"channel_id": int(channel)})
    if query.get("duration") in DURATIONS:
        conditions.append(DURATIONS[query["duration"]])
    if query.get("quality") in QUALITIES:
        conditions.append(QUALITIES[query["quality"]])
    if query.get("added") in ADDED:
        conditions.append({"time": {"$gte": time.time() - ADDED[query["added"]]}})

    status = query.get("status")
    if status in STATUSES:
        rows = await db.all_progress(account)
        if status == "unwatched":
            touched = [row["file"] for row in rows if watch_state(row) != "unwatched"]
            conditions.append({"_id": {"$nin": object_ids(touched)}})
        else:
            conditions.append({"_id": {"$in": object_ids(row["file"] for row in rows if watch_state(row) == status)}})

    saved_order = None
    if query.get("saved") == "1":
        saved_order = await db.saved_files(account, limit=5000)
        conditions.append({"_id": {"$in": object_ids(saved_order)}})

    term = query.get("q", "").strip()[:80]
    return db.library_query(*conditions, search=term or None, hidden=False), saved_order


@routes.get("/api/videos")
async def videos(request: web.Request):
    query = request.query
    mongo_query, saved_order = await video_filters(request)
    size = number(query.get("size", ""), DEFAULT_PAGE_SIZE, 1, max(PAGE_SIZES))
    page = number(query.get("page", ""), 1, 1, 100000)
    sort = query.get("sort", "")
    if sort not in SORTS and sort not in LISTED_SORTS:
        sort = "saved" if saved_order is not None else "newest"
    if sort == "saved" and saved_order is None:
        sort = "newest"

    seed = None
    if sort in LISTED_SORTS:
        ids = await db.library_ids(mongo_query)
        if sort == "random":
            seed = query.get("seed", "") or os.urandom(4).hex()
            ids.sort()
            random.Random(seed).shuffle(ids)
        else:
            rank = {_id: index for index, _id in enumerate(saved_order)}
            ids.sort(key=lambda _id: rank.get(str(_id), len(rank)))
        total = len(ids)
        pages = max(1, -(-total // size))
        page = min(page, pages)
        files = await db.files_by_ids(ids[(page - 1) * size: page * size])
    else:
        total = await db.count_library(mongo_query)
        pages = max(1, -(-total // size))
        page = min(page, pages)
        files = await db.find_library(mongo_query, sort=sort, skip=(page - 1) * size, limit=size)

    return web.json_response({
        "items": await cards(request, files),
        "total": total,
        "page": page,
        "pages": pages,
        "size": size,
        "sort": sort,
        "seed": seed,
    })


@routes.get("/api/facets")
async def facets(request: web.Request):
    visible = db.library_query(hidden=False)
    tag_counts = await db.tag_counts(visible)
    counts = await db.channel_counts()
    return web.json_response({
        "catalogs": [{"id": catalog["_id"], "name": catalog["name"]}
                     for catalog in await db.list_catalogs(enabled_only=True)],
        "cast": await faces(limit=500),
        "tags": [{"name": name, "videos": tag_counts[name]}
                 for name in sorted(tag_counts, key=lambda name: (-tag_counts[name], name.lower()))],
        "channels": [{"id": channel["_id"], "title": channel.get("title") or str(channel["_id"]),
                      "videos": counts.get(channel["_id"], 0)}
                     for channel in await db.list_channels() if counts.get(channel["_id"])],
        "sorts": [*SORTS, "random"],
        "page_sizes": list(PAGE_SIZES),
        "total": await db.count_library(visible),
    })


@routes.get("/api/random")
async def random_videos(request: web.Request):
    count = number(request.query.get("count", ""), 1, 1, MAX_RANDOM)
    files = await db.sample_library(db.library_query(hidden=False), count)
    return web.json_response({"items": await cards(request, files)})


@routes.get("/api/search")
async def search(request: web.Request):
    """Quick results while typing. The full, paginated results come from /api/videos?q=."""
    term = request.query.get("q", "").strip()[:80]
    if not term:
        return web.json_response({"items": [], "cast": [], "tags": []})
    files = await db.find_library(db.library_query(search=term, hidden=False), limit=8)
    names = [person["name"] for person in await db.list_cast() if term.lower() in person["name"].lower()]
    tags = [tag for tag in await db.library_tags() if term.lower() in tag.lower()][:8]
    return web.json_response({"items": await cards(request, files), "cast": await faces(names, 8), "tags": tags})


#---------------------[ MY LIST AND PROGRESS ]---------------------#

@routes.post("/api/list/{id}")
@routes.delete("/api/list/{id}")
async def set_saved(request: web.Request):
    file_data = await db.get_library_file(request.match_info["id"])
    saved = request.method == "POST"
    await db.set_saved(account_of(request), str(file_data["_id"]), saved)
    return web.json_response({"saved": saved})


@routes.put("/api/progress/{id}")
async def save_progress(request: web.Request):
    file_data = await db.get_library_file(request.match_info["id"])
    try:
        data = json.loads(await request.text())
        position, duration = float(data["position"]), float(data["duration"])
    except (ValueError, KeyError, TypeError):
        raise ValueError("Send position and duration in seconds.")
    if not (0 <= position <= duration < 7 * 24 * 3600):
        raise ValueError("That position is outside the video.")
    await db.save_progress(account_of(request), str(file_data["_id"]), position, duration)
    return web.json_response({"ok": True})


#---------------------[ PUBLIC: STREAM LINKS ]---------------------#

@routes.get("/api/public/file/{id}")
async def public_file(request: web.Request):
    """What the watch page needs. Stream links work without a login, so this does too."""
    file_data = await db.get_file(request.match_info["id"])
    user = await auth.current_user(request)
    mime_type = file_data.get("mime_type") or ""
    name = file_data["file_name"].replace("_", " ")
    if mime_type.startswith("video/"):
        name = os.path.splitext(name)[0]
    library = bool(file_data.get("library")) and not file_data.get("hidden")
    viewer_site = bool(user) and auth.wants_viewer_site(request, user)
    _id = str(file_data["_id"])
    return web.json_response({
        "id": _id,
        "title": file_data.get("title") or name,
        "file_name": file_data["file_name"],
        "mime": mime_type,
        "video": mime_type.startswith("video/"),
        "size": humanbytes(file_data["file_size"]),
        "url": urllib.parse.urljoin(Server.URL, f"dl/{_id}"),
        "named_url": urllib.parse.urljoin(Server.URL, f"dl/{_id}/{urllib.parse.quote(file_data['file_name'])}"),
        "poster": poster_url(file_data, absolute=False) if file_data.get("library") else None,
        "library": library,
        "cast": file_data.get("cast") or [],
        "signed_in": bool(user),
        "admin": bool(user) and user["role"] == "admin",
        "home_url": ("/" if viewer_site else "/dashboard") if user else None,
    }, headers={"Cache-Control": "no-store"})


@routes.post("/api/client-error")
async def client_error(request: web.Request):
    """Pages report their own failures here, so a blank screen on someone's phone leaves a trace."""
    try:
        data = json.loads((await request.content.read(2048)).decode("utf-8", "replace"))
    except ValueError:
        data = {}
    clean = lambda value, size: " ".join(str(value or "").split())[:size]
    who = request["user"]["name"] if request.get("user") else "someone signed out"
    logging.warning(
        f"Web page error for {who} on {clean(data.get('page'), 80)}: "
        f"{clean(data.get('message'), 300)} ({clean(data.get('where'), 200)}) "
        f"browser: {clean(request.headers.get('User-Agent'), 200)}"
    )
    return web.json_response({"ok": True})
