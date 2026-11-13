from pyrogram.errors import UserNotParticipant, FloodWait
from pyrogram.enums import ChatMemberStatus
from pyrogram.enums.parse_mode import ParseMode
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, Message
from FileStream.utils.translation import LANG
from FileStream.utils.database import db
from FileStream.utils.human_readable import humanbytes
from FileStream.config import Telegram, Server
from FileStream.bot import FileStream
import asyncio
from typing import (
    Union
)

async def get_invite_link(bot, chat_id: Union[str, int]):
    try:
        invite_link = await bot.create_chat_invite_link(chat_id=chat_id)
        return invite_link
    except FloodWait as e:
        print(f"Sleep of {e.value}s caused by FloodWait ...")
        await asyncio.sleep(e.value)
        return await get_invite_link(bot, chat_id)

async def is_user_joined(bot, message: Message):
    if Telegram.FORCE_SUB_ID and Telegram.FORCE_SUB_ID.startswith("-100"):
        channel_chat_id = int(Telegram.FORCE_SUB_ID)    # When id startswith with -100
    elif Telegram.FORCE_SUB_ID and (not Telegram.FORCE_SUB_ID.startswith("-100")):
        channel_chat_id = Telegram.FORCE_SUB_ID     # When id not startswith -100
    else:
        return 200
    try:
        user = await bot.get_chat_member(chat_id=channel_chat_id, user_id=message.from_user.id)
        if user.status == ChatMemberStatus.BANNED:
            await message.reply_text(
                text=LANG.BAN_TEXT.format(Telegram.OWNER_ID),
                parse_mode=ParseMode.MARKDOWN,
                disable_web_page_preview=True
            )
            return False
    except UserNotParticipant:
        invite_link = await get_invite_link(bot, chat_id=channel_chat_id)
        if Telegram.VERIFY_PIC:
            ver = await message.reply_photo(
                photo=Telegram.VERIFY_PIC,
                caption="<i>Join my channel to use me 🔐</i>",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(
                [[
                    InlineKeyboardButton("❆ Join My Channel ❆", url=invite_link.invite_link)
                ]]
                )
            )
        else:
            ver = await message.reply_text(
                text = "<i>Join my channel to use me 🔐</i>",
                reply_markup=InlineKeyboardMarkup(
                    [[
                        InlineKeyboardButton("❆ Join My Channel ❆", url=invite_link.invite_link)
                    ]]
                ),
                parse_mode=ParseMode.HTML
            )
        await asyncio.sleep(30)
        try:
            await ver.delete()
            await message.delete()
        except Exception:
            pass
        return False
    except Exception:
        await message.reply_text(
            text = f"<i>Something went wrong! contact developer!</i> <b><a href='https://t.me/{Telegram.UPDATES_CHANNEL}'>[ Click Here ]</a></b>",
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True)
        return False
    return True

#---------------------[ PRIVATE GEN LINK + CALLBACK ]---------------------#

async def gen_link(_id):
    file_info = await db.get_file(_id)
    file_name = file_info['file_name']
    file_size = humanbytes(file_info['file_size'])
    mime_type = file_info['mime_type'] or ""

    page_link = f"{Server.URL}watch/{_id}"
    stream_link = f"{Server.URL}dl/{_id}"
    mx_link = f"{Server.URL}mx/{_id}"
    file_link = f"https://t.me/{FileStream.username}?start=file_{_id}"

    if "video" in mime_type:
        stream_text = LANG.STREAM_TEXT.format(file_name, file_size, stream_link, page_link, file_link)
        reply_markup = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🖥 Stream", url=page_link), InlineKeyboardButton("📥 Download", url=stream_link)],
                [InlineKeyboardButton("📂 Get File", url=file_link), InlineKeyboardButton("🚫 Revoke File", callback_data=f"msgdelpvt_{_id}")],
                [InlineKeyboardButton("🎬 Watch in MX", url=mx_link), InlineKeyboardButton("❌ Close", callback_data="close")]
            ]
        )
    else:
        stream_text = LANG.STREAM_TEXT_X.format(file_name, file_size, stream_link, page_link)
        reply_markup = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("📥 Download", url=stream_link)],
                [InlineKeyboardButton("📂 Get File", url=file_link), InlineKeyboardButton("🚫 Revoke File", callback_data=f"msgdelpvt_{_id}")],
                [InlineKeyboardButton("❌ Close", callback_data="close")]
            ]
        )
    return reply_markup, stream_text

#---------------------[ GEN STREAM LINKS FOR CHANNEL ]---------------------#

async def gen_linkx(m:Message , _id, name: list):
    file_info = await db.get_file(_id)
    file_name = file_info['file_name']
    mime_type = file_info['mime_type'] or ""
    file_size = humanbytes(file_info['file_size'])

    page_link = f"{Server.URL}watch/{_id}"
    stream_link = f"{Server.URL}dl/{_id}"
    file_link = f"https://t.me/{FileStream.username}?start=file_{_id}"

    if "video" in mime_type:
        stream_text= LANG.STREAM_TEXT_X.format(file_name, file_size, stream_link, page_link)
        reply_markup = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🖥 Stream", url=page_link), InlineKeyboardButton("📥 Download", url=stream_link)]
            ]
        )
    else:
        stream_text= LANG.STREAM_TEXT_X.format(file_name, file_size, stream_link, file_link)
        reply_markup = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("📥 Download", url=stream_link)]
            ]
        )
    return reply_markup, stream_text

#---------------------[ USER BANNED ]---------------------#

async def is_user_banned(message):
    if await db.is_user_banned(message.from_user.id):
        await message.reply_text(
            text=LANG.BAN_TEXT.format(Telegram.OWNER_ID),
            parse_mode=ParseMode.MARKDOWN,
            disable_web_page_preview=True
        )
        return True
    return False

#---------------------[ USER AUTH ]---------------------#

async def is_user_authorized(message):
    user = message.from_user
    if user and user.id in Telegram.AUTH_USERS:
        return True

    await message.reply_text(
        text="You are not authorized to use this bot!",
        parse_mode=ParseMode.MARKDOWN,
        disable_web_page_preview=True
    )
    return False

#---------------------[ USER EXIST ]---------------------#

async def is_user_exist(bot, message):
    if not bool(await db.get_user(message.from_user.id)):
        await db.add_user(message.from_user.id)
        await bot.send_message(
            Telegram.ULOG_CHANNEL,
            f"**#NewUser**\n**⬩ User Name :** [{message.from_user.first_name}](tg://user?id={message.from_user.id})\n**⬩ User ID :** `{message.from_user.id}`"
        )

async def verify_user(bot, message):
    if not await is_user_authorized(message):
        return False

    if await is_user_banned(message):
        return False

    await is_user_exist(bot, message)

    if Telegram.FORCE_SUB:
        if not await is_user_joined(bot, message):
            return False

    return True
