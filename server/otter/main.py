from contextlib import asynccontextmanager

from fastapi import FastAPI

from otter.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    from otter.api import audio, lectures, settings, status as status_router, templates

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

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
