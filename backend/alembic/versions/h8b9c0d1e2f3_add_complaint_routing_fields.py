"""add_complaint_routing_fields

Revision ID: h8b9c0d1e2f3
Revises: g7a8b9c0d1e2
Create Date: 2026-11-26 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'h8b9c0d1e2f3'
down_revision = 'g7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('complaints', sa.Column('nodal_officer_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_complaints_nodal_officer_id_officers',
        'complaints',
        'officers',
        ['nodal_officer_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_complaints_nodal_officer_id', 'complaints', ['nodal_officer_id'])

    op.add_column('complaints', sa.Column('assigned_inspector_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_complaints_assigned_inspector_id_officers',
        'complaints',
        'officers',
        ['assigned_inspector_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_complaints_assigned_inspector_id',
        'complaints',
        ['assigned_inspector_id'],
    )

    op.add_column('complaints', sa.Column('verification_inspector_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_complaints_verification_inspector_id_officers',
        'complaints',
        'officers',
        ['verification_inspector_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_complaints_verification_inspector_id',
        'complaints',
        ['verification_inspector_id'],
    )

    op.add_column('complaints', sa.Column('assigned_team_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_complaints_assigned_team_id_teams',
        'complaints',
        'teams',
        ['assigned_team_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_complaints_assigned_team_id', 'complaints', ['assigned_team_id'])

    op.add_column('complaints', sa.Column('rework_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('complaints', 'rework_reason')

    op.drop_index('ix_complaints_assigned_team_id', table_name='complaints')
    op.drop_constraint('fk_complaints_assigned_team_id_teams', 'complaints', type_='foreignkey')
    op.drop_column('complaints', 'assigned_team_id')

    op.drop_index(
        'ix_complaints_verification_inspector_id',
        table_name='complaints',
    )
    op.drop_constraint(
        'fk_complaints_verification_inspector_id_officers',
        'complaints',
        type_='foreignkey',
    )
    op.drop_column('complaints', 'verification_inspector_id')

    op.drop_index('ix_complaints_assigned_inspector_id', table_name='complaints')
    op.drop_constraint(
        'fk_complaints_assigned_inspector_id_officers',
        'complaints',
        type_='foreignkey',
    )
    op.drop_column('complaints', 'assigned_inspector_id')

    op.drop_index('ix_complaints_nodal_officer_id', table_name='complaints')
    op.drop_constraint('fk_complaints_nodal_officer_id_officers', 'complaints', type_='foreignkey')
    op.drop_column('complaints', 'nodal_officer_id')
