import hmac
import asyncio
import datetime
from urllib.parse import parse_qs, quote
from aiohttp import web

from FileStream import __version__
from FileStream.config import Server
from FileStream.server.exceptions import FIleNotFound
from FileStream.utils.database import db
from FileStream.utils.human_readable import humanbytes
from FileStream.utils.library import cast_photo_file, poster_path

routes = web.RouteTableDef()

ID_PREFIX = "hrw:"
SEARCH_CATALOG = "hr-search"
PAGE_SIZE = 30
FALLBACK_POSTER = "FileStream/template/poster.jpg"
WEB_READY_TYPES = ("video/mp4", "video/webm")
POSTER_WAIT = 8
IMAGE_HEADERS = {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=604800",
    "Access-Control-Allow-Origin": "*",
}


def check_addon_token(request: web.Request) -> None:
    secret = Server.ADDON_TOKEN
    if not secret or not hmac.compare_digest(request.match_info["token"], secret):
        raise web.HTTPNotFound()


def addon_json(data: dict, max_age: int = 60) -> web.Response:
    return web.json_response(data, headers={
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": f"public, max-age={max_age}",
    })


def poster_url(file_data: dict, absolute: bool = True) -> str:
    version = f"?v={file_data['poster_v']}" if file_data.get("poster_v") else ""
    return f"{Server.URL if absolute else '/'}poster/{file_data['_id']}.jpg{version}"


def person_photo_url(person: dict) -> str:
    return f"{Server.URL}cast-photo/{person['_id']}.jpg?v={person['photo_v']}"


def to_meta_preview(file_data: dict) -> dict:
    poster = poster_url(file_data)
    released = datetime.datetime.fromtimestamp(file_data.get("time", 0), datetime.timezone.utc)
    meta = {
        "id": f"{ID_PREFIX}{file_data['_id']}",
        "type": "movie",
        "name": file_data.get("title") or file_data["file_name"],
        "poster": poster,
        "posterShape": "landscape",
        "landscapePoster": poster,
        "background": poster,
        "description": file_data.get("description") or "",
        "genres": [*file_data.get("cast", []), *file_data.get("tags", [])],
        "released": released.isoformat(),
        "releaseInfo": str(released.year),
    }
    if file_data.get("duration"):
        meta["runtime"] = f"{round(file_data['duration'] / 60)} min"
    return meta


async def to_meta(file_data: dict) -> dict:
    meta = to_meta_preview(file_data)
    cast = file_data.get("cast") or []
    photos = {person["name"]: person for person in await db.cast_by_names(cast) if person.get("photo_v")}
    people = []
    for name in cast:
        person = {"name": name}
        if name in photos:
            person["photo"] = person_photo_url(photos[name])
        people.append(person)
    meta.update(
        cast=cast,
        # Nuvio reads faces from app_extras. Stremio reads the links
        app_extras={"cast": people},
        links=[
            {"name": name, "category": "Cast", "url": f"stremio:///search?search={quote(name)}"}
            for name in cast
        ],
        behaviorHints={"defaultVideoId": meta["id"]},
    )
    return meta


def to_stream(file_data: dict) -> dict:
    file_name = file_data["file_name"]
    quality = f"{file_data['height']}p" if file_data.get("height") else "Direct"
    details = f"{file_name}\n{humanbytes(file_data['file_size'])}"
    return {
        "name": f"HR Library\n{quality}",
        "title": details,
        "description": details,
        "url": f"{Server.URL}dl/{file_data['_id']}/{quote(file_name)}",
        "behaviorHints": {
            "bingeGroup": "hr-library",
            "filename": file_name,
            "videoSize": file_data["file_size"],
            "notWebReady": file_data["mime_type"] not in WEB_READY_TYPES,
        },
    }


async def addon_file(request: web.Request) -> dict:
    addon_id = request.match_info["id"]
    if not addon_id.startswith(ID_PREFIX):
        raise FIleNotFound
    file_data = await db.get_library_file(addon_id[len(ID_PREFIX):])
    if file_data.get("hidden"):
        raise FIleNotFound
    return file_data


@routes.get("/stremio/{token}/manifest.json")
async def manifest(request: web.Request):
    check_addon_token(request)
    labels = [person["name"] for person in await db.list_cast()] + await db.library_tags()
    extra = [{"name": "genre", "options": labels}, {"name": "skip"}] if labels else [{"name": "skip"}]
    catalogs = [
        {"type": "movie", "id": catalog["_id"], "name": catalog["name"], "pageSize": PAGE_SIZE, "extra": extra}
        for catalog in await db.list_catalogs(enabled_only=True)
    ]
    # Search lives in one catalog, so results don't repeat per row and it stays out of Discover
    catalogs.append({
        "type": "movie",
        "id": SEARCH_CATALOG,
        "name": "HR Library",
        "extra": [{"name": "search", "isRequired": True}, {"name": "skip"}],
    })
    major, minor, _ = __version__.split(".")
    return addon_json({
        "id": "dev.hrwells.library",
        "version": f"{major}.{minor}.{await db.addon_revision()}",
        "name": "HR Library",
        "description": "Private videos from Telegram channels.",
        "logo": f"{Server.URL}poster/logo.jpg",
        "types": ["movie"],
        "idPrefixes": [ID_PREFIX],
        "resources": ["catalog", "meta", "stream"],
        "catalogs": catalogs,
        "behaviorHints": {"configurable": False},
    }, max_age=300)


@routes.get("/stremio/{token}/catalog/{type}/{id}/{extra}.json")
@routes.get("/stremio/{token}/catalog/{type}/{id}.json")
async def catalog(request: web.Request):
    check_addon_token(request)

    # Read from the raw path: a decoded "&" in a name would split the query
    extra = {}
    if "extra" in request.match_info:
        extra = parse_qs(request.raw_path.rsplit("/", 1)[-1].removesuffix(".json"))
    skip = extra.get("skip", ["0"])[0]
    skip = int(skip) if skip.isdigit() else 0

    catalog_id = request.match_info["id"]
    if catalog_id == SEARCH_CATALOG:
        conditions, sort = [], "newest"
    else:
        try:
            chosen = await db.get_catalog(catalog_id)
        except FIleNotFound:
            return addon_json({"metas": []})
        if not chosen.get("enabled"):
            return addon_json({"metas": []})
        conditions, sort = [db.catalog_query(chosen)], chosen.get("sort", "newest")

    query = db.library_query(*conditions, search=extra.get("search", [None])[0], label=extra.get("genre", [None])[0])
    files = await db.find_library(query, sort=sort, skip=skip, limit=PAGE_SIZE)
    return addon_json({"metas": [to_meta_preview(file_data) for file_data in files]})


@routes.get("/stremio/{token}/meta/{type}/{id}.json")
async def meta(request: web.Request):
    check_addon_token(request)
    try:
        return addon_json({"meta": await to_meta(await addon_file(request))})
    except FIleNotFound:
        return addon_json({"meta": None})


@routes.get("/stremio/{token}/stream/{type}/{id}.json")
async def stream(request: web.Request):
    check_addon_token(request)
    try:
        return addon_json({"streams": [to_stream(await addon_file(request))]})
    except FIleNotFound:
        return addon_json({"streams": []})


@routes.get("/poster/{id}.jpg", allow_head=True)
async def poster(request: web.Request):
    path = None
    try:
        file_data = await db.get_library_file(request.match_info["id"])
        path = await asyncio.wait_for(poster_path(file_data), POSTER_WAIT)
    except (FIleNotFound, asyncio.TimeoutError):
        pass
    if path:
        return web.FileResponse(path, headers=IMAGE_HEADERS)
    # A short cache, so a poster that wasn't ready yet shows up on the next visit
    return web.FileResponse(FALLBACK_POSTER, headers={**IMAGE_HEADERS, "Cache-Control": "public, max-age=60"})


@routes.get("/cast-photo/{id}.jpg", allow_head=True)
async def cast_photo(request: web.Request):
    try:
        person = await db.get_person(request.match_info["id"])
    except FIleNotFound:
        raise web.HTTPNotFound()
    if not person.get("photo_v"):
        raise web.HTTPNotFound()
    return web.FileResponse(cast_photo_file(person["_id"]), headers=IMAGE_HEADERS)
