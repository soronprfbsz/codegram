"""add project bg_color

배경색(아이콘/글씨색은 기존 color). nullable — 기존 행은 null이면 프런트가
color 틴트로 폴백하므로 데이터 마이그레이션 불필요.

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('project', sa.Column('bg_color', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('project', 'bg_color')
