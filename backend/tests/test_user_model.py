"""Tests that the User model registers on Base.metadata and schemas import."""
import uuid

from app.db.base import Base
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate


def test_user_table_registered_on_base_metadata():
    # The fastapi-users UUID base sets the table name to "user".
    assert User.__tablename__ == "user"
    assert "user" in Base.metadata.tables
    columns = {c.name for c in Base.metadata.tables["user"].columns}
    assert {
        "id",
        "email",
        "hashed_password",
        "is_active",
        "is_superuser",
        "is_verified",
    }.issubset(columns)


def test_models_package_imports_user():
    # Importing the package must pull in User so Alembic / create_all see it.
    import app.models

    assert hasattr(app.models, "User")


def test_user_schemas_shapes():
    # UserCreate accepts email + password; UserRead exposes id + email.
    create = UserCreate(email="a@example.com", password="secret123")
    assert create.email == "a@example.com"
    assert create.password == "secret123"

    read = UserRead(
        id=uuid.uuid4(),
        email="a@example.com",
        is_active=True,
        is_superuser=False,
        is_verified=False,
    )
    assert read.email == "a@example.com"

    # UserUpdate fields are all optional.
    update = UserUpdate()
    assert update.email is None
