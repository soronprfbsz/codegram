"""add rbac: roles, permissions, role_permissions + user.role_id/must_change_password

ADR-0016: global RBAC for Codegram's own accounts. Creates roles/permissions/
role_permissions, adds user.role_id (FK -> roles.id, ON DELETE SET NULL) and
user.must_change_password, then seeds:
- roles: admin, user
- permissions: user:read, user:manage
- role_permissions: admin -> {user:read, user:manage}, user -> {user:read}
- backfill: every existing user row gets role_id = the "user" role's id.

Revision ID: 753699a5f483
Revises: d1e2f3a4b5c6
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '753699a5f483'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'roles',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_table(
        'permissions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_table(
        'role_permissions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('role_id', sa.Uuid(), nullable=False),
        sa.Column('permission_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('role_id', 'permission_id', name='uq_role_permission'),
    )
    op.create_index(op.f('ix_role_permissions_role_id'), 'role_permissions', ['role_id'], unique=False)
    op.create_index(op.f('ix_role_permissions_permission_id'), 'role_permissions', ['permission_id'], unique=False)

    op.add_column('user', sa.Column('role_id', sa.Uuid(), nullable=True))
    op.add_column(
        'user',
        sa.Column('must_change_password', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.create_foreign_key(
        'fk_user_role_id_roles',
        'user', 'roles',
        ['role_id'], ['id'],
        ondelete='SET NULL',
    )

    # --- seed ---
    bind = op.get_bind()

    bind.execute(
        sa.text("INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'admin'), (gen_random_uuid(), 'user')")
    )
    bind.execute(
        sa.text(
            "INSERT INTO permissions (id, code, description) VALUES "
            "(gen_random_uuid(), 'user:read', 'View user accounts'), "
            "(gen_random_uuid(), 'user:manage', 'Create/update/delete user accounts')"
        )
    )

    admin_role_id = bind.execute(sa.text("SELECT id FROM roles WHERE name = 'admin'")).scalar_one()
    user_role_id = bind.execute(sa.text("SELECT id FROM roles WHERE name = 'user'")).scalar_one()
    read_perm_id = bind.execute(sa.text("SELECT id FROM permissions WHERE code = 'user:read'")).scalar_one()
    manage_perm_id = bind.execute(sa.text("SELECT id FROM permissions WHERE code = 'user:manage'")).scalar_one()

    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (id, role_id, permission_id) VALUES "
            "(gen_random_uuid(), :admin_role_id, :read_perm_id), "
            "(gen_random_uuid(), :admin_role_id, :manage_perm_id), "
            "(gen_random_uuid(), :user_role_id, :read_perm_id)"
        ),
        {
            "admin_role_id": admin_role_id,
            "read_perm_id": read_perm_id,
            "manage_perm_id": manage_perm_id,
            "user_role_id": user_role_id,
        },
    )

    bind.execute(
        sa.text('UPDATE "user" SET role_id = :user_role_id WHERE role_id IS NULL'),
        {"user_role_id": user_role_id},
    )


def downgrade() -> None:
    op.drop_constraint('fk_user_role_id_roles', 'user', type_='foreignkey')
    op.drop_column('user', 'must_change_password')
    op.drop_column('user', 'role_id')
    op.drop_index(op.f('ix_role_permissions_permission_id'), table_name='role_permissions')
    op.drop_index(op.f('ix_role_permissions_role_id'), table_name='role_permissions')
    op.drop_table('role_permissions')
    op.drop_table('permissions')
    op.drop_table('roles')
