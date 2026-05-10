from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from otter.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"


def create_app() -> FastAPI:
    from otter.api import (
        audio,
        lectures,
        settings,
        status as status_router,
        summaries,
        templates,
    )

    app = FastAPI(
        title="Otter",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.include_router(lectures.router)
    app.include_router(audio.router)
    app.include_router(status_router.router)
    app.include_router(settings.router)
    app.include_router(templates.router)
    app.include_router(summaries.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if WEB_DIST.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=WEB_DIST / "assets"),
            name="assets",
        )

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str) -> FileResponse:
            del full_path  # path captured for catch-all; index.html handles client routing
            return FileResponse(WEB_DIST / "index.html")

    return app


app = create_app()
