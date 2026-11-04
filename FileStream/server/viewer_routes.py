"""The viewer site: an OTT-style home for every logged-in account, and the admin's "View as user"."""
import json
from aiohttp import web
from FileStream.server import auth
from FileStream.server.exceptions import FIleNotFound
from FileStream.utils.database import db
from FileStream.utils.library import poster_url
from FileStream.utils.render_template import render_file

routes = web.RouteTableDef()

ROW_SIZE = 18
PAGE_SIZE = 36
HERO_SIZE = 5
CAST_ROW = 24
# Watched past this share counts as finished and leaves Continue watching
FINISHED = 0.93
STARTED = 15


async def viewer_or_login(request: web.Request) -> dict:
    user = await auth.current_user(request)
    if not user:
        raise web.HTTPFound("/login")
    if not auth.wants_viewer_site(request, user):
        raise web.HTTPFound("/dashboard")
    return user


@routes.get("/", allow_head=True)
@routes.get("/search")
@routes.get("/list")
@routes.get("/title/{id}")
@routes.get("/cast/{id}")
@routes.get("/browse/{id}")
async def app_page(request: web.Request):
    user = await viewer_or_login(request)
    return web.Response(
        text=render_file("home.html", user=user["name"], previewing=user["role"] == "admin"),
        content_type="text/html", headers={"Cache-Control": "no-store"},
    )


def account_of(request: web.Request) -> str:
    return request["user"]["id"]


def to_card(file_data: dict, progress: dict = None) -> dict:
    card = {
        "id": str(file_data["_id"]),
        "title": file_data.get("title") or file_data["file_name"],
        "poster": poster_url(file_data, absolute=False),
        "duration": int(file_data.get("duration") or 0),
        "cast": file_data.get("cast") or [],
        "added": file_data.get("time", 0),
    }
    if progress and progress.get("duration"):
        card["progress"] = round(min(progress["position"] / progress["duration"], 1), 3)
    return card


async def cards(request: web.Request, files: list) -> list:
    progress = await db.progress_for(account_of(request), [str(file_data["_id"]) for file_data in files])
    return [to_card(file_data, progress.get(str(file_data["_id"]))) for file_data in files]


async def continue_watching(account: str) -> list:
    rows = [row for row in await db.recent_progress(account)
            if row.get("duration") and STARTED < row["position"] < row["duration"] * FINISHED]
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


@routes.get("/api/home")
async def home(request: web.Request):
    account = account_of(request)
    visible = db.library_query(hidden=False)
    hero = await db.find_library(visible, limit=HERO_SIZE)
    rows = []
    for catalog in await db.list_catalogs(enabled_only=True):
        query = db.library_query(db.catalog_query(catalog), hidden=False)
        files = await db.find_library(query, sort=catalog.get("sort", "newest"), limit=ROW_SIZE)
        if files:
            rows.append({"id": catalog["_id"], "name": catalog["name"], "items": await cards(request, files),
                         "more": await db.count_library(query) > len(files)})
    if not rows:
        files = await db.find_library(visible, limit=ROW_SIZE)
        if files:
            rows.append({"id": "", "name": "Recently added", "items": await cards(request, files), "more": False})
    return web.json_response({
        "hero": [{**to_card(file_data), "description": (file_data.get("description") or "")[:400]} for file_data in hero],
        "continue": await continue_watching(account),
        "saved": await cards(request, await db.files_by_ids(await db.saved_files(account, ROW_SIZE))),
        "rows": rows,
        "cast": await faces(),
    })


@routes.get("/api/title/{id}")
async def title(request: web.Request):
    account = account_of(request)
    file_data = await db.get_library_file(request.match_info["id"])
    if file_data.get("hidden"):
        raise FIleNotFound
    _id = str(file_data["_id"])
    cast = file_data.get("cast") or []
    others = {"_id": {"$ne": file_data["_id"]}}
    more = await db.find_library(db.library_query(others, {"cast": {"$in": cast}}, hidden=False), limit=ROW_SIZE) if cast else []
    if len(more) < 6:
        seen = [file_data["_id"], *(item["_id"] for item in more)]
        more += await db.find_library(db.library_query({"_id": {"$nin": seen}}, hidden=False), limit=ROW_SIZE - len(more))
    progress = await db.get_progress(account, _id)
    return web.json_response({
        **to_card(file_data, progress),
        "position": progress["position"] if progress else 0,
        "description": file_data.get("description") or "",
        "size": file_data.get("file_size", 0),
        "people": await faces(cast),
        "saved": await db.is_saved(account, _id),
        "more": await cards(request, more),
    })


@routes.get("/api/cast/{id}")
async def cast_page(request: web.Request):
    person = await db.get_person(request.match_info["id"])
    files = await db.find_library(db.library_query({"cast": person["name"]}, hidden=False), limit=200)
    face = (await faces([person["name"]]) or [{"id": str(person["_id"]), "name": person["name"], "photo": None, "videos": 0}])[0]
    return web.json_response({**face, "items": await cards(request, files)})


@routes.get("/api/browse/{id}")
async def browse(request: web.Request):
    catalog = await db.get_catalog(request.match_info["id"])
    if not catalog.get("enabled"):
        raise FIleNotFound
    skip = request.query.get("skip", "0")
    skip = int(skip) if skip.isdigit() else 0
    query = db.library_query(db.catalog_query(catalog), hidden=False)
    files = await db.find_library(query, sort=catalog.get("sort", "newest"), skip=skip, limit=PAGE_SIZE)
    return web.json_response({"name": catalog["name"], "items": await cards(request, files),
                              "total": await db.count_library(query)})


@routes.get("/api/search")
async def search(request: web.Request):
    term = request.query.get("q", "").strip()[:80]
    if not term:
        return web.json_response({"items": [], "cast": []})
    files = await db.find_library(db.library_query(search=term, hidden=False), limit=PAGE_SIZE)
    names = [person["name"] for person in await db.list_cast() if term.lower() in person["name"].lower()]
    return web.json_response({"items": await cards(request, files), "cast": await faces(names, 8)})


@routes.get("/api/list")
async def saved_list(request: web.Request):
    files = await db.files_by_ids(await db.saved_files(account_of(request)))
    return web.json_response({"items": await cards(request, files)})


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
