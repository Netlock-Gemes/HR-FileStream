import asyncio
import logging
import random
from collections import OrderedDict, deque
from typing import Dict, Union
from FileStream.bot import multi_clients, work_loads
from FileStream.config import Server
from pyrogram import Client, utils, raw
from .database import db
from .file_properties import get_file_ids, refresh_file_id
from pyrogram.session import Session, Auth
from pyrogram.errors import AuthBytesInvalid, FileReferenceExpired, FileReferenceInvalid, FloodWait, InternalServerError
from pyrogram.file_id import FileId, FileType, ThumbnailSource

CHUNK_SIZE = 1024 * 1024
CHUNK_TIMEOUT = 10
CHUNK_RETRIES = 5
FILE_ID_CACHE_SIZE = 1024
# Telegram starts flood-waiting past ~6 parallel GetFile calls on one media session
MAX_CLIENT_REQUESTS = 6
PREWARM_DCS = (4, 5, 2, 1)


class ChunkCache:
    """Small LRU of recent chunks, so seeks and player re-opens skip Telegram."""

    def __init__(self, max_chunks: int):
        self.max_chunks = max_chunks
        self.chunks: "OrderedDict[tuple, bytes]" = OrderedDict()

    def get(self, key: tuple):
        chunk = self.chunks.get(key)
        if chunk is not None:
            self.chunks.move_to_end(key)
        return chunk

    def put(self, key: tuple, chunk: bytes) -> None:
        self.chunks[key] = chunk
        self.chunks.move_to_end(key)
        while len(self.chunks) > self.max_chunks:
            self.chunks.popitem(last=False)


chunk_cache = ChunkCache(Server.STREAM_CACHE_MB)


class ByteStreamer:
    def __init__(self, client: Client):
        self.client: Client = client
        self.cached_file_ids: "OrderedDict[str, FileId]" = OrderedDict()
        self.inflight: Dict[tuple, asyncio.Task] = {}
        self.session_lock = asyncio.Lock()
        self.refresh_lock = asyncio.Lock()
        self.limiter = asyncio.Semaphore(MAX_CLIENT_REQUESTS)

    async def get_file_properties(self, db_id: str, multi_clients) -> FileId:
        """
        Returns the properties of a media of a specific message in a FIleId class.
        if the properties are cached, then it'll return the cached results.
        or it'll generate the properties from the Message ID and cache them.
        """
        db_id = str(db_id)
        if db_id not in self.cached_file_ids:
            file_id = await get_file_ids(self.client, db_id, multi_clients, None)
            self.remember_file(db_id, file_id)
        self.cached_file_ids.move_to_end(db_id)
        return self.cached_file_ids[db_id]

    def remember_file(self, db_id: str, file_id: FileId) -> None:
        self.cached_file_ids[db_id] = file_id
        while len(self.cached_file_ids) > FILE_ID_CACHE_SIZE:
            self.cached_file_ids.popitem(last=False)

    async def generate_media_session(self, dc_id: int) -> Session:
        """
        Generates the media session for the DC that contains the media file.
        This is required for getting the bytes from Telegram servers.
        """
        client = self.client
        media_session = client.media_sessions.get(dc_id)
        if media_session is not None:
            return media_session

        async with self.session_lock:
            media_session = client.media_sessions.get(dc_id)
            if media_session is not None:
                return media_session

            test_mode = await client.storage.test_mode()
            if dc_id != await client.storage.dc_id():
                media_session = Session(
                    client, dc_id, await Auth(client, dc_id, test_mode).create(), test_mode, is_media=True
                )
                await media_session.start()

                for _ in range(6):
                    exported_auth = await client.invoke(raw.functions.auth.ExportAuthorization(dc_id=dc_id))
                    try:
                        await media_session.invoke(
                            raw.functions.auth.ImportAuthorization(id=exported_auth.id, bytes=exported_auth.bytes)
                        )
                        break
                    except AuthBytesInvalid:
                        logging.debug(f"Invalid authorization bytes for DC {dc_id}")
                else:
                    await media_session.stop()
                    raise AuthBytesInvalid
            else:
                media_session = Session(client, dc_id, await client.storage.auth_key(), test_mode, is_media=True)
                await media_session.start()

            client.media_sessions[dc_id] = media_session
            logging.debug(f"Created media session for DC {dc_id}")
            return media_session

    async def prewarm(self) -> None:
        """Opens the media sessions up front, so the first play doesn't pay for them."""
        for dc_id in PREWARM_DCS:
            try:
                await self.generate_media_session(dc_id)
            except Exception as e:
                logging.warning(f"Could not prewarm media session for DC {dc_id}: {e}")

    @staticmethod
    async def get_location(file_id: FileId) -> Union[raw.types.InputPhotoFileLocation,
                                                     raw.types.InputDocumentFileLocation,
                                                     raw.types.InputPeerPhotoFileLocation,]:
        """
        Returns the file location for the media file.
        """
        file_type = file_id.file_type

        if file_type == FileType.CHAT_PHOTO:
            if file_id.chat_id > 0:
                peer = raw.types.InputPeerUser(
                    user_id=file_id.chat_id, access_hash=file_id.chat_access_hash
                )
            else:
                if file_id.chat_access_hash == 0:
                    peer = raw.types.InputPeerChat(chat_id=-file_id.chat_id)
                else:
                    peer = raw.types.InputPeerChannel(
                        channel_id=utils.get_channel_id(file_id.chat_id),
                        access_hash=file_id.chat_access_hash,
                    )

            location = raw.types.InputPeerPhotoFileLocation(
                peer=peer,
                volume_id=file_id.volume_id,
                local_id=file_id.local_id,
                big=file_id.thumbnail_source == ThumbnailSource.CHAT_PHOTO_BIG,
            )
        elif file_type == FileType.PHOTO:
            location = raw.types.InputPhotoFileLocation(
                id=file_id.media_id,
                access_hash=file_id.access_hash,
                file_reference=file_id.file_reference,
                thumb_size=file_id.thumbnail_size,
            )
        else:
            location = raw.types.InputDocumentFileLocation(
                id=file_id.media_id,
                access_hash=file_id.access_hash,
                file_reference=file_id.file_reference,
                thumb_size=file_id.thumbnail_size,
            )
        return location

    async def refresh_location(self, db_id: str, location_box: list, stale_location) -> None:
        """Replaces an expired file reference; parallel chunks share a single refresh."""
        async with self.refresh_lock:
            if location_box[0] is not stale_location:
                return
            file_id = await refresh_file_id(self.client, db_id, multi_clients)
            self.remember_file(db_id, file_id)
            location_box[0] = await self.get_location(file_id)

    async def download_chunk(self, db_id: str, dc_id: int, location_box: list, offset: int) -> bytes:
        attempt = 0
        while True:
            location = location_box[0]
            try:
                media_session = await self.generate_media_session(dc_id)
                async with self.limiter:
                    # retries=0: a stuck request is retried here, with a short timeout
                    result = await media_session.invoke(
                        raw.functions.upload.GetFile(location=location, offset=offset, limit=CHUNK_SIZE),
                        retries=0,
                        timeout=CHUNK_TIMEOUT,
                    )
                return result.bytes
            except FloodWait as e:
                await asyncio.sleep(e.value + random.random())
            except (FileReferenceExpired, FileReferenceInvalid):
                attempt += 1
                if attempt >= CHUNK_RETRIES:
                    raise
                await self.refresh_location(db_id, location_box, location)
            except (TimeoutError, asyncio.TimeoutError, OSError, InternalServerError) as e:
                attempt += 1
                if attempt >= CHUNK_RETRIES:
                    raise
                logging.warning(f"Retrying chunk at {offset} on DC {dc_id} (attempt {attempt}): {e!r}")
                await asyncio.sleep(0.3 * 2 ** attempt)

    async def download_thumbnail(self, encoded_file_id: str) -> bytes:
        """Thumbnails use the open media session: Client.download_media re-authorizes per call."""
        file_id = FileId.decode(encoded_file_id)
        location = await self.get_location(file_id)
        media_session = await self.generate_media_session(file_id.dc_id)
        async with self.limiter:
            result = await media_session.invoke(
                raw.functions.upload.GetFile(location=location, offset=0, limit=CHUNK_SIZE),
                retries=0,
                timeout=CHUNK_TIMEOUT,
            )
        return result.bytes

    def chunk_done(self, key: tuple, task: asyncio.Task) -> None:
        self.inflight.pop(key, None)
        if not task.cancelled() and task.exception() is None and task.result():
            chunk_cache.put(key, task.result())

    async def fetch_chunk(self, db_id: str, file_id: FileId, location_box: list, offset: int) -> bytes:
        """Serves a chunk from cache, or joins the download another request already started."""
        key = (file_id.media_id, offset)
        chunk = chunk_cache.get(key)
        if chunk is not None:
            return chunk

        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(self.download_chunk(db_id, file_id.dc_id, location_box, offset))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self.chunk_done(key, done))
        # shielded: a finished read-ahead chunk is still worth caching after a seek
        return await asyncio.shield(task)

    async def yield_file(
        self,
        db_id: str,
        file_id: FileId,
        index: int,
        offset: int,
        first_part_cut: int,
        last_part_cut: int,
        part_count: int,
    ):
        """
        Yields the requested parts in order, keeping up to STREAM_PARALLEL of them
        downloading ahead of the reader. A slow reader stops the read-ahead too.
        Raises if a part can't be fetched, so the player sees a broken stream and
        re-requests the range instead of treating a short body as the end of file.
        """
        work_loads[index] += 1
        location_box = [await self.get_location(file_id)]
        pending = deque()
        next_part = 0

        try:
            for current_part in range(part_count):
                while next_part < part_count and len(pending) < Server.STREAM_PARALLEL:
                    part_offset = offset + next_part * CHUNK_SIZE
                    pending.append(asyncio.create_task(self.fetch_chunk(db_id, file_id, location_box, part_offset)))
                    next_part += 1

                chunk = await pending.popleft()
                if not chunk:
                    raise EOFError(f"Telegram returned no data for {db_id} at part {current_part}")

                start = first_part_cut if current_part == 0 else 0
                end = last_part_cut if current_part == part_count - 1 else len(chunk)
                yield chunk[start:end]
        finally:
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            work_loads[index] -= 1


streamers: Dict[int, ByteStreamer] = {}


def get_streamer(index: int) -> ByteStreamer:
    if index not in streamers:
        streamers[index] = ByteStreamer(multi_clients[index])
    return streamers[index]


async def prewarm_streamers() -> None:
    await asyncio.gather(*(get_streamer(index).prewarm() for index in multi_clients))


async def revoke_file(db_id) -> None:
    """Deletes a file and stops its links working straight away."""
    await db.delete_one_file(db_id)
    for streamer in streamers.values():
        streamer.cached_file_ids.pop(str(db_id), None)
