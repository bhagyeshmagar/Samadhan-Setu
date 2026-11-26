"""add_officer_team_id

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-26 11:10:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'g7a8b9c0d1e2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'officers',
        sa.Column('team_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_officers_team_id_teams',
        'officers',
        'teams',
        ['team_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_officers_team_id', 'officers', ['team_id'])


def downgrade() -> None:
    op.drop_index('ix_officers_team_id', table_name='officers')
    op.drop_constraint('fk_officers_team_id_teams', 'officers', type_='foreignkey')
    op.drop_column('officers', 'team_id')
