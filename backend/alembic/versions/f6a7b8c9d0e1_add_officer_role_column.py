"""add_officer_role_column

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-26 10:50:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'officers',
        sa.Column(
            'officer_role',
            sa.String(length=50),
            server_default='inspection_officer',
            nullable=False,
        ),
    )
    op.create_index('ix_officers_officer_role', 'officers', ['officer_role'])


def downgrade() -> None:
    op.drop_index('ix_officers_officer_role', table_name='officers')
    op.drop_column('officers', 'officer_role')
