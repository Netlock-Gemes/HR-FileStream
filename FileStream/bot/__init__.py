import os
from ..config import Telegram, Server
from pyrogram import Client

if Telegram.SECONDARY:
    plugins=None
    no_updates=True
else:    
    plugins={"root": "FileStream/bot/plugins"}
    no_updates=None

os.makedirs(Server.DATA_DIR, exist_ok=True)

FileStream = Client(
    name="FileStream",
    api_id=Telegram.API_ID,
    api_hash=Telegram.API_HASH,
    workdir=Server.DATA_DIR,
    plugins=plugins,
    bot_token=Telegram.BOT_TOKEN,
    sleep_threshold=Telegram.SLEEP_THRESHOLD,
    workers=Telegram.WORKERS,
    no_updates=no_updates
)

multi_clients = {}
work_loads = {}

