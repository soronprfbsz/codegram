"""Aggregate API router mounted under /api."""
from fastapi import APIRouter

from app.api.routes import (
    account,
    accounts,
    auth,
    edit_lock,
    health,
    introspect,
    members,
    projects,
    snapshots,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(account.router)
api_router.include_router(accounts.router)
api_router.include_router(projects.router)
api_router.include_router(members.router)
api_router.include_router(edit_lock.router)
api_router.include_router(snapshots.router)
api_router.include_router(introspect.router)
