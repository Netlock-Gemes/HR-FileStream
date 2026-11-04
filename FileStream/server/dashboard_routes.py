import os
import re
import json
import time
import asyncio
import secrets
from aiohttp import web
from bson.errors import InvalidId
from bson.objectid import ObjectId
from pyrogram.enums import ChatMemberStatus

from FileStream.bot import FileStream
from FileStream.config import Server
from FileStream.server import auth
from FileStream.server.exceptions import FIleNotFound
from FileStream.server.library_routes import PAGE_SIZE, poster_url
from FileStream.utils.custom_dl import revoke_file
from FileStream.utils.database import SORTS, db
from FileStream.utils.human_readable import humanbytes
from FileStream.utils.library import (
    ALL_CATALOG, cast_photo_file, imports, import_posts, parse_names, person_terms,
    poster_file, reload_channels, remove_image, save_image, search_text,
)
from FileStream.utils.render_template import render_file

routes = web.RouteTableDef()

API = "/dashboard/api"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
POSTER_SIDE = 1280
PHOTO_SIDE = 500


def api_error(text: str, status: int) -> web.Response:
    return web.json_response({"error": text}, status=status)


@web.middleware
async def dashboard_guard(request: web.Request, handler):
    """The dashboard API is the admin's alone; the viewer API needs any login. Both refuse cross-site writes."""
    path = request.path
    admin_api = path == API or path.startswith(API + "/")
    viewer_api = path.startswith("/api/")
    if not (admin_api or viewer_api):
        return await handler(request)

    user = await auth.current_user(request)
    if not user:
        return api_error("Log in again.", 401)
    if admin_api and user["role"] != "admin":
        return api_error("Only the admin can do that.", 403)
    if request.method != "GET" and auth.API_HEADER not in request.headers:
        return api_error("Blocked request.", 403)
    try:
        return await handler(request)
    except FIleNotFound:
        return api_error("That no longer exists.", 404)
    except ValueError as e:
        return api_error(str(e), 400)


async def read_json(request: web.Request) -> dict:
    try:
        data = await request.json()
    except json.JSONDecodeError:
        raise ValueError("Send a JSON body.")
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    return data


def object_id(value: str) -> str:
    try:
        return str(ObjectId(value))
    except (InvalidId, TypeError):
        raise FIleNotFound


def page_number(request: web.Request) -> int:
    skip = request.query.get("skip", "0")
    return int(skip) if skip.isdigit() else 0


async def read_image(request: web.Request) -> bytes:
    data = await request.read()
    if not data:
        raise ValueError("Choose an image first.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Images can be up to 8 MB.")
    return data


#---------------------[ LOGIN ]---------------------#

def home_for(request: web.Request, user: dict) -> str:
    return "/" if auth.wants_viewer_site(request, user) else "/dashboard"


def login_form(error=None, status=200) -> web.Response:
    return web.Response(text=render_file("login.html", error=error), content_type="text/html", status=status,
                        headers={"Cache-Control": "no-store"})


@routes.get("/dashboard")
async def dashboard_page(request: web.Request):
    user = await auth.current_user(request)
    if not user:
        raise web.HTTPFound("/login")
    if user["role"] != "admin":
        raise web.HTTPFound("/")
    return web.Response(text=render_file("dashboard.html", admin=user["name"]), content_type="text/html",
                        headers={"Cache-Control": "no-store"})


@routes.get("/login")
async def login_page(request: web.Request):
    user = await auth.current_user(request)
    if user:
        raise web.HTTPFound(home_for(request, user))
    return login_form()


@routes.get("/dashboard/login")
async def old_login_page(_: web.Request):
    raise web.HTTPFound("/login")


@routes.post("/login")
@routes.post("/dashboard/login")
async def login(request: web.Request):
    ip = auth.client_ip(request)
    if auth.is_locked(ip):
        return login_form("Too many tries. Wait 15 minutes, then log in again.", 429)

    form = await request.post()
    identity = await auth.check_login(str(form.get("user", "")), str(form.get("password", "")))
    if not identity:
        auth.record_failure(ip)
        return login_form("That username or password is wrong.", 401)

    auth.failures.pop(ip, None)
    response = web.HTTPFound("/dashboard" if identity["id"] == auth.ADMIN else "/")
    auth.start_session(response, identity)
    # Each login starts in the admin's own view
    response.del_cookie(auth.VIEW_COOKIE, path="/")
    raise response


@routes.post("/logout")
@routes.post("/dashboard/logout")
async def logout(_: web.Request):
    response = web.HTTPFound("/login")
    auth.end_session(response)
    raise response


@routes.post("/view-as-user")
async def view_as_user(request: web.Request):
    user = await auth.current_user(request)
    if not user or user["role"] != "admin":
        raise web.HTTPFound("/login")
    response = web.HTTPFound("/")
    response.set_cookie(auth.VIEW_COOKIE, "user", path="/", httponly=True, secure=Server.HAS_SSL, samesite="Lax")
    raise response


@routes.post("/view-as-admin")
async def view_as_admin(_: web.Request):
    response = web.HTTPFound("/dashboard")
    response.del_cookie(auth.VIEW_COOKIE, path="/")
    raise response


#---------------------[ OVERVIEW ]---------------------#

@routes.get(f"{API}/overview")
async def overview(_: web.Request):
    totals = await db.library_totals()
    return web.json_response({
        "videos": totals["videos"],
        "size": humanbytes(totals["bytes"]) or "0 B",
        "uncast": await db.count_library(db.library_query({"cast": {"$size": 0}}, hidden=None)),
        "cast": len(await db.list_cast()),
        "hidden": await db.count_library(db.library_query(hidden=True)),
        "addon_url": f"{Server.URL}stremio/{Server.ADDON_TOKEN}/manifest.json" if Server.ADDON_TOKEN else "",
        "sorts": list(SORTS),
    })


#---------------------[ MEDIA ]---------------------#

def to_item(file_data: dict) -> dict:
    return {
        "id": str(file_data["_id"]),
        "title": file_data.get("title") or file_data["file_name"],
        "description": file_data.get("description") or "",
        "caption": file_data.get("caption") or "",
        "file_name": file_data["file_name"],
        "cast": file_data.get("cast") or [],
        "tags": file_data.get("tags") or [],
        "hidden": bool(file_data.get("hidden")),
        "poster": poster_url(file_data, absolute=False),
        "poster_custom": bool(file_data.get("poster_custom")),
        "size": humanbytes(file_data["file_size"]),
        "duration": round((file_data.get("duration") or 0) / 60),
        "channel_id": file_data.get("channel_id"),
        "message_id": file_data.get("message_id"),
        "watch": f"/watch/{file_data['_id']}",
        "url": f"{Server.URL}dl/{file_data['_id']}",
    }


@routes.get(f"{API}/media")
async def list_media(request: web.Request):
    query = request.query
    conditions = []
    if query.get("catalog"):
        conditions.append(db.catalog_query(await db.get_catalog(query["catalog"])))
    state = query.get("state")
    if state == "uncast":
        conditions.append({"cast": {"$size": 0}})
    channel = query.get("channel", "")
    mongo_query = db.library_query(
        *conditions,
        search=query.get("q"),
        label=query.get("label"),
        channel=int(channel) if channel.lstrip("-").isdigit() else None,
        hidden=True if state == "hidden" else None,
    )
    files = await db.find_library(mongo_query, sort=query.get("sort", "newest"), skip=page_number(request), limit=PAGE_SIZE)
    return web.json_response({
        "items": [to_item(file_data) for file_data in files],
        "total": await db.count_library(mongo_query),
        "page_size": PAGE_SIZE,
    })


@routes.patch(API + "/media/{id}")
async def update_media(request: web.Request):
    _id = object_id(request.match_info["id"])
    data = await read_json(request)
    file_data = await db.get_library_file(_id)
    fields = {}

    if "title" in data:
        title = " ".join(str(data["title"]).split())
        if not title:
            raise ValueError("A title can't be empty.")
        fields.update(title=title, title_edited=True)
    if "description" in data:
        fields.update(description=str(data["description"]).strip(), description_edited=True)
    if "tags" in data:
        fields["tags"] = parse_names(data["tags"])
    if "hidden" in data:
        fields["hidden"] = bool(data["hidden"])
    if "cast" in data:
        cast = parse_names(data["cast"])
        await ensure_people(cast)
        taken_off = set(file_data.get("cast", [])) - set(cast)
        fields["cast"] = cast
        fields["cast_removed"] = list((set(file_data.get("cast_removed", [])) | taken_off) - set(cast))

    file_data.update(fields)
    fields["search_text"] = search_text(file_data)
    await db.update_library_file(_id, fields)
    return web.json_response(to_item(file_data))


async def ensure_people(names: list) -> None:
    """A name typed on a video joins the cast list, and matches other videos too."""
    for name in names:
        if not await db.find_person(name):
            await connect_person(await db.add_person(name, []))
            await db.bump_addon_revision()


async def connect_person(person: dict) -> int:
    return await db.match_person(person["name"], person_terms(person))


@routes.get(API + "/media/{id}/catalogs")
async def media_catalogs(request: web.Request):
    _id = object_id(request.match_info["id"])
    file_data = await db.get_library_file(_id)
    return web.json_response({"catalogs": [{
        "id": catalog["_id"],
        "name": catalog["name"],
        "member": await db.in_catalog(_id, catalog),
        "picked": catalog["_id"] in file_data.get("catalogs", []),
        "all": bool(catalog.get("all")),
    } for catalog in await db.list_catalogs()]})


@routes.post(API + "/media/{id}/catalogs")
async def set_media_catalog(request: web.Request):
    _id = object_id(request.match_info["id"])
    data = await read_json(request)
    await db.get_library_file(_id)
    await db.get_catalog(data.get("catalog"))
    await db.set_catalog_member([_id], data["catalog"], bool(data.get("member")))
    return web.json_response({"ok": True})


@routes.get(API + "/media/{id}/poster")
async def poster_info(request: web.Request):
    return web.json_response(to_item(await db.get_library_file(object_id(request.match_info["id"]))))


@routes.put(API + "/media/{id}/poster")
async def upload_poster(request: web.Request):
    _id = object_id(request.match_info["id"])
    await db.get_library_file(_id)
    await save_image(poster_file(_id), await read_image(request), POSTER_SIDE)
    await db.update_library_file(_id, {"poster_custom": True, "poster_v": int(time.time())})
    return web.json_response(to_item(await db.get_library_file(_id)))


@routes.delete(API + "/media/{id}/poster")
async def reset_poster(request: web.Request):
    _id = object_id(request.match_info["id"])
    remove_image(poster_file(_id))
    await db.update_library_file(_id, {"poster_v": int(time.time())}, unset=["poster_custom"])
    return web.json_response(to_item(await db.get_library_file(_id)))


async def remove_media(_id: str) -> None:
    await revoke_file(_id)
    remove_image(poster_file(_id))


@routes.delete(API + "/media/{id}")
async def delete_media(request: web.Request):
    await remove_media(object_id(request.match_info["id"]))
    return web.json_response({"ok": True})


@routes.post(f"{API}/media/bulk")
async def bulk_media(request: web.Request):
    data = await read_json(request)
    ids = [object_id(_id) for _id in data.get("ids", [])]
    action = data.get("action")
    if not ids:
        raise ValueError("Select at least one video.")

    if action == "add_cast":
        names = parse_names(data.get("value"))
        if not names:
            raise ValueError("Enter at least one name.")
        await ensure_people(names)
        await db.update_library_many(ids, {"$addToSet": {"cast": {"$each": names}}, "$pull": {"cast_removed": {"$in": names}}})
    elif action == "add_catalog":
        await db.get_catalog(data.get("value"))
        await db.set_catalog_member(ids, data["value"], True)
    elif action == "remove_catalog":
        await db.get_catalog(data.get("value"))
        await db.set_catalog_member(ids, data["value"], False)
    elif action in ("hide", "show"):
        await db.update_library_many(ids, {"$set": {"hidden": action == "hide"}})
    elif action == "delete":
        for _id in ids:
            await remove_media(_id)
    else:
        raise ValueError("Unknown action.")
    return web.json_response({"ok": True})


#---------------------[ CAST ]---------------------#

def to_person(person: dict, counts: dict) -> dict:
    return {
        "id": str(person["_id"]),
        "name": person["name"],
        "aliases": person.get("aliases", []),
        "photo": f"/cast-photo/{person['_id']}.jpg?v={person['photo_v']}" if person.get("photo_v") else None,
        "videos": counts.get(person["name"], 0),
    }


@routes.get(f"{API}/cast")
async def list_cast(_: web.Request):
    counts = await db.cast_counts()
    return web.json_response({"cast": [to_person(person, counts) for person in await db.list_cast()]})


@routes.post(f"{API}/cast")
async def add_cast(request: web.Request):
    data = await read_json(request)
    added, connected = 0, 0
    for name in parse_names(data.get("names")):
        if await db.find_person(name):
            continue
        connected += await connect_person(await db.add_person(name, parse_names(data.get("aliases"))))
        added += 1
    if not added:
        raise ValueError("Enter a name that isn't on the list yet.")
    await db.bump_addon_revision()
    return web.json_response({"added": added, "connected": connected})


@routes.patch(API + "/cast/{id}")
async def update_cast(request: web.Request):
    person = await db.get_person(request.match_info["id"])
    data = await read_json(request)
    fields = {}
    if "name" in data:
        name = " ".join(str(data["name"]).split())
        if not name:
            raise ValueError("A name can't be empty.")
        existing = await db.find_person(name)
        if existing and existing["_id"] != person["_id"]:
            raise ValueError("That name is already on the list.")
        fields["name"] = name
        if name != person["name"]:
            await db.rename_person(person["name"], name)
    if "aliases" in data:
        fields["aliases"] = parse_names(data["aliases"])
    await db.update_person(person["_id"], fields)
    person.update(fields)
    connected = await connect_person(person)
    await db.bump_addon_revision()
    return web.json_response({"connected": connected})


@routes.put(API + "/cast/{id}/photo")
async def upload_cast_photo(request: web.Request):
    person = await db.get_person(request.match_info["id"])
    await save_image(cast_photo_file(person["_id"]), await read_image(request), PHOTO_SIDE)
    await db.update_person(person["_id"], {"photo_v": int(time.time())})
    return web.json_response({"ok": True})


@routes.delete(API + "/cast/{id}")
async def delete_cast(request: web.Request):
    person = await db.get_person(request.match_info["id"])
    await db.delete_person(person)
    remove_image(cast_photo_file(person["_id"]))
    await db.bump_addon_revision()
    return web.json_response({"ok": True})


@routes.post(f"{API}/cast/rematch")
async def rematch_cast(_: web.Request):
    connected = 0
    for person in await db.list_cast():
        connected += await connect_person(person)
    return web.json_response({"connected": connected})


#---------------------[ CATALOGS ]---------------------#

def catalog_fields(data: dict) -> dict:
    fields = {}
    if "name" in data:
        name = " ".join(str(data["name"]).split())
        if not name:
            raise ValueError("A catalog needs a name.")
        fields["name"] = name
    if "enabled" in data:
        fields["enabled"] = bool(data["enabled"])
    if "sort" in data:
        if data["sort"] not in SORTS:
            raise ValueError("Unknown sort order.")
        fields["sort"] = data["sort"]
    for key in ("cast", "tags", "keywords"):
        if key in data:
            fields[key] = parse_names(data[key])
    if "channels" in data:
        fields["channels"] = [int(channel) for channel in data["channels"]]
    return fields


async def to_catalog(catalog: dict) -> dict:
    query = db.library_query(db.catalog_query(catalog), hidden=False)
    return {
        "id": catalog["_id"],
        "name": catalog["name"],
        "all": bool(catalog.get("all")),
        "enabled": bool(catalog.get("enabled")),
        "sort": catalog.get("sort", "newest"),
        "cast": catalog.get("cast", []),
        "tags": catalog.get("tags", []),
        "keywords": catalog.get("keywords", []),
        "channels": catalog.get("channels", []),
        "videos": await db.count_library(query),
        "removed": await db.count_excluded(catalog["_id"]),
        "previews": [poster_url(file_data, absolute=False) for file_data in await db.find_library(query, sort=catalog.get("sort", "newest"), limit=4)],
    }


@routes.get(f"{API}/catalogs")
async def list_catalogs(_: web.Request):
    return web.json_response({"catalogs": [await to_catalog(catalog) for catalog in await db.list_catalogs()]})


@routes.post(f"{API}/catalogs")
async def add_catalog(request: web.Request):
    fields = catalog_fields(await read_json(request))
    if "name" not in fields:
        raise ValueError("A catalog needs a name.")
    catalogs = await db.list_catalogs()
    catalog = {
        "_id": secrets.token_hex(6),
        "enabled": True,
        "sort": "newest",
        "order": max((item.get("order", 0) for item in catalogs), default=0) + 1,
        **fields,
    }
    await db.add_catalog(catalog)
    await db.bump_addon_revision()
    return web.json_response(await to_catalog(catalog))


@routes.patch(API + "/catalogs/{id}")
async def update_catalog(request: web.Request):
    _id = request.match_info["id"]
    await db.get_catalog(_id)
    await db.update_catalog(_id, catalog_fields(await read_json(request)))
    await db.bump_addon_revision()
    return web.json_response(await to_catalog(await db.get_catalog(_id)))


@routes.post(f"{API}/catalogs/reorder")
async def reorder_catalogs(request: web.Request):
    data = await read_json(request)
    for order, _id in enumerate(data.get("ids", [])):
        await db.update_catalog(str(_id), {"order": order})
    await db.bump_addon_revision()
    return web.json_response({"ok": True})


@routes.post(API + "/catalogs/{id}/restore")
async def restore_catalog(request: web.Request):
    _id = request.match_info["id"]
    await db.get_catalog(_id)
    await db.restore_excluded(_id)
    return web.json_response({"ok": True})


@routes.delete(API + "/catalogs/{id}")
async def delete_catalog(request: web.Request):
    _id = request.match_info["id"]
    if _id == ALL_CATALOG:
        raise ValueError("Turn this catalog off instead. It can't be deleted.")
    await db.delete_catalog(_id)
    await db.bump_addon_revision()
    return web.json_response({"ok": True})


#---------------------[ ACCOUNTS ]---------------------#

USERNAME = re.compile(r"[A-Za-z0-9._-]{3,32}")


def to_account(account: dict) -> dict:
    return {
        "id": str(account["_id"]),
        "username": account["username"],
        "disabled": bool(account.get("disabled")),
        "created": account.get("created", 0),
        "last_seen": account.get("last_seen", 0),
    }


def check_password(password) -> str:
    password = str(password or "")
    if len(password) < auth.MIN_PASSWORD:
        raise ValueError(f"Use at least {auth.MIN_PASSWORD} characters for the password.")
    if len(password) > 200:
        raise ValueError("That password is too long.")
    return password


async def new_hash(password: str) -> str:
    return await asyncio.to_thread(auth.hash_password, password, os.urandom(16))


@routes.get(f"{API}/accounts")
async def list_accounts(_: web.Request):
    return web.json_response({"accounts": [to_account(account) for account in await db.list_accounts()]})


@routes.post(f"{API}/accounts")
async def add_account(request: web.Request):
    data = await read_json(request)
    username = str(data.get("username", "")).strip()
    if not USERNAME.fullmatch(username):
        raise ValueError("Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.")
    if username.lower() == Server.DASHBOARD_USER.lower():
        raise ValueError("That username is taken.")
    account = await db.add_account(username, await new_hash(check_password(data.get("password"))))
    return web.json_response(to_account(account))


@routes.patch(API + "/accounts/{id}")
async def update_account(request: web.Request):
    account = await db.get_account(request.match_info["id"])
    data = await read_json(request)
    fields, sign_out = {}, bool(data.get("sign_out"))
    if "password" in data:
        fields["password_hash"] = await new_hash(check_password(data["password"]))
        sign_out = True
    if "disabled" in data:
        fields["disabled"] = bool(data["disabled"])
        sign_out = sign_out or fields["disabled"]
    await db.update_account(account["_id"], fields, sign_out=sign_out)
    auth.forget_account(account["_id"])
    return web.json_response(to_account(await db.get_account(account["_id"])))


@routes.delete(API + "/accounts/{id}")
async def delete_account(request: web.Request):
    account = await db.get_account(request.match_info["id"])
    await db.delete_account(account["_id"])
    auth.forget_account(account["_id"])
    return web.json_response({"ok": True})


#---------------------[ CHANNELS ]---------------------#

async def to_channels() -> list:
    counts = await db.channel_counts()
    return [{
        "id": channel["_id"],
        "title": channel.get("title"),
        "enabled": bool(channel.get("enabled")),
        "videos": counts.get(channel["_id"], 0),
        "import": imports.get(channel["_id"]),
    } for channel in await db.list_channels()]


@routes.get(f"{API}/channels")
async def list_channels(_: web.Request):
    return web.json_response({"channels": await to_channels()})


@routes.post(f"{API}/channels")
async def add_channel(request: web.Request):
    data = await read_json(request)
    try:
        channel_id = int(str(data.get("id")).strip())
    except ValueError:
        raise ValueError("Enter a channel ID, such as -1001234567890.")
    try:
        chat = await FileStream.get_chat(channel_id)
        member = await FileStream.get_chat_member(channel_id, "me")
    except Exception:
        raise ValueError("The bot can't see that channel. Add it to the channel as an admin, then try again.")
    if member.status not in (ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER):
        raise ValueError("Make the bot an admin of that channel, then try again.")

    await db.save_channel(channel_id, chat.title or str(channel_id))
    await reload_channels()
    return web.json_response({"channels": await to_channels()})


def channel_id_param(request: web.Request) -> int:
    value = request.match_info["id"]
    if not value.lstrip("-").isdigit():
        raise FIleNotFound
    return int(value)


@routes.patch(API + "/channels/{id}")
async def update_channel(request: web.Request):
    data = await read_json(request)
    await db.update_channel(channel_id_param(request), {"enabled": bool(data.get("enabled"))})
    await reload_channels()
    return web.json_response({"channels": await to_channels()})


@routes.delete(API + "/channels/{id}")
async def delete_channel(request: web.Request):
    await db.delete_channel(channel_id_param(request))
    await reload_channels()
    return web.json_response({"channels": await to_channels()})


@routes.post(API + "/channels/{id}/import")
async def start_import(request: web.Request):
    channel_id = channel_id_param(request)
    data = await read_json(request)
    if imports.get(channel_id, {}).get("running"):
        raise ValueError("That channel is already importing.")
    last_post = data.get("last_post")
    asyncio.create_task(import_posts(channel_id, int(last_post) if last_post else None))
    await asyncio.sleep(0)
    return web.json_response({"channels": await to_channels()})
