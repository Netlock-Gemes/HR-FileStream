import hmac
import time
import asyncio
import hashlib
from typing import Optional
from aiohttp import web
from FileStream.config import Server
from FileStream.server.exceptions import FIleNotFound
from FileStream.utils.database import db

COOKIE = "hrfs_auth"
# The pre-accounts admin cookie, scoped to /dashboard. Cleared at logout; it's ignored otherwise
OLD_COOKIE = "hrfs_session"
# Only matters for the admin: shows the viewer site instead of the dashboard
VIEW_COOKIE = "hrfs_view"
SESSION_SECONDS = 30 * 24 * 3600
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60
# Browsers can't send this header across sites without a CORS grant
API_HEADER = "X-HR-Dashboard"
ADMIN = "admin"
MIN_PASSWORD = 8
ACCOUNT_CACHE_SECONDS = 30
SEEN_EVERY = 300

failures = {}
# Account id -> (account, loaded at). Cleared on every change, so a reset or disable applies at once
accounts_cache = {}


def scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)


def hash_password(password: str, salt: bytes) -> str:
    return f"{salt.hex()}:{scrypt(password, salt).hex()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split(":")
        return hmac.compare_digest(scrypt(password, bytes.fromhex(salt)).hex(), expected)
    except ValueError:
        return False


def check_admin(user: str, password: str) -> bool:
    password_ok = password_matches(password, Server.DASHBOARD_PASSWORD_HASH)
    return password_ok and hmac.compare_digest(user, Server.DASHBOARD_USER)


async def check_login(user: str, password: str) -> Optional[dict]:
    """Returns the signed-in identity, or None. Every path runs one scrypt, so timing says nothing."""
    user = user.strip()
    if hmac.compare_digest(user, Server.DASHBOARD_USER):
        if await asyncio.to_thread(check_admin, user, password):
            return {"id": ADMIN, "version": 0}
        return None
    account = await db.find_account(user)
    stored = account["password_hash"] if account else Server.DASHBOARD_PASSWORD_HASH
    if await asyncio.to_thread(password_matches, password, stored) and account and not account.get("disabled"):
        return {"id": str(account["_id"]), "version": account.get("session_version", 0)}
    return None


def client_ip(request: web.Request) -> str:
    return request.headers.get("X-Real-IP", request.remote or "")


def is_locked(ip: str) -> bool:
    count, since = failures.get(ip, (0, 0))
    if time.time() - since > LOCK_SECONDS:
        failures.pop(ip, None)
        return False
    return count >= MAX_FAILURES


def record_failure(ip: str) -> None:
    count, _ = failures.get(ip, (0, 0))
    failures[ip] = (count + 1, time.time())


def sign(payload: str) -> str:
    return hmac.new(Server.DASHBOARD_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def start_session(response: web.Response, identity: dict) -> None:
    expires = int(time.time()) + SESSION_SECONDS
    payload = f"{identity['id']}.{identity['version']}.{expires}"
    response.set_cookie(
        COOKIE, f"{payload}.{sign(payload)}", max_age=SESSION_SECONDS, path="/",
        httponly=True, secure=Server.HAS_SSL, samesite="Lax",
    )
    response.del_cookie(OLD_COOKIE, path="/dashboard")


def end_session(response: web.Response) -> None:
    response.del_cookie(COOKIE, path="/")
    response.del_cookie(OLD_COOKIE, path="/dashboard")
    response.del_cookie(VIEW_COOKIE, path="/")


def forget_account(account_id: str) -> None:
    accounts_cache.pop(str(account_id), None)


async def load_account(account_id: str) -> Optional[dict]:
    cached = accounts_cache.get(account_id)
    if cached and time.time() - cached[1] < ACCOUNT_CACHE_SECONDS:
        return cached[0]
    try:
        account = await db.get_account(account_id)
    except FIleNotFound:
        account = None
    accounts_cache[account_id] = (account, time.time())
    return account


async def current_user(request: web.Request) -> Optional[dict]:
    """{role, id, name} for a valid session, else None. Worked out once per request."""
    if "user" in request:
        return request["user"]
    request["user"] = None
    parts = request.cookies.get(COOKIE, "").split(".")
    if len(parts) != 4 or not Server.DASHBOARD_SECRET:
        return None
    uid, version, expires, signature = parts
    if not expires.isdigit() or int(expires) < time.time():
        return None
    if not hmac.compare_digest(signature, sign(f"{uid}.{version}.{expires}")):
        return None

    if uid == ADMIN:
        request["user"] = {"role": "admin", "id": ADMIN, "name": Server.DASHBOARD_USER}
        return request["user"]

    account = await load_account(uid)
    if not account or account.get("disabled") or str(account.get("session_version", 0)) != version:
        return None
    if time.time() - account.get("last_seen", 0) > SEEN_EVERY:
        account["last_seen"] = time.time()
        await db.update_account(uid, {"last_seen": account["last_seen"]})
    request["user"] = {"role": "viewer", "id": uid, "name": account["username"]}
    return request["user"]


def wants_viewer_site(request: web.Request, user: dict) -> bool:
    return user["role"] == "viewer" or request.cookies.get(VIEW_COOKIE) == "user"
