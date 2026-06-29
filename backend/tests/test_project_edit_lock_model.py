"""Schema-level tests for the ProjectEditLock ORM model."""
from app.db.base import Base
from app.models.project_edit_lock import ProjectEditLock


def test_project_edit_lock_table_registered_on_metadata() -> None:
    """The project_edit_lock table is registered on Base.metadata."""
    assert "project_edit_lock" in Base.metadata.tables


def test_project_edit_lock_has_expected_columns() -> None:
    """ProjectEditLock exposes project_id, locked_by, expires_at."""
    columns = {c.name for c in ProjectEditLock.__table__.columns}
    assert columns == {"project_id", "locked_by", "expires_at"}


def test_project_edit_lock_project_id_is_primary_key() -> None:
    """project_id is the PK — at most one active lease per project."""
    pk = {c.name for c in ProjectEditLock.__table__.primary_key.columns}
    assert pk == {"project_id"}


def test_project_edit_lock_fks_cascade() -> None:
    """project_id -> project.id and locked_by -> user.id both cascade on delete."""
    for col_name, target in (("project_id", "project"), ("locked_by", "user")):
        fks = list(ProjectEditLock.__table__.c[col_name].foreign_keys)
        assert len(fks) == 1
        assert fks[0].column.table.name == target
        assert fks[0].ondelete == "CASCADE"
