"""SQLAlchemy ORM models.

Importing models here ensures their tables register on Base.metadata for
Alembic autogenerate (via `import app.models` in alembic/env.py) and for
Base.metadata.create_all in the test fixtures.
"""
from app.models.project import Project
from app.models.user import User

__all__ = ["User", "Project"]
