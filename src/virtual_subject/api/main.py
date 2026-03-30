from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from virtual_subject.api.routers import analysis, atlases, exports, health, runs, stimuli
from virtual_subject.config import get_settings
from virtual_subject.db.bootstrap import init_db
from virtual_subject.db.session import SessionLocal
from virtual_subject.services.app_service import AppService

settings = get_settings()
BASE_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = BASE_DIR / "web" / "static"
TEMPLATE_DIR = BASE_DIR / "web" / "templates"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="virtual-subject", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))


app.include_router(health.router, prefix="/api/v1")
app.include_router(stimuli.router, prefix="/api/v1")
app.include_router(runs.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(atlases.router, prefix="/api/v1")


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


@app.get("/stimuli/new", response_class=HTMLResponse)
def stimulus_page(request: Request) -> HTMLResponse:
    with SessionLocal() as db:
        service = AppService(db)
        context = {
            "app_name": "virtual-subject",
            "oat_version": settings.oat_version,
            "page": "stimuli",
            "stimuli": service.list_stimuli(),
        }
    return templates.TemplateResponse(request, "stimuli.html", context)


@app.get("/runs/{run_id}", response_class=HTMLResponse)
def run_workspace(request: Request, run_id: str) -> HTMLResponse:
    with SessionLocal() as db:
        service = AppService(db)
        try:
            run = service.get_run(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        context = {
            "app_name": "virtual-subject",
            "oat_version": settings.oat_version,
            "page": "runs",
            "run": run,
            "run_ablations": service.get_run_ablations(run_id),
            "roi_metadata": service.atlas.roi_metadata(),
        }
    return templates.TemplateResponse(request, "run_workspace.html", context)


@app.get("/compare", response_class=HTMLResponse)
def compare_page(request: Request) -> HTMLResponse:
    with SessionLocal() as db:
        service = AppService(db)
        context = {
            "app_name": "virtual-subject",
            "oat_version": settings.oat_version,
            "page": "compare",
            "runs": service.list_runs(),
        }
    return templates.TemplateResponse(request, "compare.html", context)


@app.get("/exports", response_class=HTMLResponse)
def exports_page(request: Request) -> HTMLResponse:
    with SessionLocal() as db:
        service = AppService(db)
        context = {
            "app_name": "virtual-subject",
            "oat_version": settings.oat_version,
            "page": "exports",
            "runs": service.list_runs(),
            "exports": service.list_exports(),
        }
    return templates.TemplateResponse(request, "exports.html", context)


@app.get("/about", response_class=HTMLResponse)
def about_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "about.html",
        {"app_name": "virtual-subject", "oat_version": settings.oat_version, "page": "about"},
    )


def run() -> None:
    uvicorn.run(
        "virtual_subject.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_env == "development",
    )
