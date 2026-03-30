from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from virtual_subject.api.routers import health
from virtual_subject.config import get_settings

settings = get_settings()
BASE_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = BASE_DIR / "web" / "static"
TEMPLATE_DIR = BASE_DIR / "web" / "templates"

app = FastAPI(title="virtual-subject", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

app.include_router(health.router, prefix="/api/v1")


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "app_name": "virtual-subject",
            "oat_version": settings.oat_version,
            "tribe_mode": settings.tribe_mode,
        },
    )


def run() -> None:
    uvicorn.run(
        "virtual_subject.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_env == "development",
    )

