import io
import os
import re
import asyncio
import logging
from typing import Optional
from PIL import Image, UnidentifiedImageError
from pyrogram import filters
from pyrogram.types import Message

from FileStream.bot import FileStream
from FileStream.config import Server, Telegram
from FileStream.utils.custom_dl import ByteStreamer
from FileStream.utils.database import db, normalize
from FileStream.utils.file_properties import get_file_info, get_media_from_message

POSTER_DIR = os.path.join(Server.DATA_DIR, "posters")
CAST_DIR = os.path.join(Server.DATA_DIR, "cast")
VIDEO_EXTENSIONS = (".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".ts", ".wmv", ".flv")
TITLE_LENGTH = 120
SCAN_BATCH = 200
SCAN_EMPTY_BATCHES = 5  # Without a last post, this many empty batches ends an import
ALL_CATALOG = "hr-library"

poster_limit = asyncio.Semaphore(3)
thumb_streamer = None
active_channels = set()
imports = {}
os.makedirs(POSTER_DIR, exist_ok=True)
os.makedirs(CAST_DIR, exist_ok=True)

library_channel = filters.create(lambda _, __, message: bool(message.chat and message.chat.id in active_channels))


async def reload_channels() -> None:
    active_channels.clear()
    active_channels.update(channel["_id"] for channel in await db.list_channels() if channel.get("enabled"))


async def setup_library() -> None:
    """First-start seeding, plus search text for videos indexed by the previous version."""
    for channel in Telegram.LIBRARY_CHANNELS:
        if not await db.channels.find_one({"_id": channel}):
            await db.save_channel(channel, str(channel))
    await reload_channels()

    if not await db.catalogs.find_one({"_id": ALL_CATALOG}):
        await db.add_catalog({"_id": ALL_CATALOG, "name": "HR Library", "all": True, "enabled": True, "order": 0, "sort": "newest"})

    # Names typed on videos before the cast list existed
    for name in await db.file.distinct("cast", {"library": True}):
        if not await db.find_person(name):
            await db.add_person(name, [])

    for file_data in await db.untagged_search_text():
        await db.update_library_file(file_data["_id"], {"search_text": search_text(file_data)})


#---------------------[ READING POSTS ]---------------------#

def is_video(message: Message) -> bool:
    if message.video:
        return True
    document = message.document
    if not document:
        return False
    return (document.mime_type or "").startswith("video/") or (document.file_name or "").lower().endswith(VIDEO_EXTENSIONS)


def strip_extension(name: str) -> str:
    return name[: -len(os.path.splitext(name)[1])].strip() if name.lower().endswith(VIDEO_EXTENSIONS) else name


def parse_caption(caption: Optional[str], file_name: str) -> dict:
    """Links and @handles are channel noise, and #hashtags become tags."""
    caption = caption or ""
    tags = list(dict.fromkeys(re.findall(r"#([^\W_][\w]*)", caption)))
    cleaned = re.sub(r"https?://\S+|www\.\S+|t\.me/\S+|@\w+|#\w+", "", caption)
    lines = [" ".join(line.split()) for line in cleaned.splitlines()]
    lines = [line for line in lines if line]
    if lines:
        lines[0] = strip_extension(lines[0])

    title = lines[0] if lines else ""
    if not title:
        title = " ".join(re.sub(r"[._]+", " ", strip_extension(file_name)).split())
    return {"title": title[:TITLE_LENGTH], "description": "\n".join(lines), "tags": tags}


def search_text(file_data: dict) -> str:
    parts = [file_data.get("title"), file_data.get("description"), file_data.get("caption"), file_data.get("file_name")]
    return normalize(" ".join(part for part in parts if part))


def person_terms(person: dict) -> list:
    terms = [normalize(name) for name in [person["name"], *person.get("aliases", [])]]
    return [term for term in terms if term]


def parse_names(names) -> list:
    """Accepts a list or comma separated text, and drops blanks and repeated names."""
    if isinstance(names, str):
        names = names.split(",")
    unique = {}
    for name in names or []:
        name = " ".join(str(name).split())
        if name:
            unique.setdefault(name.lower(), name)
    return list(unique.values())


async def matched_cast(text: str, kept: list, removed: list) -> list:
    padded = f" {text} "
    cast = list(kept)
    for person in await db.list_cast():
        if person["name"] not in cast and person["name"] not in removed:
            if any(f" {term} " in padded for term in person_terms(person)):
                cast.append(person["name"])
    return cast


async def apply_caption(file_data: dict, caption: Optional[str]) -> None:
    """Fills everything automatic, and leaves alone what was edited in the dashboard."""
    parsed = parse_caption(caption, file_data["file_name"])
    fields = {"caption": caption or "", "tags": parsed["tags"]}
    if not file_data.get("title_edited"):
        fields["title"] = parsed["title"]
    if not file_data.get("description_edited"):
        fields["description"] = parsed["description"]

    file_data.update(fields)
    fields["search_text"] = search_text(file_data)
    fields["cast"] = await matched_cast(fields["search_text"], file_data.get("cast", []), file_data.get("cast_removed", []))
    await db.update_library_file(file_data["_id"], fields)
    file_data.update(fields)


async def index_message(message: Message, fetch_poster: bool = True) -> Optional[dict]:
    """Adds a channel video to the library, or refreshes it if it's already there."""
    if not is_video(message):
        return None

    media = get_media_from_message(message)
    thumbs = media.thumbs or []
    file_info = get_file_info(message)
    file_info.update(
        library=True,
        channel_id=message.chat.id,
        message_id=message.id,
        duration=getattr(media, "duration", 0) or 0,
        width=getattr(media, "width", 0) or 0,
        height=getattr(media, "height", 0) or 0,
        thumb_file_id=thumbs[-1].file_id if thumbs else None,
    )
    file_data = await db.add_library_file(file_info, {
        "time": message.date.timestamp() if message.date else 0,
        "cast": [],
        "cast_removed": [],
        "catalogs": [],
        "file_ids": {str(FileStream.id): file_info["file_id"]},
    })
    await apply_caption(file_data, message.caption)
    if fetch_poster:
        asyncio.create_task(poster_path(file_data))
    return file_data


async def import_posts(channel: int, last_post: Optional[int] = None) -> None:
    """Bots can't list a channel, but can read posts by ID, so this walks the IDs."""
    state = imports[channel] = {"running": True, "scanned": 0, "added": 0, "error": None}
    empty_batches = 0
    try:
        first = 1
        while (first <= last_post) if last_post else (empty_batches < SCAN_EMPTY_BATCHES):
            ids = list(range(first, first + SCAN_BATCH))
            if last_post:
                ids = [post_id for post_id in ids if post_id <= last_post]
            posts = [post for post in await FileStream.get_messages(channel, ids) if not post.empty]
            empty_batches = 0 if posts else empty_batches + 1
            for post in posts:
                # Posters of imported posts load when they're first viewed
                if await index_message(post, fetch_poster=False):
                    state["added"] += 1
            state["scanned"] = ids[-1]
            first += SCAN_BATCH
    except Exception as e:
        logging.error(f"Import of {channel} stopped: {e!r}")
        state["error"] = str(e)
    state["running"] = False


#---------------------[ IMAGES ]---------------------#

async def download_thumb(file_data: dict) -> Optional[bytes]:
    global thumb_streamer
    thumb_streamer = thumb_streamer or ByteStreamer(FileStream)
    try:
        return await thumb_streamer.download_thumbnail(file_data["thumb_file_id"])
    except Exception as e:
        # Usually an expired reference: the channel post has a current one
        logging.info(f"Refreshing thumbnail of {file_data['_id']}: {e!r}")

    message = await FileStream.get_messages(file_data["channel_id"], file_data["message_id"])
    thumbs = getattr(get_media_from_message(message), "thumbs", None)
    if not thumbs:
        return None
    await db.update_library_file(file_data["_id"], {"thumb_file_id": thumbs[-1].file_id})
    return await thumb_streamer.download_thumbnail(thumbs[-1].file_id)


async def poster_path(file_data: dict) -> Optional[str]:
    """Returns the cached poster file, fetching the Telegram thumbnail the first time."""
    path = os.path.join(POSTER_DIR, f"{file_data['_id']}.jpg")
    if os.path.exists(path):
        return path
    if not file_data.get("thumb_file_id"):
        return None

    async with poster_limit:
        if os.path.exists(path):
            return path
        try:
            data = await download_thumb(file_data)
        except Exception as e:
            logging.warning(f"No poster for {file_data['_id']}: {e!r}")
            return None
        if not data:
            return None
        write_file(path, data)
    return path


def write_file(path: str, data: bytes) -> None:
    with open(f"{path}.tmp", "wb") as image:
        image.write(data)
    os.replace(f"{path}.tmp", path)


def to_jpeg(data: bytes, max_side: int) -> bytes:
    """Raises ValueError unless data is an image."""
    try:
        image = Image.open(io.BytesIO(data))
        image.thumbnail((max_side, max_side))
        output = io.BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=85)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("That file isn't an image.") from e
    return output.getvalue()


async def save_image(path: str, data: bytes, max_side: int) -> None:
    write_file(path, await asyncio.to_thread(to_jpeg, data, max_side))


def remove_image(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def poster_file(_id) -> str:
    return os.path.join(POSTER_DIR, f"{_id}.jpg")


def poster_url(file_data: dict, absolute: bool = True) -> str:
    version = f"?v={file_data['poster_v']}" if file_data.get("poster_v") else ""
    return f"{Server.URL if absolute else '/'}poster/{file_data['_id']}.jpg{version}"


def cast_photo_file(_id) -> str:
    return os.path.join(CAST_DIR, f"{_id}.jpg")
