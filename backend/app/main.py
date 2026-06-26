"""FastAPI application factory."""
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.jobs.snapshot import run_coarse_capture, run_fine_capture, run_prune


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Start/stop the in-process snapshot scheduler (ADR-0014).

    Runs in the server process only (request-test clients do not trigger
    lifespan), so the scheduler never starts during pytest. Assumes a single
    backend instance; scaling to multiple replicas would double-run jobs and
    needs a leader lock or a dedicated worker.
    """
    scheduler = AsyncIOScheduler()
    if settings.scheduler_enabled:
        scheduler.add_job(
            run_fine_capture,
            "interval",
            minutes=settings.snapshot_fine_interval_minutes,
            id="snapshot_fine",
        )
        scheduler.add_job(
            run_coarse_capture, "cron", day=1, hour=0, minute=0, id="snapshot_coarse"
        )
        scheduler.add_job(
            run_prune, "cron", hour=3, minute=0, id="snapshot_prune"
        )
        scheduler.start()
    application.state.scheduler = scheduler
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    application = FastAPI(
        title="Codegram API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(api_router, prefix="/api")
    return application


app = create_app()
