"""Custom HTTP middleware.

The ``DataOriginHeaderMiddleware`` brands every response with the canonical
``X-Data-Origin`` header (``synthetic`` or ``real``) and lists wired feeds via
``X-Real-Feeds`` so external consumers can never confuse a demo build with a
production deployment.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.data_origin import data_origin, real_feeds


class DataOriginHeaderMiddleware(BaseHTTPMiddleware):
    """Append the ``X-Data-Origin`` (and optional ``X-Real-Feeds``) header."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response: Response = await call_next(request)
        response.headers["X-Data-Origin"] = data_origin()
        wired = real_feeds()
        if wired:
            response.headers["X-Real-Feeds"] = ",".join(wired)
        return response
