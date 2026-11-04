import os
import re
import time
import logging
import mimetypes
from urllib.parse import quote
from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionResetError
from FileStream.bot import multi_clients, work_loads, FileStream
from FileStream.config import Telegram
from FileStream.server import auth
from FileStream.server.exceptions import FIleNotFound, InvalidHash
from FileStream import utils, StartTime, __version__
from FileStream.utils.custom_dl import CHUNK_SIZE
from FileStream.utils.render_template import render_page

routes = web.RouteTableDef()

@routes.get("/status", allow_head=True)
async def root_route_handler(_):
    return web.json_response(
        {
            "server_status": "running",
            "uptime": utils.get_readable_time(time.time() - StartTime),
            "telegram_bot": "@" + FileStream.username,
            "connected_bots": len(multi_clients),
            "loads": dict(
                ("bot" + str(c + 1), l)
                for c, (_, l) in enumerate(
                    sorted(work_loads.items(), key=lambda x: x[1], reverse=True)
                )
            ),
            "version": __version__,
        }
    )

@routes.get("/watch/{path}", allow_head=True)
async def watch_route_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        user = await auth.current_user(request)
        if user:
            user = {**user, "viewer_site": auth.wants_viewer_site(request, user)}
        return web.Response(text=await render_page(path, user=user), content_type='text/html',
                            headers={"Cache-Control": "no-store"})
    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)
    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)

@routes.get("/mx/{path}", allow_head=True)
async def mx_route_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        return web.Response(
            text=await render_page(path, template="mx.html"),
            content_type='text/html'
        )

    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)

    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)

@routes.get(r"/assets/{name:[\w-]+\.woff2}", allow_head=True)
async def asset_route_handler(request: web.Request):
    path = f"FileStream/template/assets/{request.match_info['name']}"
    if not os.path.exists(path):
        raise web.HTTPNotFound()
    return web.FileResponse(path, headers={"Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000, immutable"})

# The optional name gives players a file extension to read the format from
@routes.get("/dl/{path}/{name}", allow_head=True)
@routes.get("/dl/{path}", allow_head=True)
async def dl_route_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        return await media_streamer(request, path)
    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)
    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)


def parse_range(range_header: str, file_size: int):
    """
    Returns (start, end, is_partial), or None if the range can't be satisfied.
    A malformed header is ignored and the whole file is served, as RFC 9110 says.
    """
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", (range_header or "").strip())
    if not match or not (match[1] or match[2]):
        return 0, file_size - 1, False

    if match[1]:
        start = int(match[1])
        end = min(int(match[2]), file_size - 1) if match[2] else file_size - 1
    else:
        start = max(file_size - int(match[2]), 0)
        end = file_size - 1

    if start >= file_size or end < start:
        return None
    return start, end, True


def content_disposition(file_name: str) -> str:
    ascii_name = re.sub(r'[^\x20-\x7e]|["\\]', "_", file_name)
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file_name)}"


async def media_streamer(request: web.Request, db_id: str):
    index = min(work_loads, key=work_loads.get)

    if Telegram.MULTI_CLIENT:
        logging.info(f"Client {index} is now serving {request.headers.get('X-FORWARDED-FOR',request.remote)}")

    tg_connect = utils.get_streamer(index)
    file_id = await tg_connect.get_file_properties(db_id, multi_clients)
    file_size = file_id.file_size

    byte_range = parse_range(request.headers.get("Range"), file_size)
    if byte_range is None:
        return web.Response(
            status=416,
            body="416: Range not satisfiable",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    from_bytes, until_bytes, is_partial = byte_range

    file_name = utils.get_name(file_id)
    mime_type = file_id.mime_type
    if not mime_type or mime_type == "None/unknown":
        mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"

    headers = {
        "Content-Type": mime_type,
        "Content-Length": str(until_bytes - from_bytes + 1),
        "Content-Disposition": content_disposition(file_name),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
        # nginx would otherwise spool the stream to disk before the player gets it
        "X-Accel-Buffering": "no",
    }
    if is_partial:
        headers["Content-Range"] = f"bytes {from_bytes}-{until_bytes}/{file_size}"

    response = web.StreamResponse(status=206 if is_partial else 200, headers=headers)
    await response.prepare(request)
    if request.method == "HEAD" or file_size == 0:
        await response.write_eof()
        return response

    offset = from_bytes - (from_bytes % CHUNK_SIZE)
    part_count = until_bytes // CHUNK_SIZE - offset // CHUNK_SIZE + 1
    body = tg_connect.yield_file(
        db_id, file_id, index, offset, from_bytes - offset, until_bytes % CHUNK_SIZE + 1, part_count
    )

    try:
        async for chunk in body:
            await response.write(chunk)
        await response.write_eof()
    except (ClientConnectionResetError, ConnectionResetError):
        pass  # The player seeked away or closed
    except Exception as e:
        # Headers are gone, so the only honest signal left is a dropped connection
        logging.error(f"Stream of {db_id} failed at {from_bytes}-{until_bytes}: {e!r}")
        if request.transport:
            request.transport.abort()
    finally:
        await body.aclose()
    return response
