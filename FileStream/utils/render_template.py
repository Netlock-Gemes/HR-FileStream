import os
import jinja2
import urllib.parse

from FileStream.config import Server
from FileStream.utils.database import db
from FileStream.utils.human_readable import humanbytes
from FileStream.utils.library import poster_url

templates = jinja2.Environment(
    loader=jinja2.FileSystemLoader("FileStream/template"),
    autoescape=jinja2.select_autoescape(["html"]),
)


def render_file(template: str, **context) -> str:
    return templates.get_template(template).render(**context)


async def render_page(db_id, template=None):
    file_data = await db.get_file(db_id)
    mime_type = file_data['mime_type'] or ""

    name = file_data['file_name'].replace("_", " ")
    if mime_type.startswith("video/"):
        name = os.path.splitext(name)[0]

    if not template:
        template = "play.html" if mime_type.startswith("video/") else "dl.html"

    return render_file(
        template,
        file_name=file_data.get('title') or name,
        file_url=urllib.parse.urljoin(Server.URL, f'dl/{file_data["_id"]}'),
        file_size=humanbytes(file_data['file_size']),
        poster=poster_url(file_data, absolute=False) if file_data.get("library") else None,
        file_id=str(file_data["_id"]) if file_data.get("library") else None,
        cast=file_data.get("cast") or [],
    )
