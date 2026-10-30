from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from FileStream.config import Telegram


class LANG(object):

    START_TEXT = """
<b>👋 Hello, {}!</b>

I'm a powerful Telegram bot that allows you to stream files directly and generate shareable download links.

✨ <b>Features:</b>
   ├ Stream videos online
   ├ Get instant direct download links
   ├ Works in both private chats & channels

🤖 You Are using <b>@{}</b>
"""

    HELP_TEXT = """
<b>🚀 How to Use:</b>

1️⃣ Send me any <b>document, video, or media file.</b>
2️⃣ I’ll generate a <b>streamable link</b> instantly!
3️⃣ Videos posted in a <b>library channel</b> go straight to the dashboard and addon.

<b>/library</b> shows your dashboard and addon links.

🔧 Found a bug? <a href='https://telegram.me/H_R_Wells'>Report to Developer</a>.
"""

    ABOUT_TEXT = """
<b>🤖 Bot Name:</b> {}
<b>📌 Version:</b> {}
<b>📅 Last Updated:</b> 31-October-2026
<b>👨‍💻 Developer:</b> <a href='https://telegram.me/H_R_Wells'>HR Wells</a>
"""

    STREAM_TEXT = """
<b><u>Your Link Generated!</u></b>

📂 <b>File Name : </b> {}

📦 <b>File Size : </b> <code>{}</code>

📥 <b>Download : </b> <code>{}</code>

🖥 <b>Watch Online : </b> <code>{}</code>

🔗 <b>Share Link : </b> <code>{}</code>
"""

    STREAM_TEXT_X = """
<b><u>Your Link Generated!</u></b>

📂 <b>File Name : </b> {}

📦 <b>File Size : </b> <code>{}</code>

📥 <b>Download : </b> <code>{}</code>

🖥 <b>Watch Online : </b> <code>{}</code>
"""

    BAN_TEXT = """
🚫 <b>Access Denied</b>

Sorry, you have been banned from using this bot.

🔹 Need help? Contact the <a href='tg://user?id={}'>Developer</a>.
"""


class BUTTON(object):
    START_BUTTONS = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("❓ Help", callback_data="help"),
                InlineKeyboardButton("ℹ️ About", callback_data="about"),
                InlineKeyboardButton("❌ Close", callback_data="close"),
            ],
            [
                InlineKeyboardButton("📢 Updates Channel", url=f"https://t.me/{Telegram.UPDATES_CHANNEL}")
            ],
        ]
    )

    HELP_BUTTONS = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("🏠 Home", callback_data="home"),
                InlineKeyboardButton("ℹ️ About", callback_data="about"),
                InlineKeyboardButton("❌ Close", callback_data="close"),
            ],
            [
                InlineKeyboardButton("📢 Updates Channel", url=f"https://t.me/{Telegram.UPDATES_CHANNEL}")
            ],
        ]
    )

    ABOUT_BUTTONS = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("🏠 Home", callback_data="home"),
                InlineKeyboardButton("❓ Help", callback_data="help"),
                InlineKeyboardButton("❌ Close", callback_data="close"),
            ],
            [
                InlineKeyboardButton("📢 Updates Channel", url=f"https://t.me/{Telegram.UPDATES_CHANNEL}")
            ],
        ]
    )
