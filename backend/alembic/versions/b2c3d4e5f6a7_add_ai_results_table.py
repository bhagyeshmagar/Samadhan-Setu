"""add_ai_results_table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-23 06:05:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if 'ai_results' not in existing_tables:
        op.create_table(
            'ai_results',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('complaint_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('complaints.id', ondelete='CASCADE'), nullable=False),
            sa.Column('model_name', sa.String(length=100), server_default='Samadhan-Hybrid-Triage-v2', nullable=False),
            sa.Column('predicted_category', sa.String(length=100), nullable=True),
            sa.Column('category_confidence', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('urgency_score', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('severity_score', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('priority_score', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('overridden', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('override_reason', sa.Text(), nullable=True),
            sa.Column('raw_output', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_ai_results_complaint_id', 'ai_results', ['complaint_id'])


def downgrade() -> None:
    op.drop_index('ix_ai_results_complaint_id', table_name='ai_results')
    op.drop_table('ai_results')
