from os import environ as env
from dotenv import load_dotenv

load_dotenv()

class Telegram:
    API_ID = int(env.get("API_ID"))
    API_HASH = str(env.get("API_HASH"))
    BOT_TOKEN = str(env.get("BOT_TOKEN"))
    OWNER_ID = int(env.get('OWNER_ID'))
    WORKERS = int(env.get("WORKERS", "6"))  # 6 workers = 6 commands at once
    DATABASE_URL = str(env.get('DATABASE_URL'))
    UPDATES_CHANNEL = str(env.get('UPDATES_CHANNEL', "Telegram"))
    SESSION_NAME = str(env.get('SESSION_NAME', 'FileStream'))
    FORCE_SUB_ID = env.get('FORCE_SUB_ID', None)
    FORCE_SUB = env.get('FORCE_UPDATES_CHANNEL', False)
    FORCE_SUB = True if str(FORCE_SUB).lower() == "true" else False
    SLEEP_THRESHOLD = int(env.get("SLEEP_THRESHOLD", "60"))
    FILE_PIC = env.get('FILE_PIC', "https://files.catbox.moe/p47dsw.jpg")
    START_PIC = env.get('START_PIC', "https://files.catbox.moe/hbz7s4.jpg")
    VERIFY_PIC = env.get('VERIFY_PIC', "https://files.catbox.moe/xlj0w5.jpg")
    MULTI_CLIENT = False
    FLOG_CHANNEL = int(env.get("FLOG_CHANNEL", None))   # Logs channel for file logs
    ULOG_CHANNEL = int(env.get("ULOG_CHANNEL", None))   # Logs channel for user logs
    MODE = env.get("MODE", "primary")
    SECONDARY = True if MODE.lower() == "secondary" else False
    # The only accounts that can use the bot. Empty falls back to the owner, never to everyone
    AUTH_USERS = list(set(int(x) for x in str(env.get("AUTH_USERS", "")).replace(",", " ").split())) or [OWNER_ID]
    # Channels added on first start. After that, manage them in the dashboard
    LIBRARY_CHANNELS = [int(x) for x in str(env.get("LIBRARY_CHANNELS", "")).replace(",", " ").split()]

class Server:
    PORT = int(env.get("PORT", 8080))
    BIND_ADDRESS = str(env.get("BIND_ADDRESS", "0.0.0.0"))
    PING_INTERVAL = int(env.get("PING_INTERVAL", "1200"))
    HAS_SSL = str(env.get("HAS_SSL", "0").lower()) in ("1", "true", "t", "yes", "y")
    NO_PORT = str(env.get("NO_PORT", "0").lower()) in ("1", "true", "t", "yes", "y")
    FQDN = str(env.get("FQDN", BIND_ADDRESS))
    URL = "http{}://{}{}/".format(
        "s" if HAS_SSL else "", FQDN, "" if NO_PORT else ":" + str(PORT)
    )
    STREAM_PARALLEL = int(env.get("STREAM_PARALLEL", "4"))  # 1 MB chunks fetched ahead per request
    STREAM_CACHE_MB = int(env.get("STREAM_CACHE_MB", "64"))
    DATA_DIR = str(env.get("DATA_DIR", "data"))
    ADDON_TOKEN = str(env.get("ADDON_TOKEN", ""))  # Secret in the Stremio addon URL
    DASHBOARD_USER = str(env.get("DASHBOARD_USER", "hrwells"))
    DASHBOARD_PASSWORD_HASH = str(env.get("DASHBOARD_PASSWORD_HASH", ""))  # salt:hash, see README
    DASHBOARD_SECRET = str(env.get("DASHBOARD_SECRET", ""))  # Signs login cookies
