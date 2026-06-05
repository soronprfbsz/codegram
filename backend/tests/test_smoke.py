"""Smoke test: the app package imports cleanly."""
import importlib


def test_app_package_imports():
    module = importlib.import_module("app")
    assert module.__doc__ == "ERD-DBML backend application package."
