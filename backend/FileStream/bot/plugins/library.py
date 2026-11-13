import asyncio
import logging
from FileStream.bot import FileStream
from FileStream.config import Telegram, Server
from FileStream.utils.database import db
from FileStream.utils.library import active_channels, apply_caption, import_posts, index_message, is_video, library_channel
from pyrogram import filters, Client
from pyrogram.types import Message
from pyrogram.enums.parse_mode import ParseMode

auth_users = filters.user(Telegram.AUTH_USERS)


@FileStream.on_message(filters.channel & library_channel & (filters.video | filters.document))
async def library_post_handler(_: Client, message: Message):
    try:
        await index_message(message)
    except Exception as e:
        logging.error(f"Could not index post {message.id} of {message.chat.id}: {e!r}")


@FileStream.on_edited_message(filters.channel & library_channel & (filters.video | filters.document))
async def library_edit_handler(_: Client, message: Message):
    file_data = await db.find_channel_post(message.chat.id, message.id)
    if file_data and is_video(message):
        await apply_caption(file_data, message.caption)


@FileStream.on_deleted_messages(library_channel)
async def library_delete_handler(_: Client, messages):
    if messages and messages[0].chat:
        await db.delete_library_messages(messages[0].chat.id, [message.id for message in messages])


@FileStream.on_message(filters.command("library") & filters.private & auth_users)
async def library_info(_: Client, message: Message):
    totals = await db.library_totals()
    channels = " ".join(f"<code>{channel}</code>" for channel in active_channels)
    lines = [
        f"<b>Library:</b> <code>{totals['videos']}</code> videos",
        f"<b>Channels:</b> {channels or 'none, add one in the dashboard'}",
        f"\n<b>Dashboard:</b>\n{Server.URL}dashboard",
    ]
    if Server.ADDON_TOKEN:
        lines.append(f"\n<b>Addon link:</b>\n<code>{Server.URL}stremio/{Server.ADDON_TOKEN}/manifest.json</code>")
    await message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML, disable_web_page_preview=True, quote=True)


@FileStream.on_message(filters.command("scan") & filters.private & auth_users)
async def library_scan(_: Client, message: Message):
    """/scan <channel_id> [last_post_id] adds posts from before the bot joined."""
    try:
        channel = int(message.command[1])
        last_post = int(message.command[2]) if len(message.command) > 2 else None
    except (IndexError, ValueError):
        await message.reply_text("Use: <code>/scan channel_id last_post_id</code>", parse_mode=ParseMode.HTML, quote=True)
        return
    if channel not in active_channels:
        await message.reply_text("Add that channel in the dashboard first.", quote=True)
        return
    await message.reply_text("Import started. Follow it on the Channels page of the dashboard.", quote=True)
    asyncio.create_task(import_posts(channel, last_post))
