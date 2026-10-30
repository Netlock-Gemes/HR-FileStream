import hmac
import time
import hashlib
from aiohttp import web
from FileStream.config import Server

COOKIE = "hrfs_session"
SESSION_SECONDS = 30 * 24 * 3600
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60
# Browsers can't send this header across sites without a CORS grant
API_HEADER = "X-HR-Dashboard"

failures = {}


def scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)


def hash_password(password: str, salt: bytes) -> str:
    return f"{salt.hex()}:{scrypt(password, salt).hex()}"


def check_login(user: str, password: str) -> bool:
    try:
        salt, expected = Server.DASHBOARD_PASSWORD_HASH.split(":")
        password_ok = hmac.compare_digest(scrypt(password, bytes.fromhex(salt)).hex(), expected)
    except ValueError:
        return False
    return password_ok and hmac.compare_digest(user, Server.DASHBOARD_USER)


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


def sign(expires: str) -> str:
    return hmac.new(Server.DASHBOARD_SECRET.encode(), expires.encode(), hashlib.sha256).hexdigest()


def session_value() -> str:
    expires = str(int(time.time()) + SESSION_SECONDS)
    return f"{expires}.{sign(expires)}"


def is_logged_in(request: web.Request) -> bool:
    expires, _, signature = request.cookies.get(COOKIE, "").partition(".")
    if not Server.DASHBOARD_SECRET or not expires.isdigit():
        return False
    return hmac.compare_digest(signature, sign(expires)) and int(expires) > time.time()


def start_session(response: web.Response) -> None:
    response.set_cookie(
        COOKIE, session_value(), max_age=SESSION_SECONDS, path="/dashboard",
        httponly=True, secure=Server.HAS_SSL, samesite="Strict",
    )


def end_session(response: web.Response) -> None:
    response.del_cookie(COOKIE, path="/dashboard")
