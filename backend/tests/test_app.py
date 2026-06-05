"""Tests for the FastAPI app factory and router mounting."""
from fastapi import FastAPI

from app.main import app


def test_app_is_fastapi_instance():
    assert isinstance(app, FastAPI)
    assert app.title == "ERD-DBML API"


def test_api_router_mounted_under_api_prefix():
    # The OpenAPI schema must expose the docs entry under /api.
    assert app.docs_url == "/api/docs"
    assert app.openapi_url == "/api/openapi.json"
