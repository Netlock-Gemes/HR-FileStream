
import asyncio
from FileStream.bot import FileStream, multi_clients
from FileStream.utils.bot_utils import is_user_banned, is_user_exist, is_user_joined, gen_link, is_user_authorized
from FileStream.utils.database import db
from FileStream.utils.file_properties import get_file_ids, get_file_info
from FileStream.config import Telegram
from pyrogram import filters, Client
from pyrogram.errors import FloodWait
from pyrogram.types import Message
from pyrogram.enums.parse_mode import ParseMode

@FileStream.on_message(
    filters.private
    & (
            filters.document
            | filters.video
            | filters.video_note
            | filters.audio
            | filters.voice
            | filters.animation
            | filters.photo
    ),
    group=4,
)
async def private_receive_handler(bot: Client, message: Message):
    if not await is_user_authorized(message):
        return
    if await is_user_banned(message):
        return

    await is_user_exist(bot, message)
    if Telegram.FORCE_SUB:
        if not await is_user_joined(bot, message):
            return
    try:
        inserted_id = await db.add_file(get_file_info(message))
        await get_file_ids(False, inserted_id, multi_clients, message)
        reply_markup, stream_text = await gen_link(_id=inserted_id)
        await message.reply_text(
            text=stream_text,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
            reply_markup=reply_markup,
            quote=True
        )
    except FloodWait as e:
        print(f"Sleeping for {str(e.value)}s")
        await asyncio.sleep(e.value)
        await bot.send_message(chat_id=Telegram.ULOG_CHANNEL,
                       text=f"Got Floodwait of {str(e.value)}s from [{message.from_user.first_name}](tg://user?id={message.from_user.id})\n\n**User ID :** `{str(message.from_user.id)}`",
                       disable_web_page_preview=True, parse_mode=ParseMode.MARKDOWN)
