"""add_workflow_user_roles

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-26 10:42:00.000000
"""
from alembic import op

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'nodal_officer'")
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'inspection_officer'")
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead'")


def downgrade() -> None:
    pass
