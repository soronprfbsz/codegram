"""add author tracking: project.last_edited_by + project_snapshot.created_by

Revision ID: d1e2f3a4b5c6
Revises: c1d2e3f4a5b6
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # project.last_edited_by — the last content editor (auto-snapshot author).
    op.add_column(
        'project',
        sa.Column('last_edited_by', sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        'fk_project_last_edited_by_user',
        'project', 'user',
        ['last_edited_by'], ['id'],
        ondelete='SET NULL',
    )
    # project_snapshot.created_by — the snapshot's attributed author.
    op.add_column(
        'project_snapshot',
        sa.Column('created_by', sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        'fk_project_snapshot_created_by_user',
        'project_snapshot', 'user',
        ['created_by'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_project_snapshot_created_by_user', 'project_snapshot',
        type_='foreignkey',
    )
    op.drop_column('project_snapshot', 'created_by')
    op.drop_constraint(
        'fk_project_last_edited_by_user', 'project', type_='foreignkey'
    )
    op.drop_column('project', 'last_edited_by')
