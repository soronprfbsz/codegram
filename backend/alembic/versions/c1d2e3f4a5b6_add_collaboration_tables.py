"""add collaboration: project_member, project_edit_lock, project.version

Project sharing (ADR-0015): non-owner members with a role, a volatile
single-editor lease, and an optimistic-concurrency counter on project. The
owner stays on project.user_id, so no backfill is needed.

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1a2
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'project',
        sa.Column('version', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )

    op.create_table(
        'project_member',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_project_member_project_user'),
    )
    op.create_index(op.f('ix_project_member_user_id'), 'project_member', ['user_id'], unique=False)

    op.create_table(
        'project_edit_lock',
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('locked_by', sa.Uuid(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['locked_by'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id'),
    )


def downgrade() -> None:
    op.drop_table('project_edit_lock')
    op.drop_index(op.f('ix_project_member_user_id'), table_name='project_member')
    op.drop_table('project_member')
    op.drop_column('project', 'version')
