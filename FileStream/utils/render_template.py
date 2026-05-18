import aiohttp
import jinja2
import urllib.parse

from FileStream.config import Telegram, Server
from FileStream.utils.database import Database
from FileStream.utils.human_readable import humanbytes

db = Database(
    Telegram.DATABASE_URL,
    Telegram.SESSION_NAME
)

async def render_page(db_id, template=None):

    file_data = await db.get_file(db_id)

    src = urllib.parse.urljoin(
        Server.URL,
        f'dl/{file_data["_id"]}'
    )

    file_size = humanbytes(file_data['file_size'])

    file_name = file_data['file_name'].replace("_", " ")

    # =====================================================
    # TEMPLATE SELECTOR
    # =====================================================

    if template:
        template_file = f"FileStream/template/{template}"

    else:
        if str(
            (file_data['mime_type']).split('/')[0].strip()
        ) == 'video':

            template_file = "FileStream/template/play.html"

        else:
            template_file = "FileStream/template/dl.html"

            async with aiohttp.ClientSession() as s:
                async with s.get(src) as u:
                    file_size = humanbytes(
                        int(u.headers.get('Content-Length'))
                    )

    # =====================================================
    # RENDER
    # =====================================================

    with open(template_file, encoding="utf-8") as f:
        template_data = jinja2.Template(f.read())

    return template_data.render(
        file_name=file_name,
        file_url=src,
        file_size=file_size
    )