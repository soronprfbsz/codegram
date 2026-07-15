"""Schema-level tests for the RBAC models: Role, Permission, RolePermission,
and the role_id/must_change_password columns added to User (ADR-0016)."""
from app.db.base import Base
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User


def test_role_has_expected_columns() -> None:
    columns = {c.name for c in Role.__table__.columns}
    assert columns == {"id", "name", "created_at"}


def test_role_name_is_unique() -> None:
    assert Role.__table__.c.name.unique is True


def test_permission_has_expected_columns() -> None:
    columns = {c.name for c in Permission.__table__.columns}
    assert columns == {"id", "code", "description", "created_at"}


def test_permission_code_is_unique() -> None:
    assert Permission.__table__.c.code.unique is True


def test_role_permissions_table_registered_on_metadata() -> None:
    assert "role_permissions" in Base.metadata.tables


def test_role_permissions_has_expected_columns() -> None:
    columns = {c.name for c in RolePermission.__table__.columns}
    assert columns == {"id", "role_id", "permission_id"}


def test_role_permissions_fks_cascade() -> None:
    for col_name, target in (
        ("role_id", "roles"),
        ("permission_id", "permissions"),
    ):
        fks = list(RolePermission.__table__.c[col_name].foreign_keys)
        assert len(fks) == 1
        assert fks[0].column.table.name == target
        assert fks[0].ondelete == "CASCADE"


def test_role_permissions_unique_role_permission_pair() -> None:
    uniques = {
        tuple(sorted(c.name for c in con.columns))
        for con in RolePermission.__table__.constraints
        if con.__class__.__name__ == "UniqueConstraint"
    }
    assert ("permission_id", "role_id") in uniques


def test_user_has_role_id_and_must_change_password_columns() -> None:
    columns = {c.name for c in User.__table__.columns}
    assert {"role_id", "must_change_password"}.issubset(columns)

    role_id_col = User.__table__.c.role_id
    assert role_id_col.nullable is True
    fks = list(role_id_col.foreign_keys)
    assert len(fks) == 1
    assert fks[0].column.table.name == "roles"
    assert fks[0].ondelete == "SET NULL"

    must_change_col = User.__table__.c.must_change_password
    assert must_change_col.nullable is False
