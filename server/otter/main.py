from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Otter", docs_url="/api/docs", openapi_url="/api/openapi.json")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
