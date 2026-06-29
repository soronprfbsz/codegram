"""Schema-level tests for the ProjectMember ORM model."""
from app.db.base import Base
from app.models.project_member import ProjectMember


def test_project_member_table_registered_on_metadata() -> None:
    """The project_member table is registered on Base.metadata."""
    assert "project_member" in Base.metadata.tables


def test_project_member_has_expected_columns() -> None:
    """ProjectMember exposes id, project_id, user_id, role, created_at."""
    columns = {c.name for c in ProjectMember.__table__.columns}
    assert columns == {"id", "project_id", "user_id", "role", "created_at"}


def test_project_member_fks_cascade() -> None:
    """project_id -> project.id and user_id -> user.id both cascade on delete."""
    for col_name, target in (("project_id", "project"), ("user_id", "user")):
        fks = list(ProjectMember.__table__.c[col_name].foreign_keys)
        assert len(fks) == 1
        assert fks[0].column.table.name == target
        assert fks[0].ondelete == "CASCADE"


def test_project_member_unique_user_per_project() -> None:
    """A (project_id, user_id) pair is unique — one role per user per project."""
    uniques = {
        tuple(sorted(c.name for c in con.columns))
        for con in ProjectMember.__table__.constraints
        if con.__class__.__name__ == "UniqueConstraint"
    }
    assert ("project_id", "user_id") in uniques
