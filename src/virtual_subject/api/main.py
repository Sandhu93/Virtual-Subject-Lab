from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from virtual_subject.api.routers import analysis, atlases, exports, health, runs, stimuli
from virtual_subject.config import get_settings
from virtual_subject.db.bootstrap import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="virtual-subject-api", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in settings.frontend_origins.split(",") if item.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(stimuli.router, prefix="/api/v1")
app.include_router(runs.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(atlases.router, prefix="/api/v1")


@app.get("/")
def api_root() -> dict[str, str]:
    return {
        "service": "virtual-subject-api",
        "version": "0.1.0",
        "docs": "/docs",
        "api_base": "/api/v1",
    }


def run() -> None:
    uvicorn.run(
        "virtual_subject.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_env == "development",
    )
