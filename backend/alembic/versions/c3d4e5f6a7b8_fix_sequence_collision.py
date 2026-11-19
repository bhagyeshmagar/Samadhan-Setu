"""fix_complaint_number_sequence_collision

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-19 10:30:00.000000

C-03 FIX: The initial migration starts complaint_number_seq at 1001,
which collides with seeded rows SS-2026-001001 through 001003.
Restart the sequence at 100001 to avoid any collision with existing or
seeded complaint numbers.
"""
from alembic import op

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Restart sequence well above any seeded or manually-inserted complaint numbers
    op.execute("ALTER SEQUENCE complaint_number_seq RESTART WITH 100001;")


def downgrade() -> None:
    # Revert to original start (use with caution — may collide with seeded data)
    op.execute("ALTER SEQUENCE complaint_number_seq RESTART WITH 1001;")
