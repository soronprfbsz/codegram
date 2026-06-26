"""Unit tests for the Project pydantic v2 DTOs."""
import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate


def test_project_create_defaults_dbml_and_layout() -> None:
    """ProjectCreate accepts name alone; dbml_text/layout default empty."""
    dto = ProjectCreate(name="My ERD")
    assert dto.name == "My ERD"
    assert dto.dbml_text == ""
    assert dto.layout == {}


def test_project_create_rejects_empty_name() -> None:
    """name must be non-empty (min_length=1)."""
    with pytest.raises(ValidationError):
        ProjectCreate(name="")


def test_project_update_all_optional() -> None:
    """ProjectUpdate may be fully empty; unset fields are None."""
    dto = ProjectUpdate()
    assert dto.name is None
    assert dto.dbml_text is None
    assert dto.layout is None


def test_project_update_partial_dbml_only() -> None:
    """An autosave PATCH body may set only dbml_text."""
    dto = ProjectUpdate(dbml_text="table t {}")
    assert dto.dbml_text == "table t {}"
    assert dto.name is None
    assert dto.layout is None
    # exclude_unset only emits the field that was actually provided.
    assert dto.model_dump(exclude_unset=True) == {"dbml_text": "table t {}"}


def test_project_read_from_attributes() -> None:
    """ProjectRead.model_validate works against an ORM-like object."""

    class FakeORM:
        id = uuid.uuid4()
        user_id = uuid.uuid4()
        name = "My ERD"
        dbml_text = "table t {}"
        layout = {"nodes": []}
        created_at = datetime.now(timezone.utc)
        updated_at = datetime.now(timezone.utc)
        glyph = "🗄️"
        color = "blue"
        bg_color = "transparent"

    dto = ProjectRead.model_validate(FakeORM())
    assert dto.name == "My ERD"
    assert dto.dbml_text == "table t {}"
    assert dto.layout == {"nodes": []}
    assert isinstance(dto.id, uuid.UUID)
    assert isinstance(dto.user_id, uuid.UUID)
    assert dto.glyph == "🗄️"
    assert dto.color == "blue"
    assert dto.bg_color == "transparent"
