"""Schema-level tests for the Project ORM model on the shared Base."""
from app.db.base import Base
from app.models.project import Project


def test_project_table_registered_on_metadata() -> None:
    """The project table is registered on Base.metadata for create_all/autogen."""
    assert "project" in Base.metadata.tables


def test_project_has_expected_columns() -> None:
    """Project exposes id, user_id, name, dbml_text, layout, version, timestamps, glyph, color, last_edited_by."""
    columns = {c.name for c in Project.__table__.columns}
    assert columns == {
        "id",
        "user_id",
        "name",
        "dbml_text",
        "layout",
        "version",
        "created_at",
        "updated_at",
        "glyph",
        "color",
        "bg_color",
        "last_edited_by",
    }


def test_project_user_id_is_fk_to_user_with_cascade() -> None:
    """user_id references user.id and cascades on delete."""
    fks = list(Project.__table__.c.user_id.foreign_keys)
    assert len(fks) == 1
    fk = fks[0]
    assert fk.column.table.name == "user"
    assert fk.column.name == "id"
    assert fk.ondelete == "CASCADE"


def test_project_required_columns_not_nullable() -> None:
    """name, dbml_text, layout, timestamps are NOT NULL."""
    table = Project.__table__
    assert table.c.name.nullable is False
    assert table.c.dbml_text.nullable is False
    assert table.c.layout.nullable is False
    assert table.c.created_at.nullable is False
    assert table.c.updated_at.nullable is False
