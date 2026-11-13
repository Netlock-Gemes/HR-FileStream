"""Serves the exported Next.js site (web/out) behind the same logins the old templates had.

The export can't pre-render pages for ids it has never seen, so the app addresses titles,
cast and catalogs with ?id= and the old path-style links redirect there.
"""
from pathlib import Path
from urllib.parse import quote
from aiohttp import web
from FileStream.config import Server
from FileStream.server import auth
from FileStream.server.exceptions import FIleNotFound
from FileStream.utils.database import db

routes = web.RouteTableDef()

WEB = Path(Server.WEB_DIR).resolve()
PAGE_HEADERS = {"Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8"}
# Next puts a content hash in every /_next/static name, so those never change
HASHED = {"Cache-Control": "public, max-age=31536000, immutable"}
OTHER = {"Cache-Control": "public, max-age=3600"}


def page(name: str, status: int = 200) -> web.StreamResponse:
    path = WEB / f"{name}.html"
    if not path.is_file():
        return web.Response(
            status=503, content_type="text/plain",
            text="The web app hasn't been built. Run `npm run build` in web/, or rebuild the Docker image.",
        )
    return web.FileResponse(path, status=status, headers=PAGE_HEADERS)


def export_file(relative: str) -> web.StreamResponse:
    """A file from the export: scripts, styles, fonts, and the .txt payloads Next fetches when it changes pages."""
    path = (WEB / relative).resolve()
    if not path.is_relative_to(WEB) or not path.is_file() or path.suffix == ".html":
        return page("404", status=404)
    return web.FileResponse(path, headers=HASHED if relative.startswith("_next/static/") else OTHER)


def payload(request: web.Request, name: str):
    """/title/__next._tree.txt and friends belong to the export, not to the old /title/{id} links."""
    value = request.match_info.get(name, "")
    return export_file(request.path.lstrip("/")) if value.startswith("__next") else None


def home_for(request: web.Request, user: dict) -> str:
    return "/" if auth.wants_viewer_site(request, user) else "/dashboard"


async def viewer_or_login(request: web.Request) -> dict:
    user = await auth.current_user(request)
    if not user:
        raise web.HTTPFound("/login")
    if not auth.wants_viewer_site(request, user):
        raise web.HTTPFound("/dashboard")
    return user


#---------------------[ VIEWER SITE ]---------------------#

VIEWER_PAGES = {"/": "index", "/browse": "browse", "/search": "search", "/list": "list",
                "/title": "title", "/cast": "cast"}


async def viewer_page(request: web.Request):
    await viewer_or_login(request)
    return page(VIEWER_PAGES[request.path])


for _path in VIEWER_PAGES:
    routes.get(_path, allow_head=True)(viewer_page)


@routes.get("/title/{id}")
async def old_title(request: web.Request):
    if (found := payload(request, "id")) is not None:
        return found
    raise web.HTTPFound(f"/title?id={quote(request.match_info['id'])}")


@routes.get("/cast/{id}")
async def old_cast(request: web.Request):
    if (found := payload(request, "id")) is not None:
        return found
    raise web.HTTPFound(f"/cast?id={quote(request.match_info['id'])}")


@routes.get("/browse/{id}")
async def old_browse(request: web.Request):
    if (found := payload(request, "id")) is not None:
        return found
    raise web.HTTPFound(f"/browse?catalog={quote(request.match_info['id'])}")


#---------------------[ STREAM LINKS ]---------------------#

@routes.get("/watch/{id}", allow_head=True)
@routes.get("/mx/{id}", allow_head=True)
async def watch(request: web.Request):
    """Shared links work without a login, as they always have."""
    if (found := payload(request, "id")) is not None:
        return found
    try:
        await db.get_file(request.match_info["id"])
    except FIleNotFound:
        return page("404", status=404)
    return page("watch")


#---------------------[ ADMIN AND LOGIN ]---------------------#

@routes.get("/dashboard", allow_head=True)
async def dashboard(request: web.Request):
    user = await auth.current_user(request)
    if not user:
        raise web.HTTPFound("/login")
    if user["role"] != "admin":
        raise web.HTTPFound("/")
    return page("dashboard")


@routes.get("/login", allow_head=True)
async def login_page(request: web.Request):
    user = await auth.current_user(request)
    if user:
        raise web.HTTPFound(home_for(request, user))
    return page("login")


#---------------------[ FILES ]---------------------#

@routes.get("/{path:.+}", allow_head=True)
async def static_file(request: web.Request):
    """Everything else the export holds. Registered last."""
    return export_file(request.match_info["path"])
