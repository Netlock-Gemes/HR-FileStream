from aiohttp import web
from .stream_routes import routes
from .library_routes import routes as library_routes
from .dashboard_routes import dashboard_guard, routes as dashboard_routes

def web_server():
    web_app = web.Application(client_max_size=30000000, middlewares=[dashboard_guard])
    web_app.add_routes(routes)
    web_app.add_routes(library_routes)
    web_app.add_routes(dashboard_routes)
    return web_app
